import { cpSync, existsSync } from "node:fs";
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

/**
 * Writable home for generated state (out/, briefs/, uploads/, data/). The repo locally;
 * /tmp on Vercel, where the deployment is read-only. Exported to the environment so the
 * engine scripts the API routes spawn write to the same place.
 */
export const DATA_DIR =
  process.env.CONTENT_DATA_DIR ?? (process.env.VERCEL ? "/tmp/content-engine" : ROOT);
process.env.CONTENT_DATA_DIR = DATA_DIR;

// First request on a fresh Vercel instance: start from the demo posts rendered at build.
// /tmp is per instance and wiped on cold start — fine for a demo, not for real data.
if (DATA_DIR !== ROOT && !existsSync(join(DATA_DIR, "out"))) {
  for (const dir of ["out", "briefs", "data"]) {
    const from = join(ROOT, dir);
    if (existsSync(from)) cpSync(from, join(DATA_DIR, dir), { recursive: true });
  }
}

export const OUT_DIR = join(DATA_DIR, "out");
export const LEDGER_PATH = join(DATA_DIR, "data", "ledger.sqlite");

/**
 * node args to run an engine script. Uses the esbuild bundle (apps/review/.engine, built
 * by scripts/build-engine.mjs for deploys: no tsx or TypeScript sources needed at run
 * time), else runs the TypeScript source through tsx (local dev).
 */
export function engineArgs(script: "create" | "run" | "create-brand"): string[] {
  const bundle = join(ROOT, "apps", "review", ".engine", `${script}.mjs`);
  return existsSync(bundle) ? [bundle] : ["--import", "tsx", `scripts/${script}.ts`];
}
