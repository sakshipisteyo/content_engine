import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { ROOT, engineArgs, DATA_DIR } from "../../../lib/repo";

export const dynamic = "force-dynamic";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}

const MEDIA_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const isFile = (v: FormDataEntryValue | null): v is File =>
  !!v && typeof v === "object" && "arrayBuffer" in v && (v as File).size > 0;

/** Save an upload under uploads/<id>/<name><ext>; returns the DATA_DIR-relative path. */
async function saveUpload(f: File, id: string, name: string, allowed: Set<string>): Promise<string> {
  const ext = extname(f.name || "").toLowerCase();
  if (!allowed.has(ext)) throw new Error(`${f.name}: unsupported file type`);
  mkdirSync(join(DATA_DIR, "uploads", id), { recursive: true });
  const rel = `uploads/${id}/${name}${ext}`;
  writeFileSync(join(DATA_DIR, rel), Buffer.from(await f.arrayBuffer()));
  return rel;
}

export const maxDuration = 300;

export async function POST(req: Request) {
  const form = await req.formData();
  const brand = String(form.get("brand") ?? "");
  const template = String(form.get("template") ?? "");
  const hook = String(form.get("hook") ?? "");
  const cta = String(form.get("cta") ?? "");
  const angle = String(form.get("angle") ?? "");
  const product = String(form.get("product") ?? "");
  const anchor = String(form.get("anchor") ?? "");
  const attribution = String(form.get("attribution") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const scene = String(form.get("scene") ?? "").trim();
  if (!brand || !template || !hook.trim()) {
    return Response.json({ error: "brand, template and hook are required" }, { status: 400 });
  }

  const id = `${slug(brand).slice(0, 4)}-${slug(template)}-${Math.random().toString(36).slice(2, 7)}`;

  // Save uploaded product image (if any) to uploads/<id>.<ext>.
  let productImage: string | undefined;
  const file = form.get("product_image");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.size > 0) {
      const ext = extname(f.name || "").toLowerCase() || ".jpg";
      mkdirSync(join(DATA_DIR, "uploads"), { recursive: true });
      const rel = `uploads/${id}${ext}`;
      writeFileSync(join(DATA_DIR, rel), Buffer.from(await f.arrayBuffer()));
      productImage = rel;
    }
  }

  const args = [
    ...engineArgs("create"),
    "--brand", brand,
    "--template", template,
    "--hook", hook,
    "--id", id,
  ];
  // Blank CTA: the engine uses the brand's default_cta, else "Learn more".
  if (cta?.trim()) args.push("--cta", cta.trim());
  if (angle) args.push("--angle", angle);
  if (product) args.push("--products", product);
  if (anchor) args.push("--anchor", anchor);
  if (productImage) args.push("--product-image", productImage);

  // Video posts: screens / photos / clips (in order), presenter photo, music.
  try {
    const media = form.getAll("media").filter(isFile).slice(0, 20);
    const saved: string[] = [];
    for (let i = 0; i < media.length; i++) saved.push(await saveUpload(media[i]!, id, String(i + 1).padStart(2, "0"), MEDIA_EXT));
    if (saved.length) args.push("--media", saved.join(","));
    const presenter = form.get("presenter");
    if (isFile(presenter)) args.push("--presenter", await saveUpload(presenter, id, "presenter", IMAGE_EXT));
    const music = form.get("music");
    if (isFile(music)) args.push("--music", await saveUpload(music, id, "music", AUDIO_EXT));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (attribution) args.push("--attribution", attribution);
  if (body) args.push("--body", body);
  if (scene) args.push("--scene", scene.slice(0, 600));

  const result = await new Promise<{ code: number; err: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, err }));
    child.on("error", (e) => resolve({ code: 1, err: e.message }));
  });

  if (result.code !== 0) {
    const msg = result.err.trim().split("\n").filter((l) => l.startsWith("error:")).pop()?.replace(/^error: /, "");
    return Response.json(
      { error: msg || result.err.trim().split("\n").pop() || "create failed" },
      { status: 500 },
    );
  }
  return Response.json({ id });
}
