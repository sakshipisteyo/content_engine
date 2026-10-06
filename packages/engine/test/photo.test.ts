import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import {
  emphasisMarkup,
  parseStat,
  OutlineError,
  renderTypographicVariant,
  layoutAspects,
  validateLayoutInput,
  loadBrand,
  loadTemplate,
  type Brief,
} from "../src/index";

const brand = loadBrand("banjaaran");
const photo = join(tmpdir(), `photo-test-${process.pid}.jpg`);
const base: Brief = {
  id: "t-photo",
  brand: "banjaaran",
  format: "image",
  platform: "linkedin",
  hook: "The translation layer between how a business *says* it works and how it *really* works.",
  angle: "test",
  cta: "Follow",
  products: [Object.keys(brand.products)[0]!],
  style_anchor: Object.keys(brand.style_anchors)[0]!,
  variants: 3,
  credit_cap: 8,
};

beforeAll(async () => {
  mkdirSync(tmpdir(), { recursive: true });
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#7f93a8" } }).jpeg().toFile(photo);
});

describe("photo text posts", () => {
  it("emphasises *words* and escapes the rest", () => {
    const m = emphasisMarkup("A & B *really* <works>", "#FF0000");
    expect(m).toContain('<span weight="heavy" foreground="#FF0000">really</span>');
    expect(m).toContain("A &amp; B");
    expect(m).toContain("&lt;works&gt;");
    expect(emphasisMarkup("5 * 3 = 15", "#000")).toBe("5 * 3 = 15");
  });

  it("parses the stat line and rejects a missing label or long number", () => {
    expect(parseStat("1,161 | runs in the first weeks\nAdoption is the question.")).toEqual({
      stat: "1,161",
      label: "runs in the first weeks",
      body: "Adoption is the question.",
    });
    expect(() => parseStat("1,161")).toThrow(OutlineError);
    expect(() => parseStat("one thousand one hundred | runs")).toThrow(/short/);
    expect(() => validateLayoutInput("stat-card", { body: "" })).toThrow(OutlineError);
  });

  it("templates load; photo posts render landscape, square and portrait", () => {
    expect(loadTemplate("photo-headline").layout).toBe("photo-headline");
    expect(loadTemplate("stat-card").layout).toBe("stat-card");
    expect(layoutAspects("photo-headline", "16:9", ["4:5", "1:1", "9:16"])).toEqual(["16:9", "1:1", "4:5"]);
  });

  it("renders a photo headline over a photo and without one (gradient), all themes fit", async () => {
    for (const p of [photo, undefined]) {
      for (const v of [1, 2, 3]) {
        const out = await renderTypographicVariant("photo-headline", brand, { ...base, body: "Most AI projects stall." }, v, ["16:9", "4:5"], undefined, p);
        expect(out.card.hard_fails).toEqual([]);
        const meta = await sharp(out.renders[0]!.pages[0]!.image).metadata();
        expect([meta.width, meta.height]).toEqual([1920, 1080]);
      }
    }
  });

  it("renders a stat card; an essay-length headline is flagged as legibility", async () => {
    const ok = await renderTypographicVariant(
      "stat-card", brand,
      { ...base, hook: "The most-used AI agent was… *vanilla*.", body: "1,161 | runs in the first weeks\nAdoption is the real question." },
      1, ["1:1"], undefined, photo,
    );
    expect(ok.card.hard_fails).toEqual([]);
    const wall = Array.from({ length: 30 }, () => "words that keep going and going").join(" ");
    const bad = await renderTypographicVariant("stat-card", brand, { ...base, hook: wall, body: "3x | faster" }, 1, ["1:1"], undefined, photo);
    expect(bad.card.hard_fails).toContain("legibility");
  });
});
