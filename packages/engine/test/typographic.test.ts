import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  compileBase,
  estimateCredits,
  loadBrand,
  loadPrompts,
  loadRoutes,
  loadTemplate,
  computeVersions,
  contrastRatio,
  escapeMarkup,
  brandHandle,
  quoteThemes,
  renderQuoteCard,
  renderTypographicVariant,
  MIN_TEXT_CONTRAST,
  type Brief,
} from "../src/index";

const brand = loadBrand("banjaaran");
const template = loadTemplate("quote-card");
const routes = loadRoutes();

const brief: Brief = {
  id: "test-quote",
  brand: "banjaaran",
  format: "image",
  platform: "linkedin",
  hook: "Make yourself easy to root for. Be kind. Be reliable.",
  angle: "Quote Card",
  cta: "Follow for more",
  products: ["kolhapuri-tan"],
  style_anchor: "warm-evening",
  variants: 3,
  credit_cap: 0,
  template: "quote-card",
  attribution: "Blake Burge",
};

describe("colour helpers", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("every quote theme meets AA text contrast for both demo brands", () => {
    for (const key of ["banjaaran", "brewcraft"]) {
      for (const t of quoteThemes(loadBrand(key))) {
        expect(contrastRatio(t.text, t.background)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });
});

describe("identity", () => {
  it("escapes Pango markup", () => {
    expect(escapeMarkup("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("derives a handle from the brand name, or uses social.handle", () => {
    expect(brandHandle(brand)).toBe("@banjaaranstudio");
    expect(brandHandle({ ...brand, social: { handle: "banjaaran.in" } })).toBe("@banjaaran.in");
  });
});

describe("quote-card template", () => {
  it("costs 0 credits and compiles themed shots", () => {
    expect(estimateCredits(brief, routes, template)).toBe(0);
    const plan = compileBase({
      brief,
      brand,
      prompts: loadPrompts(),
      routes,
      versions: computeVersions("banjaaran"),
      brandKey: "banjaaran",
      template,
    });
    expect(plan.renderer).toBe("typographic");
    expect(plan.estimated_credits).toBe(0);
    expect(plan.shots.map((s) => s.theme)).toEqual(["dark", "light", "brand"]);
    expect(plan.shots.every((s) => s.reference_images.length === 0)).toBe(true);
  });
});

describe("renderQuoteCard", () => {
  const theme = quoteThemes(brand)[0]!;
  const base = {
    displayName: "Banjaaran Studio",
    handle: "@banjaaranstudio",
    font: "sans-serif",
    theme,
  };

  it("renders at the exact canvas size for each aspect", async () => {
    for (const [aspect, w, h] of [["4:5", 1080, 1350], ["1:1", 1080, 1080], ["9:16", 1080, 1920]] as const) {
      const r = await renderQuoteCard({ ...base, quote: brief.hook, aspect });
      const meta = await sharp(r.image).metadata();
      expect([meta.width, meta.height]).toEqual([w, h]);
      expect(r.fits).toBe(true);
    }
  });

  it("shrinks long statements and flags ones that cannot fit", async () => {
    const short = await renderQuoteCard({ ...base, quote: "Be kind.", aspect: "1:1" });
    const long = await renderQuoteCard({ ...base, quote: brief.hook.repeat(4), aspect: "1:1" });
    expect(long.quoteSize).toBeLessThan(short.quoteSize);
    const huge = await renderQuoteCard({ ...base, quote: brief.hook.repeat(30), aspect: "1:1" });
    expect(huge.fits).toBe(false);
  });

  it("scores a clean variant with no hard fails and an over-long one as legibility", async () => {
    const ok = await renderTypographicVariant("quote-card", brand, brief, 1, ["1:1"], undefined);
    expect(ok.card.hard_fails).toEqual([]);
    const tooLong = await renderTypographicVariant(
      "quote-card", brand, { ...brief, hook: brief.hook.repeat(30) }, 1, ["1:1"], undefined,
    );
    expect(tooLong.card.hard_fails).toContain("legibility");
  });
});
