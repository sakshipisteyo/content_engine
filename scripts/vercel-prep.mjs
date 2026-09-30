#!/usr/bin/env node
/**
 * Deploy prep, run by the review app's `build` script: tripwire -> engine bundle ->
 * demo posts. A no-op outside Vercel (local builds keep your own out/ data). Lives in
 * the app's build (not only vercel.json) so it runs even when the Vercel project's
 * Root Directory is apps/review, where the repo-root vercel.json is ignored.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.VERCEL && !process.argv.includes("--force")) process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const step = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
step("scripts/tripwire.mjs");
step("scripts/build-engine.mjs");
step("--import", "tsx", "scripts/seed-mock.ts");
