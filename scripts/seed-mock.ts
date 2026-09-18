/**
 * Dev utility: fabricate a realistic out/ dataset + ledger so the review board is
 * fully clickable on localhost WITHOUT any provider calls or keys. Uses the placeholder
 * brand assets as stand-in heroes and writes synthetic score cards + ledger rows.
 *   tsx scripts/seed-mock.ts
 * Real runs overwrite this once keys are added; delete out/ and data/ for a clean slate.
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  PATHS,
  loadAllBriefs,
  loadBrand,
  loadRoutes,
  loadPrompts,
  computeVersions,
  compileBase,
  brandAssetPath,
  openLedger,
  now,
  type Brand,
  type Brief,
  type Aspect,
  type ScoreCard,
  type SoftScores,
} from "../packages/engine/src/index";

const SIZE: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "16:9": { w: 1280, h: 720 },
};

function heroSource(brand: Brand, brief: Brief): string | null {
  const prod = brand.products[brief.products[0]!];
  const cands = [
    ...(prod?.images ?? []),
    ...(brand.style_anchors[brief.style_anchor]?.references ?? []),
    brand.logo,
  ];
  for (const c of cands) {
    const p = brandAssetPath(brief.brand, c);
    if (existsSync(p)) return p;
  }
  return null;
}

async function writeImage(src: string | null, dest: string, aspect: Aspect, asPng: boolean) {
  const { w, h } = SIZE[aspect];
  const pipe = src
    ? sharp(src).resize(w, h, { fit: "cover", position: "attention" })
    : sharp({ create: { width: w, height: h, channels: 3, background: "#B5471F" } });
  await (asPng ? pipe.png() : pipe.jpeg({ quality: 86 })).toFile(dest);
}

function softFor(v: number): SoftScores {
  const base = Math.max(2.5, Math.min(5, 4.7 - (v - 1) * 0.4));
  const r = (x: number) => Math.round(Math.min(5, Math.max(1, x)) * 10) / 10;
  return {
    brand_fit: r(base),
    product_clarity: r(base - 0.1),
    hook_strength: r(base + 0.05),
    platform_fit: r(base - 0.05),
  };
}

async function main() {
  // Clean slate.
  rmSync(PATHS.out, { recursive: true, force: true });
  rmSync(PATHS.ledger, { force: true });

  const routes = loadRoutes();
  const prompts = loadPrompts();
  const { briefs, errors } = loadAllBriefs();
  if (errors.length) {
    console.error("brief errors:", errors);
    process.exit(1);
  }
  const ledger = openLedger();
  const runId = "seed-mock";

  for (const { brief } of briefs) {
    const brand = loadBrand(brief.brand);
    const versions = computeVersions(brief.brand);
    const plan = compileBase({ brief, brand, prompts, routes, versions, brandKey: brief.brand });
    const dir = join(PATHS.out, brief.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.json"), JSON.stringify(plan, null, 2));
    writeFileSync(join(dir, "brief.json"), JSON.stringify(brief, null, 2));

    const src = heroSource(brand, brief);
    const isVideo = brief.format === "video";
    const heroCredits = routes.image.credits_per_image;

    ledger.recordStage(row(runId, brief.id, null, "compile", null, 0, 2.1, "ok"));

    // One variant is a hard-fail (hidden) when there are >= 3 variants.
    const hiddenVariant = brief.variants >= 3 ? brief.variants : -1;
    const cards: ScoreCard[] = [];

    for (const shot of plan.shots) {
      const v = shot.variant;
      const vdir = join(dir, `v${v}`);
      mkdirSync(vdir, { recursive: true });
      await writeImage(src, join(vdir, "hero.png"), shot.aspect, true);

      const hidden = v === hiddenVariant;
      ledger.recordStage(
        row(runId, brief.id, v, "hero", routes.image.endpoint, heroCredits, 7.5, "ok"),
      );
      ledger.recordStage(
        row(runId, brief.id, v, "score-1", routes.score.model, 0, 3.0, hidden ? "flagged" : "ok", hidden ? "legibility" : null),
      );

      const soft = hidden ? null : softFor(v);
      const total = soft ? soft.brand_fit + soft.product_clarity + soft.hook_strength + soft.platform_fit : 0;
      cards.push({
        brief_id: brief.id,
        variant: v,
        stage: "score-1",
        hard_fails: hidden ? ["legibility"] : [],
        soft,
        total,
        rank: null,
        reasons: hidden
          ? ["overlaid hook text fails legibility at thumbnail size"]
          : ["palette matches brand", "product reads clearly", "hook lands in first second"],
      });
    }

    // Rank survivors.
    const survivors = cards.filter((c) => c.hard_fails.length === 0).sort((a, b) => b.total - a.total);
    survivors.forEach((c, i) => (c.rank = i + 1));

    // Video-only stages on top 2 survivors.
    if (isVideo) {
      for (const c of survivors.slice(0, 2)) {
        ledger.recordStage(
          row(runId, brief.id, c.variant, "motion", routes.video.endpoint, routes.video.duration_seconds * routes.video.credits_per_second, 41.0, "ok"),
        );
        ledger.recordStage(row(runId, brief.id, c.variant, "voice", routes.voice.model, 0, 4.6, "ok"));
      }
    }

    ledger.recordStage(row(runId, brief.id, null, "copy", routes.copy.model, 0, 3.8, "ok"));

    // Assemble + score-2 per survivor; write finals + caption + score.json.
    for (const c of survivors) {
      const vdir = join(dir, `v${c.variant}`);
      if (!isVideo) {
        await writeImage(src, join(vdir, "final_4x5.jpg"), "4:5", false);
        await writeImage(src, join(vdir, "final_1x1.jpg"), "1:1", false);
        await writeImage(src, join(vdir, "final_9x16.jpg"), "9:16", false);
      }
      writeFileSync(
        join(vdir, "caption.txt"),
        `${plan.copy.caption}\n\n${plan.copy.hashtags.join(" ")}`,
      );
      ledger.recordStage(row(runId, brief.id, c.variant, "assemble", null, 0, 5.4, "ok"));
      ledger.recordStage(row(runId, brief.id, c.variant, "score-2", routes.score.model, 0, 2.2, "ok"));
    }

    // Persist every score card (survivors + hidden) as score.json.
    for (const c of cards) {
      writeFileSync(join(dir, `v${c.variant}`, "score.json"), JSON.stringify(c, null, 2));
    }
    console.log(`seeded ${brief.id} (${brief.format}, ${survivors.length} survivors)`);
  }

  // A couple of human decisions so /report has ratings + agreement.
  ledger.recordDecision({ brief_id: "banj-002", variant: 1, action: "approve", note: "warm light, on-brand", rating: 5, decided_at: now() });
  ledger.recordDecision({ brief_id: "banj-003", variant: 1, action: "approve", note: "good founder tone", rating: 4, decided_at: now() });
  ledger.close();
  console.log("\nMock data seeded. Start the board: pnpm --filter review dev  ->  http://localhost:3000");
}

function row(
  run_id: string,
  brief_id: string,
  variant: number | null,
  stage: string,
  model: string | null,
  credits: number,
  seconds: number,
  status: string,
  error: string | null = null,
) {
  return {
    run_id,
    brief_id,
    variant,
    stage: stage as never,
    model,
    credits,
    seconds,
    status: status as never,
    error,
    started_at: now(),
  };
}

main();
