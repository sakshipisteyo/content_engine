import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  hexToRgb,
  rgbDistance,
  meanMinPaletteDistance,
  aspectRatio,
  aspectWithinTolerance,
  hardChecks,
  loadBrand,
  loadScoreConfig,
  type RGB,
} from "../src/index";

const brand = loadBrand("banjaaran");
const cfg = loadScoreConfig();

describe("pure hard-check helpers", () => {
  it("hexToRgb parses #RRGGBB", () => {
    expect(hexToRgb("#B5471F")).toEqual({ r: 0xb5, g: 0x47, b: 0x1f });
    expect(hexToRgb("2F5D50")).toEqual({ r: 0x2f, g: 0x5d, b: 0x50 });
  });

  it("rgbDistance is euclidean and zero for identical colours", () => {
    const a: RGB = { r: 10, g: 20, b: 30 };
    expect(rgbDistance(a, a)).toBe(0);
    expect(rgbDistance({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 4 })).toBe(4);
  });

  it("meanMinPaletteDistance is 0 when samples are all in-palette", () => {
    const palette = brand.palette.map(hexToRgb);
    expect(meanMinPaletteDistance([palette[0]!, palette[1]!], palette)).toBe(0);
  });

  it("meanMinPaletteDistance is large for off-palette samples", () => {
    const palette = brand.palette.map(hexToRgb);
    const dist = meanMinPaletteDistance([{ r: 0, g: 255, b: 0 }], palette);
    expect(dist).toBeGreaterThan(cfg.palette_distance_threshold);
  });

  it("aspectRatio and tolerance", () => {
    expect(aspectRatio("1:1")).toBe(1);
    expect(aspectRatio("9:16")).toBeCloseTo(0.5625, 4);
    expect(aspectWithinTolerance(1080, 1350, "4:5", 0.01)).toBe(true);
    expect(aspectWithinTolerance(1000, 1000, "4:5", 0.01)).toBe(false);
    expect(aspectWithinTolerance(0, 0, "1:1", 0.01)).toBe(false);
  });
});

describe("hardChecks over real images", () => {
  let dir: string;

  /** Build a raw RGB image with a per-pixel colour function. */
  async function makeImage(
    path: string,
    w: number,
    h: number,
    px: (x: number, y: number) => RGB,
  ): Promise<void> {
    const buf = Buffer.alloc(w * h * 3);
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = px(x, y);
        buf[i++] = c.r;
        buf[i++] = c.g;
        buf[i++] = c.b;
      }
    }
    await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path);
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ce-score-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes a correct-aspect, non-blank, on-palette image", async () => {
    const p = join(dir, "good.png");
    const a = hexToRgb(brand.palette[0]!);
    const b = hexToRgb(brand.palette[1]!);
    await makeImage(p, 1080, 1350, (_x, y) => (y < 675 ? a : b)); // 4:5, two palette colours
    const fails = await hardChecks(p, "4:5", brand, cfg);
    expect(fails).toEqual([]);
  });

  it("flags a wrong aspect ratio", async () => {
    const p = join(dir, "square.png");
    const a = hexToRgb(brand.palette[0]!);
    const b = hexToRgb(brand.palette[2]!);
    await makeImage(p, 1000, 1000, (x) => (x < 500 ? a : b));
    const fails = await hardChecks(p, "4:5", brand, cfg);
    expect(fails).toContain("aspect");
  });

  it("flags a blank (zero-variance) image", async () => {
    const p = join(dir, "blank.png");
    const a = hexToRgb(brand.palette[0]!);
    await makeImage(p, 1080, 1350, () => a); // solid -> stdev ~0
    const fails = await hardChecks(p, "4:5", brand, cfg);
    expect(fails).toContain("blank_or_undecodable");
  });

  it("flags an off-palette image", async () => {
    const p = join(dir, "offpalette.png");
    await makeImage(p, 1080, 1350, (x, y) =>
      (x + y) % 2 === 0 ? { r: 0, g: 255, b: 0 } : { r: 0, g: 220, b: 40 },
    );
    const fails = await hardChecks(p, "4:5", brand, cfg);
    expect(fails).toContain("palette_distance");
  });
});
