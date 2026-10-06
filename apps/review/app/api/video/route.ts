import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR, ROOT, engineArgs } from "../../../lib/repo";

export const dynamic = "force-dynamic";
// Rendering several sizes takes a minute or two; Higgsfield shots take longer.
export const maxDuration = 800;

/**
 * Video actions on a post:
 *   export  text post -> short videos (free)         { brief_id, variant }
 *   draft   re-render a video post's free draft       { brief_id }
 *   full    render a video post with Higgsfield       { brief_id }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { brief_id?: string; action?: string; variant?: number } | null;
  const id = body?.brief_id ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(id) || !existsSync(join(OUT_DIR, id))) {
    return Response.json({ error: "unknown post" }, { status: 404 });
  }
  let args: string[];
  if (body?.action === "export") {
    const v = Number(body.variant ?? 1);
    if (!Number.isInteger(v) || v < 1 || v > 10) return Response.json({ error: "bad variant" }, { status: 400 });
    args = [...engineArgs("export-video"), "--id", id, "--variant", String(v)];
  } else if (body?.action === "draft" || body?.action === "full") {
    args = [...engineArgs("render-video"), "--id", id, ...(body.action === "full" ? ["--full"] : [])];
  } else {
    return Response.json({ error: "action must be export, draft or full" }, { status: 400 });
  }

  const result = await new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, out, err }));
    child.on("error", (e) => resolve({ code: 1, out, err: e.message }));
  });
  if (result.code !== 0) {
    const msg = result.err.trim().split("\n").filter((l) => l.startsWith("error:")).pop()?.replace(/^error: /, "");
    return Response.json({ error: msg || result.err.trim().split("\n").pop() || "render failed" }, { status: 400 });
  }
  return Response.json({ ok: true, result: result.out.trim() });
}
