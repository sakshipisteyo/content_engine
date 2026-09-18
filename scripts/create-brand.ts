/**
 * Create a brand from the onboarding wizard's inputs: assets already saved under
 * brand/<key>/assets/ by the API; this auto-extracts the palette and writes a validated
 * brand/<key>.yaml. No provider keys.
 *   tsx scripts/create-brand.ts --key acme --name "Acme" --logo logo.png \
 *     --products p1.jpg,p2.jpg [--product-names "A,B"] [--tone "warm,bold"] \
 *     [--banned "cheap,sale"] [--category "..."] [--audience "..."] [--budget 400]
 * Prints: created-brand <key>
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import {
  PATHS,
  BrandSchema,
  extractPalette,
  type Brand,
  type Product,
  type StyleAnchor,
} from "../packages/engine/src/index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}
function list(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
function titleFromFile(f: string): string {
  return f.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const key = arg("key") ?? die("--key required");
const name = arg("name") ?? die("--name required");
const assetsDir = join(PATHS.brand, key, "assets");
const abs = (file: string) => join(assetsDir, file);

const logo = arg("logo");
const productFiles = list(arg("products"));
if (productFiles.length === 0) die("at least one product image required");
const productNames = list(arg("product-names"));

const paletteSources = [logo, ...productFiles].filter(Boolean).map((f) => abs(f!));
const palette = await extractPalette(paletteSources, 4);

const products: Record<string, Product> = {};
productFiles.forEach((file, i) => {
  const pname = productNames[i] ?? titleFromFile(file);
  const pkey = slug(pname) || `product-${i + 1}`;
  products[pkey] = { name: pname, price_inr: 0, images: [`assets/${file}`] };
});

const style_anchors: Record<string, StyleAnchor> = {
  signature: {
    description: "on-brand, natural directional light, the product as the clear hero",
    references: [`assets/${productFiles[0]}`],
  },
};

const brand: Brand = {
  name,
  category: arg("category") ?? "products",
  audience: arg("audience") ?? "its everyday customers",
  tone: list(arg("tone")).length ? list(arg("tone")) : ["warm", "confident"],
  banned_words: list(arg("banned")),
  banned_visuals: [],
  palette,
  logo: logo ? `assets/${logo}` : `assets/${productFiles[0]}`,
  products,
  style_anchors,
  voice_id: arg("voice-id") ?? "REPLACE_WITH_ELEVENLABS_VOICE_ID",
  ...(arg("budget") ? { monthly_credit_budget: Number(arg("budget")) } : {}),
};

const validated = BrandSchema.parse(brand);
writeFileSync(join(PATHS.brand, `${key}.yaml`), yamlStringify(validated));
console.log(`created-brand ${key}`);
