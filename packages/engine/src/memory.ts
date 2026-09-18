/**
 * Brand memory — the feedback loop ("dotted arrow"). It reads what past runs produced
 * (score cards) and what the human decided (ledger decisions), then hands compile a set
 * of biases for the NEXT run: reinforce negatives for recurring hard-fails, prefer style
 * anchors that got approved / rated high, down-weight ones that got rejected / scored low,
 * and carry approved caption voice forward. Pure `computeBrandMemory` is unit-tested;
 * `loadBrandMemory` gathers its inputs from out/ + the ledger.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PATHS } from "./config";
import type { ScoreCard, Decision } from "./schemas";
import type { Ledger } from "./ledger";

/** Terms appended to negative prompts when a hard-fail recurs across a brand's history. */
const REASON_TERMS: Record<string, string> = {
  palette_distance: "off-brand colours, colours outside the brand palette",
  banned_visual: "banned brand visuals",
  legibility: "illegible text, cluttered composition, low contrast",
  artefacts: "generation artefacts, distortion, warping",
  aspect: "wrong aspect ratio, cropped subject",
  blank_or_undecodable: "blank frame, washed-out image",
};

/** A hard-fail must recur at least this many times before it reinforces the negative. */
const REINFORCE_MIN = 2;

export interface AnchorStat {
  anchor: string;
  n: number;
  approvals: number;
  rejections: number;
  ratings: number[];
  avgRating: number | null;
  avgTotal: number;
  hardFails: number;
}

export interface BrandMemory {
  brand: string;
  sampleSize: number;
  hardFailCounts: Record<string, number>;
  reinforcedNegatives: string[];
  anchorStats: Record<string, AnchorStat>;
  preferredAnchors: string[];
  downweightedAnchors: string[];
  approvedCaptions: string[];
}

export interface MemoryEntry {
  brief_id: string;
  style_anchor: string;
  cards: ScoreCard[];
  decisions: Decision[];
  approvedCaption?: string | null;
}

export function emptyMemory(brand: string): BrandMemory {
  return {
    brand,
    sampleSize: 0,
    hardFailCounts: {},
    reinforcedNegatives: [],
    anchorStats: {},
    preferredAnchors: [],
    downweightedAnchors: [],
    approvedCaptions: [],
  };
}

/** Pure: derive biases from past cards + decisions. No IO. */
export function computeBrandMemory(brand: string, entries: MemoryEntry[]): BrandMemory {
  const mem = emptyMemory(brand);
  mem.sampleSize = entries.length;
  if (entries.length === 0) return mem;

  for (const e of entries) {
    const stat: AnchorStat =
      mem.anchorStats[e.style_anchor] ??
      {
        anchor: e.style_anchor,
        n: 0,
        approvals: 0,
        rejections: 0,
        ratings: [],
        avgRating: null,
        avgTotal: 0,
        hardFails: 0,
      };
    stat.n += 1;

    for (const c of e.cards) {
      for (const h of c.hard_fails) {
        mem.hardFailCounts[h] = (mem.hardFailCounts[h] ?? 0) + 1;
        stat.hardFails += 1;
      }
    }
    const survivorTotals = e.cards.filter((c) => c.hard_fails.length === 0).map((c) => c.total);
    if (survivorTotals.length) {
      const avg = survivorTotals.reduce((a, b) => a + b, 0) / survivorTotals.length;
      stat.avgTotal = round1((stat.avgTotal * (stat.n - 1) + avg) / stat.n);
    }
    for (const d of e.decisions) {
      if (d.action === "approve") stat.approvals += 1;
      if (d.action === "reject") stat.rejections += 1;
      if (d.rating != null) stat.ratings.push(d.rating);
    }
    if (e.approvedCaption && e.decisions.some((d) => d.action === "approve")) {
      mem.approvedCaptions.push(e.approvedCaption);
    }
    mem.anchorStats[e.style_anchor] = stat;
  }

  // Reinforced negatives from recurring hard-fails.
  for (const [reason, n] of Object.entries(mem.hardFailCounts)) {
    if (n >= REINFORCE_MIN && REASON_TERMS[reason]) mem.reinforcedNegatives.push(REASON_TERMS[reason]!);
  }

  // Classify anchors.
  for (const stat of Object.values(mem.anchorStats)) {
    stat.avgRating = stat.ratings.length
      ? round1(stat.ratings.reduce((a, b) => a + b, 0) / stat.ratings.length)
      : null;
    const good = stat.approvals > stat.rejections && (stat.avgRating === null || stat.avgRating >= 4);
    const bad =
      stat.rejections > stat.approvals ||
      (stat.avgRating !== null && stat.avgRating < 3) ||
      (stat.n >= 2 && stat.hardFails / stat.n >= 1.5);
    if (good) mem.preferredAnchors.push(stat.anchor);
    if (bad) mem.downweightedAnchors.push(stat.anchor);
  }

  return mem;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Gather memory inputs from out (brief.json + score.json) and the ledger, then compute. */
export function loadBrandMemory(brand: string, ledger: Ledger): BrandMemory {
  if (!existsSync(PATHS.out)) return emptyMemory(brand);
  const allDecisions = ledger.allDecisions();
  const entries: MemoryEntry[] = [];

  for (const id of readdirSync(PATHS.out, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    const briefFile = join(PATHS.out, id, "brief.json");
    if (!existsSync(briefFile)) continue;
    let meta: { brand?: string; style_anchor?: string };
    try {
      meta = JSON.parse(readFileSync(briefFile, "utf8"));
    } catch {
      continue;
    }
    if (meta.brand !== brand) continue;

    const cards: ScoreCard[] = [];
    for (const v of readdirSync(join(PATHS.out, id), { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^v\d+$/.test(d.name))
      .map((d) => d.name)) {
      const f = join(PATHS.out, id, v, "score.json");
      if (existsSync(f)) {
        try {
          cards.push(JSON.parse(readFileSync(f, "utf8")) as ScoreCard);
        } catch {
          /* skip */
        }
      }
    }
    const decisions = allDecisions.filter((d) => d.brief_id === id);
    let approvedCaption: string | null = null;
    if (decisions.some((d) => d.action === "approve")) {
      const cap = join(PATHS.out, id, "caption.txt");
      const v1cap = join(PATHS.out, id, "v1", "caption.txt");
      const capFile = existsSync(cap) ? cap : existsSync(v1cap) ? v1cap : null;
      if (capFile) approvedCaption = readFileSync(capFile, "utf8").split("\n\n")[0]?.trim() ?? null;
    }
    entries.push({
      brief_id: id,
      style_anchor: meta.style_anchor ?? "unknown",
      cards,
      decisions,
      approvedCaption,
    });
  }

  return computeBrandMemory(brand, entries);
}

/** Read-only convenience for dry-run: never create the ledger file (keeps A2 clean). */
export function loadBrandMemoryReadOnly(
  brand: string,
  openLedger: () => Ledger,
): BrandMemory {
  if (!existsSync(PATHS.ledger)) return emptyMemory(brand);
  const ledger = openLedger();
  try {
    return loadBrandMemory(brand, ledger);
  } finally {
    ledger.close();
  }
}
