import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Walk up from cwd to the repo root (the dir with pnpm-workspace.yaml). */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const ROOT = repoRoot();
export const OUT_DIR = join(ROOT, "out");
export const LEDGER_PATH = join(ROOT, "data", "ledger.sqlite");
