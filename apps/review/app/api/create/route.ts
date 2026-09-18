import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { ROOT } from "../../../lib/repo";

export const dynamic = "force-dynamic";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const brand = String(form.get("brand") ?? "");
  const template = String(form.get("template") ?? "");
  const hook = String(form.get("hook") ?? "");
  const cta = String(form.get("cta") ?? "");
  const angle = String(form.get("angle") ?? "");
  const product = String(form.get("product") ?? "");
  const anchor = String(form.get("anchor") ?? "");
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
      mkdirSync(join(ROOT, "uploads"), { recursive: true });
      const rel = `uploads/${id}${ext}`;
      writeFileSync(join(ROOT, rel), Buffer.from(await f.arrayBuffer()));
      productImage = rel;
    }
  }

  const args = [
    "--import", "tsx", "scripts/create.ts",
    "--brand", brand,
    "--template", template,
    "--hook", hook,
    "--cta", cta || "Learn more",
    "--id", id,
  ];
  if (angle) args.push("--angle", angle);
  if (product) args.push("--products", product);
  if (anchor) args.push("--anchor", anchor);
  if (productImage) args.push("--product-image", productImage);

  const result = await new Promise<{ code: number; err: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, err }));
    child.on("error", (e) => resolve({ code: 1, err: e.message }));
  });

  if (result.code !== 0) {
    return Response.json(
      { error: result.err.trim().split("\n").pop() || "create failed" },
      { status: 500 },
    );
  }
  return Response.json({ id });
}
