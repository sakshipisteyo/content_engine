/**
 * Create a job from an ad-type template + a few inputs, then dry-compile it so it shows
 * on the review board immediately (real generation happens later with keys).
 *   tsx scripts/create.ts --brand banjaaran --template ugc-ad --hook "..." --cta "..." \
 *     [--products a,b] [--anchor warm-evening] [--angle "..."] [--platform instagram] \
 *     [--variants 3] [--credit-cap 40] [--product-image uploads/x.jpg] [--id <id>] \
 *     [--attribution "Name"] [--body "outline text"]
 *     [--media uploads/x/01.png,uploads/x/02.mp4] [--presenter uploads/x/face.jpg] [--music uploads/x/m.mp3]
 *     [--scene "what the photo shows"]  (photo text posts: Higgsfield generates it if no photo)
 * Video (montage) templates render a free local draft right away; render-video.ts --full
 * spends Higgsfield credits.
 * Typographic templates (quote-card) render right away — local, 0 credits, no keys.
 * Prints: created <id>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import {
  PATHS,
  BriefSchema,
  loadEnv,
  loadTemplate,
  loadBrand,
  loadPrompts,
  loadRoutes,
  loadScoreConfig,
  computeVersions,
  runTypographic,
  runMontage,
  MontageError,
  validateLayoutInput,
  draftBody,
  OutlineError,
  BODY_LAYOUTS,
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

loadEnv();
const brandKey = arg("brand") ?? die("--brand required");
const templateKey = arg("template") ?? die("--template required");
const hook = arg("hook") ?? die("--hook required");
const brand = loadBrand(brandKey);
const template = loadTemplate(templateKey);
const cta = arg("cta")?.trim() || brand.default_cta || "Learn more";

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
  attribution: arg("attribution"),
  body: arg("body"),
  media: arg("media")?.split(",").map((s) => s.trim()).filter(Boolean),
  presenter: arg("presenter"),
  music: arg("music"),
  scene: arg("scene"),
};

const brief = jobFromTemplate(template, inputs);
// --source-url/--source-title [--source-publisher --source-date]: the news story a post is
// about; the caption names and links it.
if (arg("source-url")) {
  brief.source = BriefSchema.shape.source.unwrap().parse({
    title: arg("source-title") ?? arg("source-url"),
    url: arg("source-url"),
    ...(arg("source-publisher") ? { publisher: arg("source-publisher") } : {}),
    ...(arg("source-date") ? { date: arg("source-date") } : {}),
  });
}
// Text posts: one variant per colour theme the brand uses (dark / light / brand).
if (template.renderer === "typographic" && brand.themes?.length && !arg("variants")) {
  brief.variants = brand.themes.length;
}

// Outline-driven text posts: draft the outline if left blank (needs a key), then check it.
if (template.layout && BODY_LAYOUTS.includes(template.layout)) {
  if (!brief.body) {
    if (!process.env.OPENROUTER_API_KEY) {
      die("write the outline, or add OPENROUTER_API_KEY to .env to have it drafted");
    }
    try {
      brief.body = await draftBody(brand, brief, template, loadRoutes().copy.model);
    } catch (e) {
      die(`could not draft the outline: ${(e as Error).message}`);
    }
  }
  try {
    validateLayoutInput(template.layout, brief);
  } catch (e) {
    die(e instanceof OutlineError ? `outline: ${e.message}` : (e as Error).message);
  }
}
mkdirSync(PATHS.briefs, { recursive: true });
writeFileSync(join(PATHS.briefs, `${id}.yaml`), yamlStringify(brief));

// Dry-compile so it appears on the board (no provider calls).
const memory = loadBrandMemoryReadOnly(brandKey, () => openLedger());
const prompts = loadPrompts();
const routes = loadRoutes();
const versions = computeVersions(brandKey);
const plan = compileBase({ brief, brand, prompts, routes, versions, brandKey, memory, template });
const dir = join(PATHS.out, id);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "prompt.json"), JSON.stringify(plan, null, 2));
writeFileSync(join(dir, "brief.json"), JSON.stringify(brief, null, 2));

// Typographic posts cost nothing to render, so produce the finished post now.
if (template.renderer === "typographic") {
  const ledger = openLedger();
  try {
    await runTypographic(
      {
        brandKey, brand, prompts, routes, versions, ledger,
        scoreConfig: loadScoreConfig(),
        runId: `create-${Date.now()}`,
        concurrency: 1,
      },
      brief,
      plan,
      template,
    );
  } finally {
    ledger.close();
  }
}

// Video posts: a free local draft of the edit (AI shots stood in by camera moves).
if (template.renderer === "montage") {
  const ledger = openLedger();
  try {
    await runMontage(
      { brandKey, brand, routes, ledger, runId: `create-${Date.now()}` },
      brief,
      template,
      { text: plan.copy.caption, hashtags: plan.copy.hashtags },
      "draft",
    );
  } catch (e) {
    die(e instanceof MontageError ? e.message : `video render failed: ${(e as Error).message}`);
  } finally {
    ledger.close();
  }
}

console.log(`created ${id}`);
