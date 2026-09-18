# DECISIONS

Decisions taken where SPEC.md was silent, contradictory, or diverged from the real
machine. Per section 8: "Ask only when SPEC.md is silent or contradictory; otherwise
decide and note the decision here." Newest first.

## 2026-09-18 — Preflight & scaffold (A-test step 1)

1. **Working directory.** Building in `C:\content_engine` per section 8. Directory
   existed and was empty. Session moved there.

2. **Higgsfield SDK package name.** SPEC names `higgsfield-js`, which does **not**
   exist on npm — that is the GitHub *repo* name. The official published package is
   **`@higgsfield/client`** (v0.2.6, maintained by higgsfield.ai, repo
   `higgsfield-ai/higgsfield-js`, described "Official Higgsfield SDK for Node.js and
   TypeScript"). Using `@higgsfield/client`. Section 8's rule to read the SDK types
   before writing the provider applies to `node_modules/@higgsfield/client`.

3. **ElevenLabs SDK.** Two packages exist: `@elevenlabs/elevenlabs-js` (v2.68, the one
   SPEC names) and legacy `elevenlabs` (v1.59). Using `@elevenlabs/elevenlabs-js`.

4. **Node version.** SPEC asks Node 20 LTS; machine has **Node 24.19.0**. Proceeding on
   Node 24 (better-sqlite3 13 and sharp 0.35 ship Node 24 prebuilds; tsx/vitest run on
   24). Risk: native module rebuilds. Revisit if `pnpm install` fails to fetch prebuilds.

5. **pnpm entrypoint.** pnpm was not installed and its global shim cannot be written
   (`C:\Program Files\nodejs` needs admin). corepack (0.35) is present, so pnpm is
   invoked as **`corepack pnpm@9.15.0 <args>`** this session. To get a bare `pnpm`
   command, run an elevated `corepack enable pnpm` once.

6. **node-linker=hoisted** (`.npmrc`). Flat node_modules so native modules and the
   root `scripts/ -> packages/engine` import path resolve like npm. Spike pragmatism.

7. **Module system.** ESM everywhere (`"type": "module"`), TS `moduleResolution:
   "Bundler"`, extensionless relative imports, run via tsx / vitest (both esbuild). Lets
   `scripts/*.ts` import `packages/engine/src/*` without a build step.

8. **zod v4** (latest) — API used (`z.object`, `.parse`, `.safeParse`) is unchanged
   from v3.

## Known blockers to real generation (do not block steps 1–4 / A1–A2)

- **ffmpeg not on PATH** — blocks stage 7 (assemble) and A4/A7. Install before A4:
  `winget install Gyan.FFmpeg`, then reopen the terminal.
- **No API keys** (Higgsfield / Anthropic / ElevenLabs) in `.env` — blocks every real
  provider call (A3+). `--dry-run` (A2) needs none.
- **No brand file / no 20 briefs** (section 9, Sakshi's to supply). To make A1/A2
  runnable now, the engine will be seeded with the Banjaaran brand + example briefs
  taken verbatim from SPEC section 4, clearly marked as placeholders, plus generated
  placeholder assets. **These must be replaced with the real brand assets and 20 real
  briefs before real generation.**
