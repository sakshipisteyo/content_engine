/**
 * Create a job from an ad-type template + a few inputs, then dry-compile it so it shows
 * on the review board immediately (real generation happens later with keys).
 *   tsx scripts/create.ts --brand banjaaran --template ugc-ad --hook "..." --cta "..." \
 *     [--products a,b] [--anchor warm-evening] [--angle "..."] [--platform instagram] \
 *     [--variants 3] [--credit-cap 40] [--product-image uploads/x.jpg] [--id <id>]
 * Prints: created <id>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import {
  PATHS,
  loadTemplate,
  loadBrand,
  loadPrompts,
  loadRoutes,
  computeVersions,
  jobFromTemplate,
  compileBase,
  loadBrandMemoryReadOnly,
  openLedger,
  type JobInputs,
  type Platform,
} from "../packages/engine/src/index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const brandKey = arg("brand") ?? die("--brand required");
const templateKey = arg("template") ?? die("--template required");
const hook = arg("hook") ?? die("--hook required");
const cta = arg("cta") ?? "Learn more";

const brand = loadBrand(brandKey);
const template = loadTemplate(templateKey);

const products = (arg("products") ?? Object.keys(brand.products)[0] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (products.length === 0) die(`brand ${brandKey} has no products`);
for (const p of products) if (!brand.products[p]) die(`unknown product "${p}" for ${brandKey}`);

const anchor = arg("anchor") ?? Object.keys(brand.style_anchors)[0];
if (!anchor || !brand.style_anchors[anchor]) die(`unknown style anchor for ${brandKey}`);

const id = arg("id") ?? `${brandKey.slice(0, 4)}-${templateKey}-${Date.now().toString(36).slice(-5)}`;

const inputs: JobInputs = {
  id,
  brand: brandKey,
  products,
  style_anchor: anchor,
  hook,
  cta,
  angle: arg("angle"),
  platform: arg("platform") as Platform | undefined,
  variants: arg("variants") ? Number(arg("variants")) : undefined,
  credit_cap: arg("credit-cap") ? Number(arg("credit-cap")) : undefined,
  product_image: arg("product-image"),
};

const brief = jobFromTemplate(template, inputs);
writeFileSync(join(PATHS.briefs, `${id}.yaml`), yamlStringify(brief));

// Dry-compile so it appears on the board (no provider calls).
const memory = loadBrandMemoryReadOnly(brandKey, () => openLedger());
const plan = compileBase({
  brief,
  brand,
  prompts: loadPrompts(),
  routes: loadRoutes(),
  versions: computeVersions(brandKey),
  brandKey,
  memory,
  template,
});
const dir = join(PATHS.out, id);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "prompt.json"), JSON.stringify(plan, null, 2));
writeFileSync(join(dir, "brief.json"), JSON.stringify(brief, null, 2));

console.log(`created ${id}`);
