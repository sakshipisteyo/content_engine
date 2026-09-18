/**
 * Zod contracts for every data shape that crosses a boundary (SPEC section 4).
 * YAML files are validated against these on load; the run stops on the first
 * invalid file. No other module should redefine these shapes.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ enums */

export const Format = z.enum(["image", "video"]);
export type Format = z.infer<typeof Format>;

export const Platform = z.enum(["instagram", "linkedin", "youtube"]);
export type Platform = z.infer<typeof Platform>;

export const Aspect = z.enum(["9:16", "1:1", "4:5", "16:9"]);
export type Aspect = z.infer<typeof Aspect>;

export const Quality = z.enum(["720p", "1080p"]);
export type Quality = z.infer<typeof Quality>;

/** Deterministic hard-check labels + LLM-detected ones (SPEC section 4/5). */
export const HardFail = z.enum([
  "aspect",
  "palette_distance",
  "artefacts",
  "legibility",
  "banned_visual",
  "blank_or_undecodable",
]);
export type HardFail = z.infer<typeof HardFail>;

export const StageName = z.enum([
  "compile",
  "hero",
  "score-1",
  "motion",
  "copy",
  "voice",
  "assemble",
  "score-2",
]);
export type StageName = z.infer<typeof StageName>;

export const StageStatus = z.enum(["ok", "failed", "skipped", "capped", "flagged"]);
export type StageStatus = z.infer<typeof StageStatus>;

/* ------------------------------------------------------------------ Brief */

export const BriefSchema = z
  .object({
    id: z.string().min(1),
    brand: z.string().min(1),
    format: Format,
    platform: Platform,
    hook: z.string().min(1),
    angle: z.string().min(1),
    cta: z.string().min(1),
    products: z.array(z.string().min(1)).min(1),
    style_anchor: z.string().min(1),
    variants: z.number().int().min(1).max(10),
    credit_cap: z.number().nonnegative(),
  })
  .strict();
export type Brief = z.infer<typeof BriefSchema>;

/* ------------------------------------------------------------------ Brand */

export const ProductSchema = z
  .object({
    name: z.string().min(1),
    price_inr: z.number().nonnegative(),
    images: z.array(z.string()).default([]),
  })
  .strict();
export type Product = z.infer<typeof ProductSchema>;

export const StyleAnchorSchema = z
  .object({
    description: z.string().min(1),
    references: z.array(z.string()).default([]),
  })
  .strict();
export type StyleAnchor = z.infer<typeof StyleAnchorSchema>;

const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6})$/, "must be a #RRGGBB hex colour");

export const BrandSchema = z
  .object({
    name: z.string().min(1),
    category: z.string().min(1),
    audience: z.string().min(1),
    tone: z.array(z.string().min(1)).min(1),
    banned_words: z.array(z.string()).default([]),
    banned_visuals: z.array(z.string()).default([]),
    palette: z.array(HexColor).min(1),
    logo: z.string().min(1),
    products: z.record(z.string(), ProductSchema),
    style_anchors: z.record(z.string(), StyleAnchorSchema),
    voice_id: z.string().min(1),
  })
  .strict();
export type Brand = z.infer<typeof BrandSchema>;

/* ------------------------------------------------------------- PromptPlan */

export const ShotSchema = z
  .object({
    variant: z.number().int().min(1),
    image_prompt: z.string().min(1),
    negative_prompt: z.string(),
    reference_images: z.array(z.string()).default([]),
    aspect: Aspect,
    video_prompt: z.string().optional(),
    camera: z.string().optional(),
  })
  .strict();
export type Shot = z.infer<typeof ShotSchema>;

export const CopySchema = z
  .object({
    script: z.string().optional(),
    caption: z.string(),
    hashtags: z.array(z.string()).default([]),
  })
  .strict();
export type Copy = z.infer<typeof CopySchema>;

export const RoutingResolvedSchema = z
  .object({
    image_model: z.string(),
    video_model: z.string().nullable(),
    copy_model: z.string(),
    score_model: z.string(),
    voice_model: z.string().nullable(),
  })
  .strict();
export type RoutingResolved = z.infer<typeof RoutingResolvedSchema>;

export const VersionsSchema = z
  .object({
    brand_hash: z.string(),
    prompt_yaml_hash: z.string(),
    routes_hash: z.string(),
  })
  .strict();
export type Versions = z.infer<typeof VersionsSchema>;

export const PromptPlanSchema = z
  .object({
    brief_id: z.string(),
    brand: z.string(),
    format: Format,
    platform: Platform,
    shots: z.array(ShotSchema).min(1),
    copy: CopySchema,
    routing: RoutingResolvedSchema,
    estimated_credits: z.number().nonnegative(),
    versions: VersionsSchema,
  })
  .strict();
export type PromptPlan = z.infer<typeof PromptPlanSchema>;

/* -------------------------------------------------------------- ScoreCard */

export const SoftScoresSchema = z
  .object({
    brand_fit: z.number().min(1).max(5),
    product_clarity: z.number().min(1).max(5),
    hook_strength: z.number().min(1).max(5),
    platform_fit: z.number().min(1).max(5),
  })
  .strict();
export type SoftScores = z.infer<typeof SoftScoresSchema>;

export const ScoreCardSchema = z
  .object({
    brief_id: z.string(),
    variant: z.number().int().min(1),
    stage: z.enum(["score-1", "score-2"]),
    hard_fails: z.array(HardFail).default([]),
    soft: SoftScoresSchema.nullable(),
    total: z.number(),
    rank: z.number().int().nullable(),
    reasons: z.array(z.string()).default([]),
  })
  .strict();
export type ScoreCard = z.infer<typeof ScoreCardSchema>;

/** The four soft scores + reasons the vision model must return (JSON mode). */
export const RubricResultSchema = z
  .object({
    soft: SoftScoresSchema,
    banned_visual: z.boolean(),
    artefacts: z.boolean(),
    legibility_ok: z.boolean(),
    reasons: z.array(z.string()),
  })
  .strict();
export type RubricResult = z.infer<typeof RubricResultSchema>;

/* ----------------------------------------------------------------- Ledger */

export const LedgerStageSchema = z
  .object({
    run_id: z.string(),
    brief_id: z.string(),
    variant: z.number().int().nullable(),
    stage: StageName,
    model: z.string().nullable(),
    credits: z.number(),
    seconds: z.number(),
    status: StageStatus,
    error: z.string().nullable(),
    started_at: z.string(),
  })
  .strict();
export type LedgerStage = z.infer<typeof LedgerStageSchema>;

export const DecisionSchema = z
  .object({
    brief_id: z.string(),
    variant: z.number().int().nullable(),
    action: z.enum(["approve", "reject", "edit"]),
    note: z.string().nullable(),
    rating: z.number().int().min(1).max(5).nullable(),
    decided_at: z.string(),
  })
  .strict();
export type Decision = z.infer<typeof DecisionSchema>;

/* ---------------------------------------------------- Routing (routes.yaml) */

export const ImageRouteSchema = z
  .object({
    endpoint: z.string().min(1),
    quality: Quality,
    batch_size: z.union([z.literal(1), z.literal(4)]).default(1),
    credits_per_image: z.number().nonnegative(),
  })
  .strict();

export const VideoRouteSchema = z
  .object({
    endpoint: z.string().min(1),
    model: z.string().optional(),
    quality: Quality.default("720p"),
    duration_seconds: z.union([z.literal(5), z.literal(10)]),
    credits_per_second: z.number().nonnegative(),
  })
  .strict();

export const TextRouteSchema = z.object({ model: z.string().min(1) }).strict();

export const VoiceRouteSchema = z
  .object({
    model: z.string().min(1),
    output_format: z.string().default("mp3_44100_128"),
    credits_per_run: z.number().nonnegative().default(0),
  })
  .strict();

export const RoutesSchema = z
  .object({
    image: ImageRouteSchema,
    video: VideoRouteSchema,
    copy: TextRouteSchema,
    score: TextRouteSchema,
    voice: VoiceRouteSchema,
  })
  .strict();
export type Routes = z.infer<typeof RoutesSchema>;

/* --------------------------------------------------- Prompts + score config */

export const PromptsFileSchema = z
  .object({
    system: z.string().default(""),
    template: z.string().min(1),
    negative: z.string().default(""),
  })
  .strict();
export type PromptsFile = z.infer<typeof PromptsFileSchema>;

export const ScoreConfigSchema = z
  .object({
    system: z.string().default(""),
    rubric: z.string().min(1),
    palette_distance_threshold: z.number().positive(),
    aspect_tolerance: z.number().positive().default(0.01),
  })
  .strict();
export type ScoreConfig = z.infer<typeof ScoreConfigSchema>;

/** Aspect ratio per platform for image posts (used by compile). */
export const PLATFORM_ASPECT: Record<Platform, Aspect> = {
  instagram: "4:5",
  linkedin: "1:1",
  youtube: "9:16",
};

/** Crops the assemble stage always renders (SPEC: three crops). */
export const CROP_ASPECTS: Aspect[] = ["9:16", "1:1", "4:5"];
