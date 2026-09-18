import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, OUT_DIR } from "../../../lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { brief_id?: string }
    | null;
  if (!body?.brief_id) {
    return Response.json({ error: "brief_id required" }, { status: 400 });
  }

  const briefPath = join(OUT_DIR, body.brief_id, "brief.json");
  if (!existsSync(briefPath)) {
    return Response.json({ error: "brief not found" }, { status: 404 });
  }

  const brief = JSON.parse(readFileSync(briefPath, "utf8")) as {
    brand?: string;
    template?: string;
    products?: string[];
    style_anchor?: string;
    hook?: string;
    cta?: string;
    angle?: string;
    product_image?: string;
    platform?: string;
  };

  const brand = brief.brand ?? "banjaaran";
  const template = brief.template ?? "product-hero";
  const hook = brief.hook ?? "New variation";

  const id = `${brand.slice(0, 4)}-${template}-${Math.random().toString(36).slice(2, 7)}`;

  const args = [
    "--import", "tsx", "scripts/create.ts",
    "--brand", brand,
    "--template", template,
    "--hook", hook,
    "--cta", brief.cta ?? "Learn more",
    "--id", id,
  ];
  if (brief.products?.length) args.push("--products", brief.products.join(","));
  if (brief.style_anchor) args.push("--anchor", brief.style_anchor);
  if (brief.angle) args.push("--angle", brief.angle);
  if (brief.product_image) args.push("--product-image", brief.product_image);
  if (brief.platform) args.push("--platform", brief.platform);

  const result = await new Promise<{ code: number; err: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, err }));
    child.on("error", (e) => resolve({ code: 1, err: e.message }));
  });

  if (result.code !== 0) {
    return Response.json(
      { error: result.err.trim().split("\n").pop() || "repeat failed" },
      { status: 500 },
    );
  }
  return Response.json({ id });
}
