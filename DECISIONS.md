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

## 2026-09-18 — Engine build (A-test steps 3–4: A1 + A2 green)

16. **Compile stage is deterministic; Claude used for copy + scoring.** SPEC section 5
    maps stage 1 (compile) to "Claude Sonnet, JSON mode". In the spike the compile stage
    builds the PromptPlan by interpolating the YAML templates and validates it as JSON
    against the `PromptPlan` Zod contract (the "JSON mode" guarantee is thus enforced).
    Claude Sonnet is used inside the pipeline for the copy stage (stage 5) and vision
    scoring (stages 3/8); Higgsfield for pixels. Rationale: a deterministic compile keeps
    `--dry-run` credit estimates exact and every stage reproducible/idempotent. `refine.ts`
    shows the Claude pattern if LLM-authored image prompts are wanted later.

17. **score-2 (stage 8) reuses score-1 ranking in the spike.** It records a ledger row
    per survivor (so the stage is represented) rather than making a second, costlier
    vision pass over the finals. Ranks come from score-1. Upgrade to a real finals pass
    is a small change in `stageScore2`.

18. **DoP image-to-video needs a public image_url for the hero.** The v2 DoP input takes
    `input_images: [{ type:'image_url', image_url }]`. Hosting the local hero (Higgsfield
    asset upload or a temp host) is not yet wired — `uploadHeroPlaceholder()` throws so the
    motion stage records a clear failure. **Wire this before A4.**

19. **A2 verified:** dry-run compiles all briefs, writes `out/<id>/prompt.json`, prints
    per-brief + total estimated credits, and creates NO `data/ledger.sqlite` (0 provider
    calls). A1 verified: `typecheck` clean, 20/20 unit tests pass (compile shape, every
    scorer hard check, ledger read/write/idempotency).

20. **Placeholder brand assets generated** via `scripts/make-placeholders.ts`
    (solid two-tone jpgs + a simple logo) so stages 2/7 have inputs. Replace with the
    real Banjaaran kit before real generation.

## 2026-09-18 — Review board (A7) built against mock data

21. **node:sqlite loaded via `process.getBuiltinModule("node:sqlite")`** in both the
    engine ledger and the board. `createRequire` worked under tsx/vitest but Turbopack
    (Next 16's bundler) tried to inline the builtin and failed. `getBuiltinModule`
    (Node 22.3+/24) returns the builtin without an import/require the bundler analyses.

22. **The review board is decoupled from the engine package.** It reads `out/*/prompt.json`,
    `out/*/brief.json`, `out/*/v*/score.json` and the ledger directly (fs + node:sqlite),
    with its own small copies of the JSON types and the ledger schema. This keeps the Next
    dev server free of the engine's native deps (sharp/execa) and provider SDKs. Minor
    duplication of the ledger table DDL is accepted; both sides use CREATE IF NOT EXISTS.

23. **compile/dry-run also writes `out/<id>/brief.json`** so the detail page can show the
    hook/angle/CTA/style-anchor without parsing YAML in the board.

24. **Board scope follows SPEC section 6, not the fuller mockups.** Three screens only:
    `/` (brief cards), `/brief/[id]` (detail), `/report`. The mockups' calendar, brand
    memory, performance, scheduling and "render 4K" are out of scope (SPEC section 1) and
    omitted. No prompt text / model names / credit numbers on `/` or `/brief/[id]` per the
    section-6 rule; those live on `/report`. Media is served from `out/` via
    `/api/media/[...path]` (never copied).

25. **Re-run wiring** (`/api/rerun`) spawns `node --import tsx scripts/run.ts --only <id>
    --from <stage> --note "…"` detached, but only if `.env` has keys; otherwise it records
    the edit decision and reports "needs keys". Verified the board renders all three
    screens on localhost:3000 and that Approve writes a decisions row that re-renders as
    "Approved".

26. **`scripts/seed-mock.ts`** fabricates a full `out/` + ledger dataset (placeholder
    heroes, synthetic score cards with one hidden hard-fail per 3-variant brief, ledger
    rows, two human ratings) so the board is testable with zero provider calls. Real runs
    overwrite it; delete `out/` and `data/` for a clean slate before real generation.

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

## 2026-09-27 → 2026-10-02 — Text posts, security, demo deploy, local-first

27. **Typographic renderer for text-first posts** (`typographic.ts`, `slides.ts`,
    `layouts.ts`). Clients asked for tweet-style quote cards and LinkedIn swipe carousels.
    These are drawn locally with sharp/Pango, not by Higgsfield: 0 credits, no keys,
    seconds per post, and exact typography an image model can't guarantee. Template field
    `renderer: typographic` + `layout` picks this path.

28. **Native layout per aspect, not crops.** 4:5, 1:1 and 9:16 each get their own
    composition; text auto-fits by binary search on font size. Carousels skip 9:16
    (stories don't swipe like feed carousels).

29. **Deterministic scoring for text posts.** WCAG contrast (text 4.5:1, secondary 3:1) and
    fit; overflow is a `legibility` hard fail. No vision model needed for layout we drew.

30. **Brand identity only, never impersonation.** Quote cards show the brand's own name,
    handle and avatar; no verified badges or engagement counts. Quoting someone else goes in
    the credit line.

31. **Outline formats are plain text** (`outline.ts`): carousel `## Label | Headline` +
    paragraphs + `- bullets`; tips one per line; comparisons alternating `Label: text`.
    Typable in a textarea, parseable without an LLM. Optional LLM draft when blank.

32. **Own minimal PDF writer** (`pdf.ts`) for LinkedIn document carousels: JPEG pages
    embedded as-is (DCTDecode). Avoids a PDF dependency.

33. **Malware tripwire** (`scripts/tripwire.mjs`) after the PolinRider injection in
    `571b629`. Zero dependencies, read-only. Runs in CI, in the deploy build and as a
    pre-commit hook. Signatures listed in ARCHITECTURE.md section 9.

34. **History rewrite paused.** Removing `571b629`/`8e93b22` from history needs a force-push
    of `main`; the owner paused it because a client uses `main`. Files are clean; the
    commits stay until the owner approves.

35. **Single admin login** (`lib/auth.ts`, `proxy.ts`) for demos: env-configured, HMAC
    cookie, fails closed on Vercel without a password, off locally without one. Not
    multi-tenant on purpose (Phase 3).

36. **`DATA_ROOT` split** (`CONTENT_DATA_DIR`): config stays in the repo, generated state
    (brand/, briefs, uploads, out/, data/) goes to a writable dir. Needed for read-only
    hosts; locally they are the same directory. `brand/` moved under `DATA_ROOT` so the
    brand wizard can write.

37. **Bundled DejaVu Sans** loaded with `fontfile`. Serverless hosts have no system fonts
    and Pango rendered text as a tiny sliver.

38. **Engine scripts bundled with esbuild for deploys** (`build-engine.mjs`), so the board
    can spawn them without tsx/TypeScript at run time. The prep (`vercel-prep.mjs`) runs
    from the app's own `build` script because Vercel ignores the root `vercel.json` when
    the project Root Directory is `apps/review`.

39. **Vercel is demo-view only; local is the supported setup.** Vercel's `/tmp` is per
    function instance and requests spread across instances, so brands/posts created on the
    site 404 on later requests (seen 2026-10-01). A single-server rehearsal had missed
    this. Proper hosting: persistent-disk server, or object storage + Postgres + a job
    queue (ARCHITECTURE.md section 8).

40. **Node 22.5+ required** (`engines`), because the ledger uses `node:sqlite`.

41. **Hashtags are brand-derived only.** `#handcrafted #slowfashion` were hard-coded from
    the first (fashion) brand and leaked into every brand's captions; removed.

42. **Windows setup without corepack.** `corepack enable` fails with EPERM writing to
    `C:\Program Files\nodejs`; `npm install -g pnpm@9.15.0` works without admin. PowerShell
    may also need `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 2026-10-05 — Brand intake v2 (SaaS/AI clients and enterprises)

43. **Four-step intake replaces the one-page wizard.** Copy was generic because the engine
    knew only name, tone and colours. The intake adds offer, proof points, audience pains,
    goals, channels, content pillars, default CTA, examples, brand rules and a disclaimer.
    All new brand fields are optional so existing brand files and the demo stay valid.

44. **Service brands need no photos.** Offerings are stored as products without images,
    so briefs, compile and the Create form work unchanged. Unnamed product photos take the
    brand name (uploads are renamed `product-N`, so file names carry no meaning).

45. **Enterprise identity is exact, not inferred.** Entered colours lock the palette
    (`palette_locked`), primary first, and the brand theme uses the primary. Brand fonts
    are uploaded files loaded by path (the family name read from the file), because
    serverless and fresh machines don't have them installed. Verified with no system fonts:
    unregistered family renders as a 188x12 sliver, registered renders correctly.

46. **Proof points are the only facts copy may state.** The copy prompt says so, to stop
    invented statistics in client posts.

47. **Disclaimer lives in the caption, applied at compile and after AI copy**, so the board,
    caption.txt and AI-written captions all carry it, once. Drawing it on the image is
    deferred.

48. **`/api/brand` accepts only image and .ttf/.otf extensions** and removes the brand folder
    if creation fails, so a failed submit leaves nothing half-made.

## 2026-10-06 — Video: walkthroughs, product demos, cinematic, presenter (Higgsfield)

49. **Video posts are edits, not single generations (`renderer: montage`).** Enterprise
    clients need demos and walkthroughs; one 5 s AI clip isn't a demo. A local editor cuts
    real screens, AI shots and branded cards into one video per size.

50. **Higgsfield for what AI does well; real screens for the product.** DoP camera motions
    animate product photos, Soul + DoP make cinematic scenes, Speak lip-syncs a presenter.
    AI would invent a client's UI, so walkthroughs always use the uploaded screens.

51. **Free draft first, credits on request.** Create renders a draft locally (AI shots stood
    in by camera moves, labelled as such); "Render with Higgsfield" shows the credit estimate,
    asks to confirm, refuses over the post's cap or without a key.

52. **ffmpeg is bundled from npm (`@ffmpeg-installer/ffmpeg`).** The owner's Windows laptop
    has no ffmpeg and the setup must stay one `pnpm install`. Chosen over `ffmpeg-static`
    because its binaries come from the npm registry (no download-from-GitHub install script,
    lockfile stays registry-only for the tripwire). Trade-off: ffmpeg 4.1, no `xfade`.

53. **All video text is drawn by our renderer as PNG overlays**, never ffmpeg `drawtext`:
    same brand font and look as the posts, and no system font dependency (the old
    assembler had a hard-coded `C:/Windows/Fonts/arial.ttf`).

54. **Higgsfield upload uses the SDK's v1 client** (`upload` / `getMotions`); the v2 client
    used for jobs has no upload. This also replaced the "hero upload not wired" stub, so the
    existing UGC ad path can reach DoP once keys exist.

55. **Camera moves are friendly names matched to the live preset list** (`pickMotion`),
    cached for a day; an unmatched name falls back to describing the move in the prompt.

56. **Every MP4: H.264 High, yuv420p, AAC (silent if no music), faststart**, the format
    LinkedIn, Instagram, X, YouTube and every browser accept. The media route serves byte
    ranges so Safari plays and all browsers seek.

57. **Text post -> video export** (slideshow / gentle push-in) for Reels, Shorts and LinkedIn
    video from the free text posts, at no cost.

## 2026-10-07 — Photo text posts and the AI writer

58. **Photo headline and stat card are typographic layouts, not AI images with text.** Image
    models garble text; drawing the words ourselves over a photo keeps type exact, on-brand
    and checkable (fit + contrast), and works free with an uploaded or brand photo.

59. **One AI photo per post, reused.** The Higgsfield scene image is generated once
    (`out/<id>/scene.png`) and shared by all three treatments and re-renders, within the
    post's credit cap.

60. **The AI writer drafts, the person decides.** It fills the form and explains its pick;
    rendering still needs the user's click. Facts come only from their notes and proof
    points, so it never invents numbers for stat posts.

61. **Claude through the official Anthropic SDK for new AI features** (`claude-opus-5-5`,
    structured outputs, refusal fallback). The old provider used forced `tool_choice`,
    which current models reject; it now uses `output_config.format`. OpenRouter stays as a
    fallback so an existing OpenRouter key still works. Installing `@anthropic-ai/sdk`
    also cleared a long-standing typecheck error.

62. **Drafts are validated against the template and retried once**, so a malformed outline
    surfaces as a clear error instead of a broken post.

## 2026-10-07: news ideas, background quality, honest captions, video fixes

63. **"What's new" ideas come from a live web search, filtered for trust.** OpenRouter's web
    plugin (the existing key, ~3 cents) searches the brand's field (category, offer, pillars,
    audience), so it works for any industry. A story is kept only if its URL is one the search
    returned (the model can't invent a story + plausible link), it is dated inside the window
    and the link opens. Ideas are the brand's take, never a news summary; the post carries the
    source and its caption names and links it (`brief.source`).

64. **AI backgrounds follow the brand's imagery rules and are vision-checked.** The scene prompt
    adds the first style anchor, palette and `banned_visuals`, and forbids lettering, documents,
    diagrams and collages (image models garble text). A vision check flags garbled text or a
    collage and regenerates once within the credit cap. Logos are never used as photos or AI
    references (brand intake no longer sets the logo as the style reference).

65. **LinkedIn captions are full posts, and invented numbers are rejected.** LinkedIn briefs get
    a 110-200 word post (hook line, short paragraphs, a question). Examples must be framed as
    hypotheticals, never the brand's own experience; a caption with numbers absent from the
    facts (hook, outline, source, proof points) is rewritten once. Hashtags always get their
    `#`; `*emphasis*` stars are stripped from captions; the platform name is kept out of
    image prompts (models painted it on as a logo).

66. **Higgsfield uploads send the API's `upload_headers`.** The presigned S3 URL is now also
    signed for `x-amz-tagging`; SDK 0.2.6 (latest) sends only Content-Type, so every upload
    failed with 403 SignatureDoesNotMatch (product demo, cinematic and presenter videos).

67. **Presenter speech is laid back in by timeline position.** The editor encodes segments
    without audio, so talking-avatar videos came out silent; each Speak clip's voice is now
    mixed in at its start time (ffmpeg 4.1 compatible: `adelay` per channel, `amix`).

68. **The caption box shows the saved caption.** Edits were written to `caption.txt` but the
    board always re-showed the AI caption.
