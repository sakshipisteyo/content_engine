import { spawn } from "node:child_process";
import { ROOT } from "../../../lib/repo";

export const dynamic = "force-dynamic";

interface BatchJob {
  brand: string;
  template: string;
  product: string;
  anchor: string;
  hook: string;
}

function runCreate(job: BatchJob): Promise<{ id: string } | { error: string }> {
  const id = `${job.brand.slice(0, 4)}-${job.template}-${Math.random().toString(36).slice(2, 7)}`;
  const args = [
    "--import", "tsx", "scripts/create.ts",
    "--brand", job.brand,
    "--template", job.template,
    "--hook", job.hook,
    "--cta", "Learn more",
    "--id", id,
  ];
  if (job.product) args.push("--products", job.product);
  if (job.anchor) args.push("--anchor", job.anchor);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve({ id });
      else resolve({ error: err.trim().split("\n").pop() || "failed" });
    });
    child.on("error", (e) => resolve({ error: e.message }));
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    brand?: string;
    products?: string[];
    templates?: string[];
    anchor?: string;
    hooks?: string[];
    count?: number;
  } | null;

  if (!body?.brand || !body.products?.length || !body.templates?.length) {
    return Response.json(
      { error: "brand, products[] and templates[] required" },
      { status: 400 },
    );
  }

  const jobs: BatchJob[] = [];
  const hooks = body.hooks?.length ? body.hooks : ["New content"];
  const count = Math.min(body.count ?? 1, 3);

  for (const template of body.templates) {
    for (const product of body.products) {
      for (let i = 0; i < count; i++) {
        jobs.push({
          brand: body.brand,
          template,
          product,
          anchor: body.anchor ?? "",
          hook: hooks[i % hooks.length] ?? "New content",
        });
      }
    }
  }

  if (jobs.length > 20) {
    return Response.json({ error: "batch capped at 20 jobs" }, { status: 400 });
  }

  const results = await Promise.all(jobs.map(runCreate));
  const created = results.filter((r): r is { id: string } => "id" in r).map((r) => r.id);
  const failed = results.filter((r): r is { error: string } => "error" in r).length;

  return Response.json({ created, failed });
}
