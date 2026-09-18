import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { ROOT } from "../../../lib/repo";

export const dynamic = "force-dynamic";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function titleFromFile(f: string): string {
  return f.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

async function saveFile(file: File, dir: string, base: string): Promise<string> {
  const ext = extname(file.name || "").toLowerCase() || ".jpg";
  const name = `${base}${ext}`;
  writeFileSync(join(dir, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return Response.json({ error: "brand name is required" }, { status: 400 });

  let key = slug(name) || "brand";
  if (existsSync(join(ROOT, "brand", `${key}.yaml`))) key = `${key}-${Math.random().toString(36).slice(2, 6)}`;

  const assetsDir = join(ROOT, "brand", key, "assets");
  mkdirSync(assetsDir, { recursive: true });

  // Logo (optional).
  let logo: string | undefined;
  const logoFile = form.get("logo");
  if (logoFile && typeof logoFile === "object" && "arrayBuffer" in logoFile) {
    const f = logoFile as File;
    if (f.size > 0) logo = await saveFile(f, assetsDir, "logo");
  }

  // Product images (>= 1).
  const productFiles = form.getAll("products").filter((p): p is File => typeof p === "object" && p !== null && "arrayBuffer" in p && (p as File).size > 0);
  if (productFiles.length === 0) return Response.json({ error: "add at least one product image" }, { status: 400 });
  const productFilenames: string[] = [];
  const derivedNames: string[] = [];
  for (let i = 0; i < productFiles.length; i++) {
    const f = productFiles[i]!;
    productFilenames.push(await saveFile(f, assetsDir, `product-${i + 1}`));
    derivedNames.push(titleFromFile(f.name) || `Product ${i + 1}`);
  }

  const args = [
    "--import", "tsx", "scripts/create-brand.ts",
    "--key", key,
    "--name", name,
    "--products", productFilenames.join(","),
  ];
  if (logo) args.push("--logo", logo);
  const names = String(form.get("product_names") ?? "").trim();
  args.push("--product-names", names || derivedNames.join(","));
  for (const [field, flag] of [["tone", "tone"], ["banned", "banned"], ["category", "category"], ["audience", "audience"], ["budget", "budget"]] as const) {
    const v = String(form.get(field) ?? "").trim();
    if (v) args.push(`--${flag}`, v);
  }

  const result = await new Promise<{ code: number; err: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, err }));
    child.on("error", (e) => resolve({ code: 1, err: e.message }));
  });
  if (result.code !== 0) {
    return Response.json({ error: result.err.trim().split("\n").pop() || "brand create failed" }, { status: 500 });
  }
  return Response.json({ key });
}
