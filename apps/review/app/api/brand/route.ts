import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { BRAND_DIR, ROOT, engineArgs } from "../../../lib/repo";

export const dynamic = "force-dynamic";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".tif", ".tiff", ".svg"]);
const FONT_EXT = new Set([".ttf", ".otf"]);

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function isFile(v: FormDataEntryValue | null): v is File {
  return !!v && typeof v === "object" && "arrayBuffer" in v && (v as File).size > 0;
}

/** Save an upload as <base><ext>; only the given extensions are accepted. */
async function saveFile(file: File, dir: string, base: string, allowed: Set<string>): Promise<string> {
  const ext = extname(file.name || "").toLowerCase();
  if (!allowed.has(ext)) throw new Error(`${file.name}: unsupported file type`);
  const name = `${base}${ext}`;
  writeFileSync(join(dir, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

/**
 * Brand wizard submit: `intake` (JSON answers, see IntakeSchema in
 * packages/engine/src/intake.ts) plus files: `logo`, `products` (0-5), `font_regular`,
 * `font_bold`. Saves the files, then scripts/create-brand.ts validates and writes the brand.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  let intake: Record<string, unknown>;
  try {
    intake = JSON.parse(String(form.get("intake") ?? "{}"));
  } catch {
    return Response.json({ error: "intake is not valid JSON" }, { status: 400 });
  }
  const name = String(intake.name ?? "").trim();
  if (!name) return Response.json({ error: "brand name is required" }, { status: 400 });

  let key = slug(name) || "brand";
  if (existsSync(join(BRAND_DIR, `${key}.yaml`))) key = `${key}-${Math.random().toString(36).slice(2, 6)}`;
  const brandDir = join(BRAND_DIR, key);
  const assetsDir = join(brandDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  const args = [...engineArgs("create-brand"), "--key", key];
  try {
    const logo = form.get("logo");
    if (isFile(logo)) args.push("--logo", await saveFile(logo, assetsDir, "logo", IMAGE_EXT));

    const photos = form.getAll("products").filter(isFile).slice(0, 5);
    const saved: string[] = [];
    for (let i = 0; i < photos.length; i++) saved.push(await saveFile(photos[i]!, assetsDir, `product-${i + 1}`, IMAGE_EXT));
    if (intake.business_type !== "service" && saved.length === 0) {
      throw new Error("add at least one product photo (or choose 'We sell a service')");
    }
    if (saved.length) args.push("--products", saved.join(","));

    const fontRegular = form.get("font_regular");
    const fontBold = form.get("font_bold");
    if (isFile(fontRegular)) {
      args.push("--font-regular", await saveFile(fontRegular, assetsDir, "font-regular", FONT_EXT));
      if (isFile(fontBold)) args.push("--font-bold", await saveFile(fontBold, assetsDir, "font-bold", FONT_EXT));
    } else if (isFile(fontBold)) {
      throw new Error("upload the regular font file too (bold alone isn't enough)");
    }
  } catch (e) {
    rmSync(brandDir, { recursive: true, force: true });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const intakePath = join(brandDir, "intake.json");
  writeFileSync(intakePath, JSON.stringify(intake, null, 2));
  args.push("--intake", intakePath);

  const result = await new Promise<{ code: number; err: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, err }));
    child.on("error", (e) => resolve({ code: 1, err: e.message }));
  });
  if (result.code !== 0) {
    rmSync(brandDir, { recursive: true, force: true });
    const msg = result.err.trim().split("\n").pop()?.replace(/^error: /, "") || "brand create failed";
    return Response.json({ error: msg }, { status: 400 });
  }
  return Response.json({ key });
}
