/**
 * Dev utility: generate PLACEHOLDER brand assets (solid two-tone images + a simple
 * logo) so the pipeline is runnable before the real Banjaaran kit arrives. Replace
 * every file under brand/banjaaran/assets/ with the real assets before real generation.
 *   tsx scripts/make-placeholders.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { PATHS } from "../packages/engine/src/index";

const assets = join(PATHS.brand, "banjaaran", "assets");
mkdirSync(assets, { recursive: true });

const palette = ["#B5471F", "#D9C3A3", "#2F5D50", "#1C1A17"];

async function twoTone(name: string, top: string, bottom: string, w = 1600, h = 1600) {
  const half = Math.floor(h / 2);
  const topImg = { create: { width: w, height: half, channels: 3 as const, background: top } };
  const botImg = await sharp({
    create: { width: w, height: h - half, channels: 3, background: bottom },
  })
    .png()
    .toBuffer();
  await sharp(topImg)
    .composite([{ input: botImg, top: half, left: 0 }])
    .jpeg({ quality: 88 })
    .toFile(join(assets, name));
  console.log("wrote", name);
}

async function logo() {
  const size = 512;
  const badge = await sharp({
    create: { width: 320, height: 320, channels: 4, background: "#B5471F" },
  })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: badge, gravity: "centre" }])
    .png()
    .toFile(join(assets, "logo.png"));
  console.log("wrote logo.png (placeholder)");
}

await logo();
await twoTone("kolh-1.jpg", palette[0]!, palette[1]!);
await twoTone("kolh-2.jpg", palette[1]!, palette[2]!);
await twoTone("maroon-1.jpg", palette[0]!, palette[3]!);
await twoTone("win-1.jpg", palette[2]!, palette[1]!);
await twoTone("win-2.jpg", palette[3]!, palette[1]!);
console.log("Done. These are PLACEHOLDERS — replace with the real brand kit.");
