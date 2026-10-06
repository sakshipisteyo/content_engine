#!/usr/bin/env node
/**
 * Bundle the engine CLI scripts into plain ESM files under apps/review/.engine/ so the
 * deployed board can spawn them without tsx or the TypeScript sources. sharp stays
 * external (native binary; traced into the deploy by apps/review/next.config.mjs).
 *   node scripts/build-engine.mjs
 */
import { build } from "esbuild";

await build({
  entryPoints: {
    create: "scripts/create.ts",
    run: "scripts/run.ts",
    "create-brand": "scripts/create-brand.ts",
    "render-video": "scripts/render-video.ts",
    "export-video": "scripts/export-video.ts",
  },
  outdir: "apps/review/.engine",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // sharp and the bundled ffmpeg locate native binaries next to their own package files.
  external: ["sharp", "@ffmpeg-installer/ffmpeg"],
  // Some bundled CommonJS deps call require(); give the ESM output a real one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
console.log("engine bundle: apps/review/.engine/{create,run,create-brand,render-video,export-video}.mjs");
