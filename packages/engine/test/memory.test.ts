import { describe, it, expect } from "vitest";
import {
  computeBrandMemory,
  compileBase,
  loadBrand,
  loadPrompts,
  loadRoutes,
  computeVersions,
  type MemoryEntry,
  type ScoreCard,
  type Brief,
} from "../src/index";

function card(brief_id: string, variant: number, hard_fails: string[], total: number): ScoreCard {
  return {
    brief_id,
    variant,
    stage: "score-1",
    hard_fails: hard_fails as ScoreCard["hard_fails"],
    soft: hard_fails.length
      ? null
      : { brand_fit: 4, product_clarity: 4, hook_strength: 4, platform_fit: 4 },
    total,
    rank: null,
    reasons: [],
  };
}

const approve = (brief_id: string, rating: number): MemoryEntry["decisions"][number] => ({
  brief_id,
  variant: 1,
  action: "approve",
  note: null,
  rating,
  decided_at: "t",
});
const reject = (brief_id: string, rating: number): MemoryEntry["decisions"][number] => ({
  brief_id,
  variant: null,
  action: "reject",
  note: null,
  rating,
  decided_at: "t",
});

describe("computeBrandMemory", () => {
  it("reinforces negatives for recurring hard-fails and classifies anchors", () => {
    const entries: MemoryEntry[] = [
      { brief_id: "a", style_anchor: "studio-craft", cards: [card("a", 1, [], 16)], decisions: [approve("a", 5)], approvedCaption: "Made by hand." },
      { brief_id: "b", style_anchor: "studio-craft", cards: [card("b", 1, [], 15)], decisions: [approve("b", 4)] },
      { brief_id: "c", style_anchor: "warm-evening", cards: [card("c", 1, ["legibility"], 0), card("c", 2, ["legibility"], 0)], decisions: [reject("c", 2)] },
    ];
    const mem = computeBrandMemory("banjaaran", entries);
    expect(mem.sampleSize).toBe(3);
    expect(mem.hardFailCounts["legibility"]).toBe(2);
    expect(mem.reinforcedNegatives.some((s) => /illegible|legib/i.test(s))).toBe(true);
    expect(mem.preferredAnchors).toContain("studio-craft");
    expect(mem.downweightedAnchors).toContain("warm-evening");
    expect(mem.approvedCaptions).toContain("Made by hand.");
  });

  it("no history => no biases", () => {
    const mem = computeBrandMemory("x", []);
    expect(mem.sampleSize).toBe(0);
    expect(mem.reinforcedNegatives).toEqual([]);
    expect(mem.preferredAnchors).toEqual([]);
  });
});

describe("compileBase applies brand memory", () => {
  const brand = loadBrand("banjaaran");
  const prompts = loadPrompts();
  const routes = loadRoutes();
  const versions = computeVersions("banjaaran");
  const brief: Brief = {
    id: "m1",
    brand: "banjaaran",
    format: "image",
    platform: "instagram",
    hook: "h",
    angle: "a",
    cta: "c",
    products: ["kolhapuri-tan"],
    style_anchor: "warm-evening",
    variants: 2,
    credit_cap: 20,
  };

  it("appends learned negatives and steers off an underperforming anchor", () => {
    const mem = computeBrandMemory("banjaaran", [
      { brief_id: "c", style_anchor: "warm-evening", cards: [card("c", 1, ["legibility"], 0), card("c", 2, ["legibility"], 0)], decisions: [reject("c", 2)] },
      { brief_id: "d", style_anchor: "studio-craft", cards: [card("d", 1, [], 16)], decisions: [approve("d", 5)], approvedCaption: "x" },
    ]);
    const plan = compileBase({ brief, brand, prompts, routes, versions, brandKey: "banjaaran", memory: mem });
    expect(plan.learned?.applied).toBe(true);
    expect(plan.shots[0]!.negative_prompt).toMatch(/illegible|legib/i);
    expect(plan.learned?.anchor_note).toBeTruthy();
    expect(plan.shots[0]!.image_prompt).toMatch(/Learned brand preference/);
  });

  it("no memory => no learned block", () => {
    const plan = compileBase({ brief, brand, prompts, routes, versions, brandKey: "banjaaran" });
    expect(plan.learned).toBeUndefined();
  });
});
