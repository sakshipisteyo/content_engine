import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../../lib/repo";

export const dynamic = "force-dynamic";

const STAGES = ["compile", "hero", "score-1", "motion", "copy", "voice", "assemble", "score-2"];

/** True if .env has at least the provider keys a real run needs. */
function hasKeys(): boolean {
  try {
    const env = readFileSync(join(ROOT, ".env"), "utf8");
    const get = (k: string) => new RegExp(`^${k}\\s*=\\s*(.+)$`, "m").exec(env)?.[1]?.trim();
    return Boolean(get("ANTHROPIC_API_KEY") && get("HIGGSFIELD_API_KEY"));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { brief_id?: string; from?: string; note?: string }
    | null;
  if (!body?.brief_id || !body.from || !STAGES.includes(body.from)) {
    return Response.json({ started: false, reason: "brief_id and valid from-stage required" }, { status: 400 });
  }

  if (!hasKeys()) {
    return Response.json({
      started: false,
      reason: "no API keys in .env (edit recorded; real re-run needs keys)",
    });
  }

  const args = ["--import", "tsx", "scripts/run.ts", "--only", body.brief_id, "--from", body.from];
  if (body.note) args.push("--note", body.note);

  try {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return Response.json({ started: true });
  } catch (e) {
    return Response.json({ started: false, reason: (e as Error).message }, { status: 500 });
  }
}
