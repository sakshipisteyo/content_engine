/**
 * Paths, .env loading, and validated YAML loading.
 * Every YAML file is parsed then validated against a Zod schema; a failure
 * throws a ConfigError naming the file and the exact issues (SPEC section 4:
 * "the run stops on the first invalid file").
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/** Find the repo root by walking up until pnpm-workspace.yaml is found. */
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: the process working directory (npm scripts run from the root).
  return process.cwd();
}

export const REPO_ROOT = findRepoRoot();

export const PATHS = {
  root: REPO_ROOT,
  prompts: join(REPO_ROOT, "prompts"),
  routing: join(REPO_ROOT, "routing"),
  brand: join(REPO_ROOT, "brand"),
  briefs: join(REPO_ROOT, "briefs"),
  out: join(REPO_ROOT, "out"),
  data: join(REPO_ROOT, "data"),
  ledger: join(REPO_ROOT, "data", "ledger.sqlite"),
  blockers: join(REPO_ROOT, "data", "blockers.md"),
  env: join(REPO_ROOT, ".env"),
} as const;

let envLoaded = false;
/** Load .env once. Never logs values. */
export function loadEnv(): void {
  if (envLoaded) return;
  loadDotenv({ path: PATHS.env, quiet: true });
  envLoaded = true;
}

/** Read an env var, throwing a clear error if missing (used only before real calls). */
export function requireEnv(name: string): string {
  loadEnv();
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new ConfigError(
      `Missing ${name}. Add it to .env before real provider calls (see .env.example).`,
    );
  }
  return v.trim();
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Format a ZodError into a compact, file-scoped, human-readable message. */
function formatZodError(file: string, err: z.ZodError): string {
  const lines = err.issues.map((i) => {
    const path = i.path.length ? i.path.join(".") : "(root)";
    return `  - ${path}: ${i.message}`;
  });
  return `Invalid ${file}:\n${lines.join("\n")}`;
}

/** Parse + validate one YAML file. Throws ConfigError on parse or schema failure. */
export function loadYaml<T>(file: string, schema: z.ZodType<T>): T {
  if (!existsSync(file)) {
    throw new ConfigError(`Missing file: ${file}`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(file, "utf8"));
  } catch (e) {
    throw new ConfigError(`Could not parse YAML ${file}: ${(e as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(formatZodError(file, result.error));
  }
  return result.data;
}

/** Read a file's raw bytes and return a short sha256 (for the versions block). */
export function hashFile(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
}

export function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

/** List brief files (*.yaml / *.yml) under briefs/, sorted, absolute paths. */
export function listBriefFiles(dir: string = PATHS.briefs): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => resolve(dir, f));
}
