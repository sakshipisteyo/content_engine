/**
 * Pipeline: runs the SPEC section-5 stages for one brief. Every stage writes exactly
 * one ledger row (including failures), is idempotent by (brief_id, variant, stage)
 * via the ledger + existing output files, and enforces the per-brief credit cap.
 * Provider calls run at p-limit concurrency 2. Exercised at A3-A6.
 */
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pLimit from "p-limit";
import {
  type Brand,
  type Brief,
  type Routes,
  type ScoreConfig,
  type Versions,
  type PromptPlan,
  type ScoreCard,
  type Shot,
  type RubricResult,
  type StageName,
  type Template,
  RubricResultSchema,
  CROP_ASPECTS,
} from "./schemas";
import { PATHS } from "./config";
import { compileBase, type CompilePrompts, brandAssetPath } from "./compile";
import { loadTemplate } from "./load";
import { loadBrandMemory } from "./memory";
import { openLedger, now, type Ledger } from "./ledger";
import * as higgs from "./providers/higgsfield";
import * as eleven from "./providers/elevenlabs";
import { vision, type ObjectSchema } from "./providers/anthropic";
import {
  hardChecks,
  buildRubric,
  mergeRubricHardFails,
  buildScoreCard,
  rankCards,
} from "./score";
import { refineCopy, hasBannedWord } from "./refine";
import { assembleImage, assembleVideo, writeCaption, hasFfmpeg } from "./assemble";
import { downloadToFile } from "./media";

export interface PipelineCtx {
  brandKey: string;
  brand: Brand;
  prompts: CompilePrompts;
  routes: Routes;
  scoreConfig: ScoreConfig;
  versions: Versions;
  ledger: Ledger;
  runId: string;
  concurrency: number;
}

export interface BriefResult {
  brief_id: string;
  status: "ok" | "capped" | "failed";
  spent_credits: number;
  survivors: number;
}

const RUBRIC_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    soft: {
      type: "object",
      properties: {
        brand_fit: { type: "number" },
        product_clarity: { type: "number" },
        hook_strength: { type: "number" },
        platform_fit: { type: "number" },
      },
      required: ["brand_fit", "product_clarity", "hook_strength", "platform_fit"],
      additionalProperties: false,
    },
    banned_visual: { type: "boolean" },
    artefacts: { type: "boolean" },
    legibility_ok: { type: "boolean" },
    reasons: { type: "array", items: { type: "string" } },
  },
  required: ["soft", "banned_visual", "artefacts", "legibility_ok", "reasons"],
  additionalProperties: false,
};

const briefDir = (id: string) => join(PATHS.out, id);
const variantDir = (id: string, v: number) => join(PATHS.out, id, `v${v}`);

function record(
  ctx: PipelineCtx,
  fields: {
    brief_id: string;
    variant: number | null;
    stage: StageName;
    model?: string | null;
    credits?: number;
    seconds?: number;
    status?: "ok" | "failed" | "skipped" | "capped" | "flagged";
    error?: string | null;
    started_at: string;
  },
): void {
  ctx.ledger.recordStage({
    run_id: ctx.runId,
    brief_id: fields.brief_id,
    variant: fields.variant,
    stage: fields.stage,
    model: fields.model ?? null,
    credits: fields.credits ?? 0,
    seconds: fields.seconds ?? 0,
    status: fields.status ?? "ok",
    error: fields.error ?? null,
    started_at: fields.started_at,
  });
}

const elapsed = (start: number) => (Date.now() - start) / 1000;

/** Build the PromptPlan and persist it. Records the compile stage row once. */
function stageCompile(ctx: PipelineCtx, brief: Brief, template?: Template): PromptPlan {
  const plan = compileBase({
    brief,
    brand: ctx.brand,
    prompts: ctx.prompts,
    routes: ctx.routes,
    versions: ctx.versions,
    brandKey: ctx.brandKey,
    memory: loadBrandMemory(ctx.brandKey, ctx.ledger),
    template,
  });
  mkdirSync(briefDir(brief.id), { recursive: true });
  writeFileSync(join(briefDir(brief.id), "prompt.json"), JSON.stringify(plan, null, 2));
  writeFileSync(join(briefDir(brief.id), "brief.json"), JSON.stringify(brief, null, 2));
  if (!ctx.ledger.stageDone(brief.id, null, "compile")) {
    record(ctx, {
      brief_id: brief.id,
      variant: null,
      stage: "compile",
      status: "ok",
      started_at: now(),
    });
  }
  return plan;
}

/** Higgsfield text-to-image input for a shot, from routes.yaml. */
function heroInput(ctx: PipelineCtx, shot: Shot): Record<string, unknown> {
  const [w, h] = shot.aspect.split(":").map(Number);
  const long = 1152;
  const width = (w ?? 1) >= (h ?? 1) ? long : Math.round((long * (w ?? 1)) / (h ?? 1));
  const height = (h ?? 1) > (w ?? 1) ? long : Math.round((long * (h ?? 1)) / (w ?? 1));
  return {
    prompt: shot.image_prompt,
    width_and_height: `${width}x${height}`,
    quality: ctx.routes.image.quality,
    batch_size: ctx.routes.image.batch_size,
    enhance_prompt: true,
  };
}

/** Generate heroes within the credit cap. Returns generated variant numbers + spend. */
async function stageHero(
  ctx: PipelineCtx,
  brief: Brief,
  plan: PromptPlan,
): Promise<{ generated: number[]; spent: number; capped: boolean }> {
  const cost = ctx.routes.image.credits_per_image;
  const limit = pLimit(ctx.concurrency);
  let spent = 0;
  const generated: number[] = [];
  const todo: Shot[] = [];

  for (const shot of plan.shots) {
    const dir = variantDir(brief.id, shot.variant);
    mkdirSync(dir, { recursive: true });
    const hero = join(dir, "hero.png");
    if (existsSync(hero) && ctx.ledger.stageDone(brief.id, shot.variant, "hero")) {
      generated.push(shot.variant);
      spent += cost;
      continue;
    }
    if (spent + cost > brief.credit_cap) {
      record(ctx, {
        brief_id: brief.id,
        variant: shot.variant,
        stage: "hero",
        model: ctx.routes.image.endpoint,
        credits: 0,
        status: "capped",
        error: `credit_cap ${brief.credit_cap} reached (spent ${spent}, next +${cost})`,
        started_at: now(),
      });
      return { generated, spent, capped: true };
    }
    spent += cost;
    todo.push(shot);
  }

  await Promise.all(
    todo.map((shot) =>
      limit(async () => {
        const start = Date.now();
        const hero = join(variantDir(brief.id, shot.variant), "hero.png");
        try {
          const res = await higgs.generate(ctx.routes.image.endpoint, heroInput(ctx, shot));
          await downloadToFile(res.urls[0]!, hero);
          generated.push(shot.variant);
          record(ctx, {
            brief_id: brief.id,
            variant: shot.variant,
            stage: "hero",
            model: ctx.routes.image.endpoint,
            credits: cost,
            seconds: elapsed(start),
            status: "ok",
            started_at: now(),
          });
        } catch (e) {
          record(ctx, {
            brief_id: brief.id,
            variant: shot.variant,
            stage: "hero",
            model: ctx.routes.image.endpoint,
            credits: cost,
            seconds: elapsed(start),
            status: "failed",
            error: (e as Error).message,
            started_at: now(),
          });
        }
      }),
    ),
  );
  generated.sort((a, b) => a - b);
  return { generated, spent, capped: false };
}

/** Score-1: deterministic hard checks + vision rubric per generated hero. */
async function stageScore1(
  ctx: PipelineCtx,
  brief: Brief,
  plan: PromptPlan,
  variants: number[],
): Promise<ScoreCard[]> {
  const limit = pLimit(ctx.concurrency);
  const tokens = rubricTokens(ctx, brief);
  const cards = await Promise.all(
    variants.map((v) =>
      limit(async () => {
        const start = Date.now();
        const shot = plan.shots.find((s) => s.variant === v)!;
        const hero = join(variantDir(brief.id, v), "hero.png");
        const hard = await hardChecks(hero, shot.aspect, ctx.brand, ctx.scoreConfig);
        let rubric: RubricResult | null = null;
        if (hard.length === 0) {
          try {
            const raw = await vision([hero], buildRubric(ctx.scoreConfig, tokens), RUBRIC_SCHEMA, {
              model: ctx.routes.score.model,
              system: ctx.scoreConfig.system,
            });
            const parsed = RubricResultSchema.safeParse(raw);
            rubric = parsed.success ? parsed.data : null;
          } catch {
            rubric = null;
          }
        }
        const allHard = rubric ? mergeRubricHardFails(hard, rubric) : hard;
        const card = buildScoreCard(brief.id, v, "score-1", allHard, rubric);
        writeFileSync(
          join(variantDir(brief.id, v), "score.json"),
          JSON.stringify(card, null, 2),
        );
        record(ctx, {
          brief_id: brief.id,
          variant: v,
          stage: "score-1",
          model: ctx.routes.score.model,
          seconds: elapsed(start),
          status: allHard.length ? "flagged" : "ok",
          error: allHard.length ? allHard.join(",") : null,
          started_at: now(),
        });
        return card;
      }),
    ),
  );
  return rankCards(cards);
}

function rubricTokens(ctx: PipelineCtx, brief: Brief): Record<string, string> {
  const productNames = brief.products.map((k) => ctx.brand.products[k]?.name ?? k).join(" and ");
  return {
    brand_name: ctx.brand.name,
    category: ctx.brand.category,
    audience: ctx.brand.audience,
    tone: ctx.brand.tone.join(", "),
    platform: brief.platform,
    hook: brief.hook,
    product_name: productNames,
    palette: ctx.brand.palette.join(", "),
    banned_visuals: ctx.brand.banned_visuals.join(", "),
  };
}

/** Motion: image-to-video on the top-2 surviving heroes (video briefs only). */
async function stageMotion(
  ctx: PipelineCtx,
  brief: Brief,
  plan: PromptPlan,
  ranked: ScoreCard[],
  spentSoFar: number,
): Promise<{ clips: number[]; spent: number; capped: boolean }> {
  const survivors = ranked.filter((c) => c.hard_fails.length === 0).slice(0, 2);
  const perClip = ctx.routes.video.duration_seconds * ctx.routes.video.credits_per_second;
  const limit = pLimit(ctx.concurrency);
  let spent = spentSoFar;
  const clips: number[] = [];
  const todo: number[] = [];

  for (const card of survivors) {
    const clip = join(variantDir(brief.id, card.variant), "clip.mp4");
    if (existsSync(clip) && ctx.ledger.stageDone(brief.id, card.variant, "motion")) {
      clips.push(card.variant);
      spent += perClip;
      continue;
    }
    if (spent + perClip > brief.credit_cap) {
      record(ctx, {
        brief_id: brief.id,
        variant: card.variant,
        stage: "motion",
        model: ctx.routes.video.endpoint,
        status: "capped",
        error: `credit_cap ${brief.credit_cap} reached (spent ${spent}, next +${perClip})`,
        started_at: now(),
      });
      return { clips, spent, capped: true };
    }
    spent += perClip;
    todo.push(card.variant);
  }

  await Promise.all(
    todo.map((v) =>
      limit(async () => {
        const start = Date.now();
        const shot = plan.shots.find((s) => s.variant === v)!;
        const hero = join(variantDir(brief.id, v), "hero.png");
        const clip = join(variantDir(brief.id, v), "clip.mp4");
        try {
          const heroUrl = await uploadHeroPlaceholder(hero);
          const res = await higgs.generate(ctx.routes.video.endpoint, {
            model: ctx.routes.video.model,
            prompt: shot.video_prompt ?? shot.image_prompt,
            input_images: [{ type: "image_url", image_url: heroUrl }],
          });
          await downloadToFile(res.urls[0]!, clip);
          clips.push(v);
          record(ctx, {
            brief_id: brief.id,
            variant: v,
            stage: "motion",
            model: ctx.routes.video.endpoint,
            credits: perClip,
            seconds: elapsed(start),
            status: "ok",
            started_at: now(),
          });
        } catch (e) {
          record(ctx, {
            brief_id: brief.id,
            variant: v,
            stage: "motion",
            model: ctx.routes.video.endpoint,
            credits: perClip,
            seconds: elapsed(start),
            status: "failed",
            error: (e as Error).message,
            started_at: now(),
          });
        }
      }),
    ),
  );
  return { clips, spent, capped: false };
}

/**
 * DoP needs a public image_url for the hero. Hosting local files is a post-go-ahead
 * integration detail (upload to Higgsfield assets or a temp host). Flagged in
 * blockers until wired; throws so the motion stage records a clear failure.
 */
async function uploadHeroPlaceholder(_hero: string): Promise<string> {
  throw new Error(
    "hero upload not wired: DoP needs a public image_url. Wire Higgsfield asset upload before A4.",
  );
}

/** Orchestrate one brief through every stage for its format. */
export async function runBrief(
  ctx: PipelineCtx,
  brief: Brief,
): Promise<BriefResult> {
  const template = brief.template ? loadTemplate(brief.template) : undefined;
  const plan = stageCompile(ctx, brief, template);

  const heroRes = await stageHero(ctx, brief, plan);
  if (heroRes.generated.length === 0) {
    return {
      brief_id: brief.id,
      status: heroRes.capped ? "capped" : "failed",
      spent_credits: heroRes.spent,
      survivors: 0,
    };
  }

  const ranked = await stageScore1(ctx, brief, plan, heroRes.generated);
  let survivors = ranked.filter((c) => c.hard_fails.length === 0);
  let spent = heroRes.spent;
  let capped = heroRes.capped;

  if (brief.format === "video" && survivors.length > 0 && !capped) {
    const motion = await stageMotion(ctx, brief, plan, ranked, spent);
    spent = motion.spent;
    capped = motion.capped;
  }

  // Copy (stage 5) — Claude, with a single banned-word retry.
  await stageCopy(ctx, brief, plan, template);

  // Voice (stage 6) — ElevenLabs, video only; on error continue + flag.
  if (brief.format === "video") {
    await stageVoice(ctx, brief, plan, survivors.map((c) => c.variant));
  }

  // Assemble (stage 7) per surviving variant.
  await stageAssemble(ctx, brief, plan, survivors.map((c) => c.variant));

  // Score-2 (stage 8) — re-rank finals (nothing dropped here).
  await stageScore2(ctx, brief, survivors.map((c) => c.variant));

  return {
    brief_id: brief.id,
    status: capped ? "capped" : "ok",
    spent_credits: spent,
    survivors: survivors.length,
  };
}

async function stageCopy(
  ctx: PipelineCtx,
  brief: Brief,
  plan: PromptPlan,
  template?: Template,
): Promise<void> {
  const start = Date.now();
  const copyStyle = template?.copy_style ?? "";
  try {
    let copy = await refineCopy(ctx.brand, brief, ctx.prompts.copy, ctx.routes.copy.model, copyStyle);
    let banned = hasBannedWord(copy, ctx.brand.banned_words);
    if (banned) {
      copy = await refineCopy(ctx.brand, brief, ctx.prompts.copy, ctx.routes.copy.model, copyStyle);
      banned = hasBannedWord(copy, ctx.brand.banned_words);
    }
    plan.copy = copy;
    writeFileSync(join(briefDir(brief.id), "prompt.json"), JSON.stringify(plan, null, 2));
    record(ctx, {
      brief_id: brief.id,
      variant: null,
      stage: "copy",
      model: ctx.routes.copy.model,
      seconds: elapsed(start),
      status: banned ? "flagged" : "ok",
      error: banned ? `banned word after retry: ${banned}` : null,
      started_at: now(),
    });
  } catch (e) {
    record(ctx, {
      brief_id: brief.id,
      variant: null,
      stage: "copy",
      model: ctx.routes.copy.model,
      seconds: elapsed(start),
      status: "failed",
      error: (e as Error).message,
      started_at: now(),
    });
  }
}

async function stageVoice(
  ctx: PipelineCtx,
  brief: Brief,
  plan: PromptPlan,
  variants: number[],
): Promise<void> {
  const script = plan.copy.script;
  if (!script) return;
  for (const v of variants) {
    const dir = variantDir(brief.id, v);
    if (!existsSync(join(dir, "clip.mp4"))) continue; // VO only for clips
    const start = Date.now();
    try {
      const buf = await eleven.speak(script, ctx.brand.voice_id, {
        model: ctx.routes.voice.model,
        outputFormat: ctx.routes.voice.output_format,
      });
      writeFileSync(join(dir, "vo.wav"), buf);
      record(ctx, {
        brief_id: brief.id,
        variant: v,
        stage: "voice",
        model: ctx.routes.voice.model,
        seconds: elapsed(start),
        status: "ok",
        started_at: now(),
      });
    } catch (e) {
      record(ctx, {
        brief_id: brief.id,
        variant: v,
        stage: "voice",
        model: ctx.routes.voice.model,
        seconds: elapsed(start),
        status: "flagged",
        error: `VO skipped: ${(e as Error).message}`,
        started_at: now(),
      });
    }
  }
}

async function stageScore2(
  ctx: PipelineCtx,
  brief: Brief,
  variants: number[],
): Promise<void> {
  // Spike: re-use score-1 ranking (already in each variant's score.json). Record a
  // score-2 row per survivor so the ledger reflects the stage. See DECISIONS.md.
  for (const v of variants) {
    record(ctx, {
      brief_id: brief.id,
      variant: v,
      stage: "score-2",
      model: ctx.routes.score.model,
      status: "ok",
      started_at: now(),
    });
  }
}

async function stageAssemble(
  ctx: PipelineCtx,
  brief: Brief,
  plan: PromptPlan,
  variants: number[],
): Promise<void> {
  const logo = brandAssetPath(ctx.brandKey, ctx.brand.logo);
  const logoPath = existsSync(logo) ? logo : undefined;
  const ffmpegOk = brief.format === "video" ? await hasFfmpeg() : true;

  for (const v of variants) {
    const start = Date.now();
    const dir = variantDir(brief.id, v);
    writeCaption(dir, plan.copy.caption, plan.copy.hashtags);
    try {
      if (brief.format === "image") {
        await assembleImage(join(dir, "hero.png"), dir, CROP_ASPECTS, logoPath);
      } else {
        if (!ffmpegOk) throw new Error("ffmpeg not on PATH (winget install Gyan.FFmpeg)");
        const vo = join(dir, "vo.wav");
        await assembleVideo({
          clipPath: join(dir, "clip.mp4"),
          voPath: existsSync(vo) ? vo : undefined,
          logoPath,
          caption: plan.copy.caption,
          outDir: dir,
          aspects: CROP_ASPECTS,
        });
      }
      record(ctx, {
        brief_id: brief.id,
        variant: v,
        stage: "assemble",
        seconds: elapsed(start),
        status: "ok",
        started_at: now(),
      });
    } catch (e) {
      record(ctx, {
        brief_id: brief.id,
        variant: v,
        stage: "assemble",
        seconds: elapsed(start),
        status: "failed",
        error: (e as Error).message,
        started_at: now(),
      });
    }
  }
}
