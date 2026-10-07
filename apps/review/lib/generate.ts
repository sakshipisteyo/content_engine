import "server-only";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, ROOT, engineArgs } from "./repo";

/** True if .env has the provider keys a real (Higgsfield) run needs. */
export function hasKeys(): boolean {
  try {
    const env = readFileSync(join(ROOT, ".env"), "utf8");
    const get = (k: string) => new RegExp(`^${k}\\s*=\\s*(.+)$`, "m").exec(env)?.[1]?.trim();
    return Boolean(get("OPENROUTER_API_KEY") && get("HIGGSFIELD_API_KEY"));
  } catch {
    return false;
  }
}

const MARKERS = join(DATA_DIR, "data", "generating");
const LOGS = join(DATA_DIR, "data", "logs");
/** A run older than this is assumed finished (or dead) — the page stops saying "Generating". */
const MAX_RUN_MS = 12 * 60 * 1000;

/**
 * Start a real engine run for one post in the background. Output goes to
 * data/logs/<id>-<time>.log (it used to be discarded, hiding every failure), and a marker
 * in data/generating/ lets the post page say "Generating…" until images land.
 */
export function startRun(id: string, extra: string[] = []): { log: string } {
  mkdirSync(MARKERS, { recursive: true });
  mkdirSync(LOGS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log = join(LOGS, `${id}-${stamp}.log`);
  const fd = openSync(log, "a");
  const child = spawn(process.execPath, [...engineArgs("run"), "--only", id, ...extra], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  child.unref();
  writeFileSync(join(MARKERS, `${id}.json`), JSON.stringify({ started_at: Date.now(), pid: child.pid, log }));
  return { log };
}

/** Is the engine process still running? (signal 0 only checks; works on Windows too.) */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Start time (ms) of a run still in progress for this post, else null. */
export function generatingSince(id: string): number | null {
  const marker = join(MARKERS, `${id}.json`);
  if (!existsSync(marker)) return null;
  try {
    const { started_at, pid } = JSON.parse(readFileSync(marker, "utf8")) as { started_at?: number; pid?: number };
    const t = started_at ?? statSync(marker).mtimeMs;
    if (Date.now() - t >= MAX_RUN_MS) return null;
    return pid && !alive(pid) ? null : t;
  } catch {
    return null;
  }
}
