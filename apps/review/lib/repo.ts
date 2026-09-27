import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function repoRoot(): string {
  // On Vercel, __dirname points into the serverless function bundle.
  // The project files are co-located there. Use it as a starting point.
  const starts = [process.cwd(), resolve(__dirname, "..", "..", "..")];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return process.cwd();
}

export const ROOT = repoRoot();
export const OUT_DIR = join(ROOT, "out");
export const LEDGER_PATH = join(ROOT, "data", "ledger.sqlite");
