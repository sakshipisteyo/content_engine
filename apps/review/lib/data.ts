import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR } from "./repo";
import { getStages, getDecisions } from "./ledger";
import type {
  Brief,
  BriefStatus,
  Decision,
  LedgerStage,
  PromptPlan,
  ScoreCard,
} from "./types";

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function listBriefIds(): string[] {
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function variantDirs(id: string): number[] {
  const dir = join(OUT_DIR, id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^v\d+$/.test(d.name))
    .map((d) => Number(d.name.slice(1)))
    .sort((a, b) => a - b);
}

/** First existing media file for a variant, as a /api/media URL. */
export function mediaUrl(id: string, variant: number, format: string): string | null {
  const candidates =
    format === "video"
      ? [`v${variant}/final_9x16.mp4`, `v${variant}/clip.mp4`, `v${variant}/hero.png`]
      : [`v${variant}/final_4x5.jpg`, `v${variant}/final_1x1.jpg`, `v${variant}/hero.png`];
  for (const rel of candidates) {
    if (existsSync(join(OUT_DIR, id, rel))) return `/api/media/${id}/${rel}`;
  }
  return null;
}

export function loadCards(id: string): ScoreCard[] {
  const cards: ScoreCard[] = [];
  for (const v of variantDirs(id)) {
    const c = readJson<ScoreCard>(join(OUT_DIR, id, `v${v}`, "score.json"));
    if (c) cards.push(c);
  }
  return cards;
}

function statusFor(id: string, decisions: Decision[], stages: LedgerStage[]): BriefStatus {
  const d = decisions.filter((x) => x.brief_id === id);
  if (d.some((x) => x.action === "approve")) return "approved";
  if (d.some((x) => x.action === "reject")) return "rejected";
  const s = stages.filter((x) => x.brief_id === id);
  const anyOk = s.some((x) => x.stage === "assemble" && x.status === "ok");
  const anyHeroOk = s.some((x) => x.stage === "hero" && x.status === "ok");
  const anyFail = s.some((x) => x.status === "failed");
  const capped = s.some((x) => x.status === "capped");
  if (anyOk || anyHeroOk) return "pending";
  if (capped || anyFail) return "failed";
  return "pending";
}

export interface BriefSummary {
  id: string;
  hook: string;
  format: string;
  platform: string;
  variantsReady: number;
  status: BriefStatus;
  topVariant: number | null;
  preview: string | null;
  aspect: string;
}

export function listBriefs(): BriefSummary[] {
  const decisions = getDecisions();
  const stages = getStages();
  const out: BriefSummary[] = [];
  for (const id of listBriefIds()) {
    const plan = readJson<PromptPlan>(join(OUT_DIR, id, "prompt.json"));
    const brief = readJson<Brief>(join(OUT_DIR, id, "brief.json"));
    const cards = loadCards(id).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const survivors = cards.filter((c) => c.hard_fails.length === 0);
    const top = survivors[0] ?? null;
    const format = plan?.format ?? brief?.format ?? "image";
    out.push({
      id,
      hook: brief?.hook ?? plan?.copy.caption ?? id,
      format,
      platform: plan?.platform ?? brief?.platform ?? "instagram",
      variantsReady: survivors.length,
      status: statusFor(id, decisions, stages),
      topVariant: top?.variant ?? null,
      preview: top ? mediaUrl(id, top.variant, format) : null,
      aspect: plan?.shots.find((s) => s.variant === top?.variant)?.aspect ?? "4:5",
    });
  }
  return out;
}

export interface VariantView {
  variant: number;
  rank: number | null;
  card: ScoreCard | null;
  media: string | null;
  aspect: string;
  cameraNote?: string;
}

export interface BriefDetail {
  id: string;
  plan: PromptPlan | null;
  brief: Brief | null;
  status: BriefStatus;
  survivors: VariantView[];
  hidden: { variant: number; reasons: string[] }[];
  topVariant: number | null;
  decision: Decision | null;
}

export function getBriefDetail(id: string): BriefDetail | null {
  if (!listBriefIds().includes(id)) return null;
  const plan = readJson<PromptPlan>(join(OUT_DIR, id, "prompt.json"));
  const brief = readJson<Brief>(join(OUT_DIR, id, "brief.json"));
  const decisions = getDecisions();
  const stages = getStages();
  const cards = loadCards(id);
  const format = plan?.format ?? brief?.format ?? "image";

  const survivorsCards = cards
    .filter((c) => c.hard_fails.length === 0)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const survivors: VariantView[] = survivorsCards.map((c) => ({
    variant: c.variant,
    rank: c.rank,
    card: c,
    media: mediaUrl(id, c.variant, format),
    aspect: plan?.shots.find((s) => s.variant === c.variant)?.aspect ?? "9:16",
    cameraNote: plan?.shots.find((s) => s.variant === c.variant)?.camera,
  }));

  const hidden = cards
    .filter((c) => c.hard_fails.length > 0)
    .map((c) => ({ variant: c.variant, reasons: c.hard_fails }));

  const briefDecisions = decisions.filter((d) => d.brief_id === id);
  const decision = briefDecisions.length ? briefDecisions[briefDecisions.length - 1]! : null;

  return {
    id,
    plan,
    brief,
    status: statusFor(id, decisions, stages),
    survivors,
    hidden,
    topVariant: survivors[0]?.variant ?? null,
    decision,
  };
}
