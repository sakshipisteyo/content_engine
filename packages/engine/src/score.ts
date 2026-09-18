/**
 * Scoring. Deterministic hard checks run FIRST and need no LLM (SPEC section 5):
 *   - aspect ratio within tolerance of requested
 *   - mean colour distance to the brand palette below score.yaml threshold
 *   - file decodes and is not blank
 * Then the vision rubric (injected, calls Claude) returns the four soft scores.
 * The pure helpers are exported so unit tests can exercise every hard check.
 */
import sharp from "sharp";
import {
  type Aspect,
  type Brand,
  type ScoreConfig,
  type HardFail,
  type ScoreCard,
  type RubricResult,
} from "./schemas";
import { interpolate } from "./text";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex: ${hex}`);
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
  };
}

export function rgbDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Mean, over sampled colours, of the nearest brand-palette colour distance. */
export function meanMinPaletteDistance(samples: RGB[], palette: RGB[]): number {
  if (samples.length === 0 || palette.length === 0) return Infinity;
  let sum = 0;
  for (const s of samples) {
    let min = Infinity;
    for (const p of palette) min = Math.min(min, rgbDistance(s, p));
    sum += min;
  }
  return sum / samples.length;
}

/** Numeric width/height ratio for an aspect token ("9:16" -> 0.5625). */
export function aspectRatio(aspect: Aspect): number {
  const [w, h] = aspect.split(":").map(Number);
  return (w ?? 1) / (h ?? 1);
}

export function aspectWithinTolerance(
  width: number,
  height: number,
  aspect: Aspect,
  tol: number,
): boolean {
  if (!width || !height) return false;
  const want = aspectRatio(aspect);
  const got = width / height;
  return Math.abs(got - want) / want <= tol;
}

/** Sample a grid of colours from an image (small resize + raw pixels). */
export async function sampleColors(imagePath: string, grid = 16): Promise<RGB[]> {
  const { data, info } = await sharp(imagePath)
    .resize(grid, grid, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out: RGB[] = [];
  const channels = info.channels; // 3 after removeAlpha
  for (let i = 0; i + 2 < data.length; i += channels) {
    out.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
  }
  return out;
}

/** Deterministic hard checks. Returns the list of failures (empty = passes). */
export async function hardChecks(
  imagePath: string,
  expectedAspect: Aspect,
  brand: Brand,
  cfg: ScoreConfig,
): Promise<HardFail[]> {
  const fails: HardFail[] = [];
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(imagePath).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    if (!width || !height) fails.push("blank_or_undecodable");
  } catch {
    return ["blank_or_undecodable"];
  }

  if (!aspectWithinTolerance(width, height, expectedAspect, cfg.aspect_tolerance)) {
    fails.push("aspect");
  }

  try {
    const stats = await sharp(imagePath).stats();
    const flat = stats.channels.every((c) => c.stdev < 1.0);
    if (flat) fails.push("blank_or_undecodable");
  } catch {
    /* stats failure is non-fatal for the palette check below */
  }

  const palette = brand.palette.map(hexToRgb);
  const samples = await sampleColors(imagePath);
  if (meanMinPaletteDistance(samples, palette) > cfg.palette_distance_threshold) {
    fails.push("palette_distance");
  }

  return [...new Set(fails)];
}

/** Build the vision rubric prompt for a brief's image (interpolated from score.yaml). */
export function buildRubric(cfg: ScoreConfig, tokens: Record<string, string>): string {
  return interpolate(cfg.rubric, tokens);
}

/** Combine a rubric result into the hard-fail list (banned_visual/artefacts/legibility). */
export function mergeRubricHardFails(
  hard: HardFail[],
  rubric: RubricResult,
): HardFail[] {
  const merged = new Set<HardFail>(hard);
  if (rubric.banned_visual) merged.add("banned_visual");
  if (rubric.artefacts) merged.add("artefacts");
  if (!rubric.legibility_ok) merged.add("legibility");
  return [...merged];
}

/** Assemble a ScoreCard. total = sum of soft scores, or 0 when any hard fail. */
export function buildScoreCard(
  brief_id: string,
  variant: number,
  stage: "score-1" | "score-2",
  hardFails: HardFail[],
  rubric: RubricResult | null,
): ScoreCard {
  const soft = rubric?.soft ?? null;
  const total =
    hardFails.length > 0 || !soft
      ? 0
      : soft.brand_fit + soft.product_clarity + soft.hook_strength + soft.platform_fit;
  const reasons = rubric?.reasons ?? [];
  return {
    brief_id,
    variant,
    stage,
    hard_fails: hardFails,
    soft,
    total,
    rank: null,
    reasons,
  };
}

/** Rank surviving cards (no hard fails) by total desc; drop-outs get rank null. */
export function rankCards(cards: ScoreCard[]): ScoreCard[] {
  const survivors = cards
    .filter((c) => c.hard_fails.length === 0)
    .sort((a, b) => b.total - a.total);
  survivors.forEach((c, i) => (c.rank = i + 1));
  return cards;
}
