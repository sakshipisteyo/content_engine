/**
 * Create a brand from the "Add your brand" wizard. The API saves the uploads under
 * brand/<key>/assets/ and writes the answers to a JSON file (IntakeSchema in
 * packages/engine/src/intake.ts); this reads the font family from any uploaded font,
 * detects the palette from the logo + photos (unless exact colours were entered) and
 * writes a validated brand/<key>.yaml. No provider keys.
 *   tsx scripts/create-brand.ts --key acme --intake intake.json \
 *     [--logo logo.png] [--products p1.jpg,p2.jpg] [--font-regular f.ttf] [--font-bold fb.ttf]
 * Prints: created-brand <key>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import {
  PATHS,
  brandFromIntake,
  extractPalette,
  fontFamilyName,
  type IntakeFiles,
} from "../packages/engine/src/index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const key = arg("key") ?? die("--key required");
const intakePath = arg("intake") ?? die("--intake required");
let intake: unknown;
try {
  intake = JSON.parse(readFileSync(intakePath, "utf8"));
} catch (e) {
  die(`could not read the intake: ${(e as Error).message}`);
}

const assetsDir = join(PATHS.brand, key, "assets");
const abs = (file: string) => join(assetsDir, file);
const files: IntakeFiles = { logo: arg("logo"), products: list(arg("products")) };

const fontRegular = arg("font-regular");
if (fontRegular) {
  const family = fontFamilyName(readFileSync(abs(fontRegular)));
  if (!family) die("the font file isn't a TTF or OTF font we can read (WOFF and font collections aren't supported)");
  files.font = { family, regular: fontRegular, bold: arg("font-bold") };
}

const sources = [files.logo, ...files.products].filter((f): f is string => !!f).map(abs);
const entered = (intake as { colors?: unknown[] } | null)?.colors?.length ?? 0;
const detected = sources.length && !entered ? await extractPalette(sources, 4) : [];

let brand;
try {
  brand = brandFromIntake(intake as never, files, detected);
} catch (e) {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  die(issues ? issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") : (e as Error).message);
}
writeFileSync(join(PATHS.brand, `${key}.yaml`), yamlStringify(brand));
console.log(`created-brand ${key}`);
