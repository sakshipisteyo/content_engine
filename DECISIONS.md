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

## 2026-09-18 — SDK types read (A-test step 2)

9. **SQLite via `node:sqlite`, not better-sqlite3.** `better-sqlite3` builds from
   source (node-gyp), which needs Python 3 + MSVC build tools; node-gyp could not run
   any Python on this machine and the install failed. Node 24's built-in **`node:sqlite`
   (`DatabaseSync`)** works flagless here and has a near-identical synchronous API
   (`.prepare/.run/.get/.all/.exec`). Using it, isolated inside `ledger.ts` behind a
   tiny interface so swapping back to better-sqlite3 (once a toolchain exists) is a
   one-file change. `sharp` installed fine (prebuilt binary, no compile).

10. **Higgsfield SDK surface (`@higgsfield/client/v2`).** Read from
    `node_modules/@higgsfield/client/dist/v2/*.d.ts` + README:
    - `import { higgsfield, config } from '@higgsfield/client/v2'`
    - Auth: `config({ credentials: 'KEY_ID:KEY_SECRET' })` (or `{apiKey,apiSecret}`, or
      env `HF_CREDENTIALS`). Provider joins `HIGGSFIELD_API_KEY:HIGGSFIELD_SECRET`.
    - Call: `await higgsfield.subscribe(endpoint, { input, withPolling: true })`.
    - Result: types say `V2Response { status, images?:[{url}], video?:{url} }`; README
      says a `JobSet { isCompleted, jobs[].results.raw.url }`. Provider normalizes BOTH.
    - `subscribe(endpoint, ...)` accepts ANY endpoint string; only three are typed:
      `/v1/text2image/soul` (Soul t2i), `/v1/image2video/dop` (DoP i2v, sub-model
      `dop-lite|dop-turbo|dop-standard`), `/v1/speak/higgsfield`.

11. **Image/video model ids (routes.yaml).** SPEC section 5 names *Seedream v4* (image)
    and *Kling / Seedance* (video). Those are not the installed SDK's typed endpoints.
    Because `subscribe` takes arbitrary endpoint strings, they *may* be callable, but the
    account determines that (section 9 asks Sakshi to confirm). **Default routes use the
    SDK's own documented endpoints — Soul (`/v1/text2image/soul`) and DoP
    (`/v1/image2video/dop`, `dop-turbo`)** as the known-good baseline, with the SPEC
    names recorded as commented alternates to confirm. Per section 8, if a model id in
    routes.yaml is rejected at real-call time I will report it and stop, not substitute.

12. **Credits are estimated, not returned.** `V2Response` carries no credit/seconds
    field. `estimated_credits` is computed from a cost table in `routing/routes.yaml`
    (credits per image; credits per video-second × duration). Dry-run sums these; real
    stages record the same estimate. Matches section 9's "put their credit cost per
    second in routes.yaml".

13. **Anthropic (`@anthropic-ai/sdk` 0.126).** `client.messages.create(...)`.
    - `json(prompt, schema)`: forced structured output via a single tool whose
      `input_schema` is the JSON Schema, `tool_choice: { type:'tool', name }`, then read
      the `tool_use` block's `input` and validate with Zod. (Anthropic has no OpenAI-style
      "JSON mode"; forced tool use is the robust equivalent.)
    - `vision(images, rubric)`: `messages.create` with content blocks
      `{ type:'image', source:{ type:'base64', media_type, data } }` + the rubric text.
    - Model id from routes.yaml (`claude-sonnet-5`).

14. **ElevenLabs (`@elevenlabs/elevenlabs-js` 2.68).**
    `new ElevenLabsClient({ apiKey })`; `client.textToSpeech.convert(voiceId, { text,
    modelId, outputFormat })` → `ReadableStream<Uint8Array>` (drain to a .wav/.mp3 file).

15. **Review-board design source (A7).** Dashboard mockups live in the "Design (canvas)"
    artifact <https://claude.ai/artifact/FQGfVevxiuJQdu5ZAP5xWR> — artboards
    `project/Main.dc.html` (brief list) and `project/Review.dc.html` (brief detail).
    Re-read at A7 and rebuild as the Next.js review board.

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
