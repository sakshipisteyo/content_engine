import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  parseCarousel,
  parseList,
  parsePairs,
  OutlineError,
  jpegsToPdf,
  renderTypographicVariant,
  validateLayoutInput,
  layoutAspects,
  loadBrand,
  loadTemplate,
  type Brief,
} from "../src/index";

const brand = loadBrand("brewcraft");

const CAROUSEL = [
  "What this means for your morning cup",
  "## Insight | Freshness Beats Origin",
  "Beans peak one to three weeks after roasting.",
  "- Check the roast date, not the best-before",
  "- Buy smaller bags more often",
  "## Take action | Grind Just Before You Brew",
  "Ground coffee goes stale in minutes.",
].join("\n");

const base: Brief = {
  id: "test-slides",
  brand: "brewcraft",
  format: "image",
  platform: "linkedin",
  hook: "Better Coffee Starts Before the Kettle",
  angle: "education",
  cta: "Follow BrewCraft",
  products: ["dark-roast-jar"],
  style_anchor: "morning-ritual",
  variants: 3,
  credit_cap: 0,
};

describe("outline parsers", () => {
  it("parses a carousel outline", () => {
    const o = parseCarousel(CAROUSEL);
    expect(o.subtitle).toBe("What this means for your morning cup");
    expect(o.sections).toHaveLength(2);
    expect(o.sections[0]).toEqual({
      label: "Insight",
      headline: "Freshness Beats Origin",
      paragraphs: ["Beans peak one to three weeks after roasting."],
      bullets: ["Check the roast date, not the best-before", "Buy smaller bags more often"],
    });
    expect(parseCarousel("## Just a headline").sections[0]!.label).toBeNull();
    expect(() => parseCarousel("no sections here")).toThrow(OutlineError);
  });

  it("parses list items with or without bullets/numbers", () => {
    expect(parseList("- one\n2. two\n3) three\nfour")).toEqual(["one", "two", "three", "four"]);
    expect(() => parseList("only one")).toThrow(OutlineError);
  });

  it("parses alternating label pairs and rejects broken ones", () => {
    const p = parsePairs("Myth: A\nFact: B\nmyth: C\nfact: D: with colon");
    expect(p.leftLabel).toBe("Myth");
    expect(p.rightLabel).toBe("Fact");
    expect(p.rows).toEqual([{ left: "A", right: "B" }, { left: "C", right: "D: with colon" }]);
    expect(() => parsePairs("Myth: A")).toThrow(OutlineError);
    expect(() => parsePairs("Myth: A\nFact: B\nMyth: C")).toThrow(OutlineError);
    expect(() => parsePairs("Myth: A\nFact: B\nBefore: C\nAfter: D")).toThrow(OutlineError);
    expect(() => parsePairs("no label here\nFact: B")).toThrow(OutlineError);
  });

  it("validates the outline for body-driven layouts only", () => {
    expect(() => validateLayoutInput("quote-card", {})).not.toThrow();
    expect(() => validateLayoutInput("tips-list", {})).toThrow(OutlineError);
    expect(() => validateLayoutInput("comparison", { body: "Myth: A\nFact: B" })).not.toThrow();
  });
});

describe("templates", () => {
  it("loads the three outline templates", () => {
    expect(loadTemplate("insight-carousel").layout).toBe("insight-carousel");
    expect(loadTemplate("tips-list").layout).toBe("tips-list");
    expect(loadTemplate("myth-vs-fact").layout).toBe("comparison");
  });

  it("carousels skip 9:16", () => {
    expect(layoutAspects("insight-carousel", "4:5", ["9:16", "1:1", "4:5"])).toEqual(["4:5", "1:1"]);
    expect(layoutAspects("tips-list", "4:5", ["9:16", "1:1", "4:5"])).toEqual(["4:5", "9:16", "1:1"]);
  });
});

describe("pdf", () => {
  it("writes a multi-page PDF with a valid xref", async () => {
    const jpeg = await sharp({ create: { width: 40, height: 50, channels: 3, background: "#123456" } }).jpeg().toBuffer();
    const pdf = jpegsToPdf([{ jpeg, width: 40, height: 50 }, { jpeg, width: 40, height: 50 }]).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 2");
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    // Every xref offset points at its "N 0 obj" header.
    const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(pdf.slice(off).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });
});

describe("layouts render", () => {
  it("insight carousel: cover + one page per section, correct sizes, fits", async () => {
    const out = await renderTypographicVariant("insight-carousel", brand, { ...base, body: CAROUSEL }, 1, ["4:5", "1:1"], undefined);
    for (const r of out.renders) {
      expect(r.pages).toHaveLength(3);
      const meta = await sharp(r.pages[0]!.image).metadata();
      expect([meta.width, meta.height]).toEqual(r.aspect === "4:5" ? [1080, 1350] : [1080, 1080]);
    }
    expect(out.card.hard_fails).toEqual([]);
  });

  it("tips list and comparison render single pages that fit", async () => {
    const tips = await renderTypographicVariant("tips-list", brand, { ...base, body: "Grind fresh\nUse filtered water\nWeigh your dose" }, 2, ["4:5", "9:16"], undefined);
    expect(tips.renders.map((r) => r.pages.length)).toEqual([1, 1]);
    expect(tips.card.hard_fails).toEqual([]);
    const cmp = await renderTypographicVariant("comparison", brand, { ...base, body: "Myth: Dark roast is stronger.\nFact: Light roasts keep slightly more caffeine." }, 3, ["1:1"], undefined);
    expect(cmp.card.hard_fails).toEqual([]);
  });

  it("flags a page with far too much text as legibility", async () => {
    const wall = Array.from({ length: 8 }, (_, i) => `Tip ${i + 1}: ${"a long sentence that keeps going ".repeat(6)}`).join("\n");
    const out = await renderTypographicVariant("tips-list", brand, { ...base, body: wall }, 1, ["1:1"], undefined);
    expect(out.card.hard_fails).toContain("legibility");
  });
});
