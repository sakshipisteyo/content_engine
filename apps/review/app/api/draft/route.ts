import { spawn } from "node:child_process";
import { ROOT, engineArgs } from "../../../lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * AI writer. POST { brand, notes?, template? } -> { draft }, or { brand, ideas: true } -> { ideas }.
 * Runs scripts/draft.ts (Claude via the Anthropic SDK, OpenRouter fallback).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { brand?: string; notes?: string; template?: string; ideas?: boolean } | null;
  const brand = body?.brand ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(brand)) return Response.json({ error: "pick a brand first" }, { status: 400 });
  const args = [...engineArgs("draft"), "--brand", brand];
  if (body?.ideas) args.push("--ideas");
  else {
    if (body?.notes?.trim()) args.push("--notes", body.notes.trim().slice(0, 6000));
    if (body?.template && /^[a-z0-9-]{1,60}$/.test(body.template)) args.push("--template", body.template);
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
    return Response.json({ error: msg || "the AI writer failed" }, { status: 400 });
  }
  try {
    return Response.json(JSON.parse(result.out.trim().split("\n").pop() ?? "{}"));
  } catch {
    return Response.json({ error: "the AI writer returned something unreadable" }, { status: 500 });
  }
}
