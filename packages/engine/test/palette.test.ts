import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { extractPalette } from "../src/index";

function channelDiff(hex: string, r: number, g: number, b: number): number {
  const m = /#(..)(..)(..)/.exec(hex)!;
  return (
    Math.abs(parseInt(m[1]!, 16) - r) +
    Math.abs(parseInt(m[2]!, 16) - g) +
    Math.abs(parseInt(m[3]!, 16) - b)
  );
}

describe("extractPalette", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ce-pal-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns n colours including the dominant input colours", async () => {
    const a = join(dir, "a.png");
    const b = join(dir, "b.png");
    await sharp({ create: { width: 64, height: 64, channels: 3, background: "#B5471F" } }).png().toFile(a);
    await sharp({ create: { width: 64, height: 64, channels: 3, background: "#2F5D50" } }).png().toFile(b);
    const pal = await extractPalette([a, b], 4);
    expect(pal).toHaveLength(4);
    expect(pal.some((h) => channelDiff(h, 0xb5, 0x47, 0x1f) < 24)).toBe(true);
    expect(pal.some((h) => channelDiff(h, 0x2f, 0x5d, 0x50) < 24)).toBe(true);
  });

  it("falls back to defaults when no images decode", async () => {
    const pal = await extractPalette(["does-not-exist.png"], 4);
    expect(pal).toHaveLength(4);
    expect(pal.every((h) => /^#[0-9A-F]{6}$/.test(h))).toBe(true);
  });
});
