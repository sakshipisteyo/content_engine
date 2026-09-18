/**
 * compile: Brief + Brand + prompts/*.yaml + routes.yaml -> PromptPlan.
 *
 * compileBase() is deterministic and calls NO provider — it interpolates the YAML
 * templates and computes estimated_credits from routes.yaml. This is what --dry-run
 * uses (SPEC: dry-run compiles + prints credits with zero provider calls). In a real
 * run the compile STAGE may additionally refine the plan through Claude (JSON mode);
 * that refiner is injected so this module never imports a provider SDK directly.
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  type Brief,
  type Brand,
  type Routes,
  type PromptsFile,
  type PromptPlan,
  type Shot,
  type Versions,
  type Aspect,
  PLATFORM_ASPECT,
  PromptPlanSchema,
} from "./schemas";
import { PATHS, ConfigError } from "./config";
import { interpolate } from "./text";

export interface CompilePrompts {
  image: PromptsFile;
  video: PromptsFile;
  copy: PromptsFile;
}

export interface CompileInput {
  brief: Brief;
  brand: Brand;
  prompts: CompilePrompts;
  routes: Routes;
  versions: Versions;
  brandKey: string;
}

/** Camera moves cycled across video variants (kept short + generic). */
const CAMERA_MOVES = [
  "slow push-in, handheld feel",
  "gentle left-to-right dolly",
  "subtle crane down to the product",
];

/** Resolve a brand-relative asset path to an absolute path under brand/<brandKey>/. */
export function brandAssetPath(brandKey: string, rel: string): string {
  return join(PATHS.brand, brandKey, rel);
}

/** Build the token map shared by every prompt template. */
function baseTokens(input: CompileInput, aspect: Aspect): Record<string, string> {
  const { brief, brand } = input;
  const anchor = brand.style_anchors[brief.style_anchor];
  if (!anchor) {
    throw new ConfigError(
      `Brief ${brief.id}: style_anchor "${brief.style_anchor}" not found in brand ${input.brandKey}.`,
    );
  }
  const productNames = brief.products.map((key) => {
    const p = brand.products[key];
    if (!p) {
      throw new ConfigError(
        `Brief ${brief.id}: product "${key}" not found in brand ${input.brandKey}.`,
      );
    }
    return p.name;
  });
  return {
    brand_name: brand.name,
    category: brand.category,
    audience: brand.audience,
    tone: brand.tone.join(", "),
    palette: brand.palette.join(", "),
    banned_words: brand.banned_words.join(", "),
    banned_visuals: brand.banned_visuals.join(", "),
    product_name: productNames.join(" and "),
    hook: brief.hook,
    angle: brief.angle,
    cta: brief.cta,
    platform: brief.platform,
    aspect,
    style_description: anchor.description,
  };
}

/** Reference images = style-anchor references + product shots, resolved absolute. */
function referenceImages(input: CompileInput): string[] {
  const { brief, brand } = input;
  const anchor = brand.style_anchors[brief.style_anchor];
  const refs = new Set<string>();
  for (const r of anchor?.references ?? []) refs.add(brandAssetPath(input.brandKey, r));
  for (const key of brief.products) {
    for (const img of brand.products[key]?.images ?? []) {
      refs.add(brandAssetPath(input.brandKey, img));
    }
  }
  return [...refs];
}

/** Estimated Higgsfield credits (SPEC: printed by dry-run; from routes.yaml). */
export function estimateCredits(brief: Brief, routes: Routes): number {
  const heroes = brief.variants * routes.image.credits_per_image;
  if (brief.format === "image") return heroes;
  const clips = Math.min(2, brief.variants); // motion runs on the top 2 heroes
  const motion = clips * routes.video.duration_seconds * routes.video.credits_per_second;
  return heroes + motion;
}

/** Deterministic PromptPlan — no provider calls. */
export function compileBase(input: CompileInput): PromptPlan {
  const { brief, brand, prompts, routes } = input;
  const aspect: Aspect = brief.format === "video" ? "9:16" : PLATFORM_ASPECT[brief.platform];
  const tokens = baseTokens(input, aspect);
  const refs = referenceImages(input);

  const shots: Shot[] = [];
  for (let v = 1; v <= brief.variants; v++) {
    const camera = CAMERA_MOVES[(v - 1) % CAMERA_MOVES.length]!;
    const shotTokens = { ...tokens, camera };
    const shot: Shot = {
      variant: v,
      image_prompt: interpolate(prompts.image.template, shotTokens),
      negative_prompt: interpolate(prompts.image.negative, shotTokens),
      reference_images: refs,
      aspect,
    };
    if (brief.format === "video") {
      shot.video_prompt = interpolate(prompts.video.template, shotTokens);
      shot.camera = camera;
    }
    shots.push(shot);
  }

  const caption = `${brief.hook} ${brief.cta}`.trim();
  const hashtags = deriveHashtags(brand, brief);
  const script =
    brief.format === "video" ? `${brief.hook} ${brief.cta}`.trim() : undefined;

  const plan: PromptPlan = {
    brief_id: brief.id,
    brand: input.brandKey,
    format: brief.format,
    platform: brief.platform,
    shots,
    copy: { caption, hashtags, ...(script ? { script } : {}) },
    routing: {
      image_model: routes.image.endpoint,
      video_model: brief.format === "video" ? routes.video.endpoint : null,
      copy_model: routes.copy.model,
      score_model: routes.score.model,
      voice_model: brief.format === "video" ? routes.voice.model : null,
    },
    estimated_credits: estimateCredits(brief, routes),
    versions: input.versions,
  };

  // Validate our own output shape (SPEC: compile output is a contract).
  return PromptPlanSchema.parse(plan);
}

/** Simple deterministic hashtag seed from brand + product tokens. */
function deriveHashtags(brand: Brand, brief: Brief): string[] {
  const slug = (s: string) =>
    "#" + s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
  const tags = new Set<string>();
  tags.add(slug(brand.name.replace(/\s+studio$/i, "")));
  for (const key of brief.products) {
    const p = brand.products[key];
    if (p) tags.add(slug(p.name));
  }
  tags.add(slug(brand.category));
  tags.add("#handcrafted");
  tags.add("#slowfashion");
  return [...tags].slice(0, 8);
}

/** Optional real-mode refinement hook (injected; not used by dry-run). */
export type PlanRefiner = (base: PromptPlan) => Promise<PromptPlan>;

export async function compile(
  input: CompileInput,
  refiner?: PlanRefiner,
): Promise<PromptPlan> {
  const base = compileBase(input);
  if (!refiner) return base;
  const refined = await refiner(base);
  return PromptPlanSchema.parse(refined);
}

/** Warn (return list) about reference images that do not exist on disk. */
export function missingReferenceImages(plan: PromptPlan): string[] {
  const missing: string[] = [];
  for (const shot of plan.shots) {
    for (const ref of shot.reference_images) {
      if (!existsSync(ref)) missing.push(ref);
    }
  }
  return [...new Set(missing)];
}
