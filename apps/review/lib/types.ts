/** Local mirrors of the engine's JSON contracts (board is decoupled from the engine). */
export type Format = "image" | "video";
export type Platform = "instagram" | "linkedin" | "youtube";

export interface Shot {
  variant: number;
  image_prompt: string;
  negative_prompt: string;
  reference_images: string[];
  aspect: string;
  video_prompt?: string;
  camera?: string;
}

export interface Copy {
  script?: string;
  caption: string;
  hashtags: string[];
}

export interface Learned {
  applied: boolean;
  sample_size: number;
  reinforced_negatives: string[];
  anchor_note: string | null;
  preferred_anchors: string[];
  downweighted_anchors: string[];
  voice_examples: number;
}

export interface PromptPlan {
  brief_id: string;
  brand: string;
  format: Format;
  platform: Platform;
  shots: Shot[];
  copy: Copy;
  estimated_credits: number;
  learned?: Learned;
}

export interface Brief {
  id: string;
  brand: string;
  format: Format;
  platform: Platform;
  hook: string;
  angle: string;
  cta: string;
  products: string[];
  style_anchor: string;
  variants: number;
  credit_cap: number;
}

export interface SoftScores {
  brand_fit: number;
  product_clarity: number;
  hook_strength: number;
  platform_fit: number;
}

export interface ScoreCard {
  brief_id: string;
  variant: number;
  stage: string;
  hard_fails: string[];
  soft: SoftScores | null;
  total: number;
  rank: number | null;
  reasons: string[];
}

export interface LedgerStage {
  run_id: string;
  brief_id: string;
  variant: number | null;
  stage: string;
  model: string | null;
  credits: number;
  seconds: number;
  status: string;
  error: string | null;
  started_at: string;
}

export interface Decision {
  brief_id: string;
  variant: number | null;
  action: "approve" | "reject" | "edit";
  note: string | null;
  rating: number | null;
  decided_at: string;
}

export type BriefStatus = "pending" | "approved" | "rejected" | "failed";
