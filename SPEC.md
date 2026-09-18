# Content Engine — Claude Code Handoff Spec

Sep 18, 2026 · @Sakshi

Three-day local spike at `C:\content_engine`. Hand this whole doc to Claude Code; section 10 is the opening prompt.

## 1. What to build

A local command-line engine that takes a one-paragraph brief plus a brand file and returns finished, scored, ready-to-post content (images and short videos), with a browser review board and a cost ledger. Higgsfield generates pixels; the engine decides what to ask for, throws away what is off-brand, and assembles the rest.

```
flowchart LR
  BR[brief.yaml] --> C[Compile\nbrief + brand to prompts]
  BM[brand.yaml] --> C
  C --> G[Generate\nHiggsfield images / clips]
  G --> S[Score\nreject off-brand, rank]
  S --> A[Assemble\ncopy, VO, captions, crops]
  A --> R[Review board\napprove / reject / edit]
  R --> L[(ledger.sqlite\ncost + decisions)]
  L -.-> C
```

The dotted arrow is what makes it an engine rather than a script: decisions and costs feed the next compile. In the spike this is a stub; the shape must exist.

Out of scope for the spike: auth, tenants, cloud database, publishing to platforms, billing, strategy or calendar generation.

## 2. Stack and hard constraints

TypeScript everywhere, local only, no cloud services beyond the three model providers.

| Concern | Choice |
| --- | --- |
| Runtime | Node 20 LTS, pnpm workspaces, TypeScript strict, tsx for scripts |
| Providers | higgsfield-js (images, video, audio), @anthropic-ai/sdk (Claude Sonnet for compile, copy, vision scoring), @elevenlabs/elevenlabs-js (voiceover) |
| Media | sharp (crops, palette, resize), ffmpeg binary on PATH via execa |
| Storage | Files under out/, better-sqlite3 at data/ledger.sqlite |
| Review UI | Next.js 15 app router in apps/review, reads out/ and the SQLite file, Tailwind |
| Config and validation | YAML for prompts, briefs and brand; Zod schemas for every contract |
| Secrets | .env at repo root, loaded with dotenv; .env in .gitignore from the first commit |

Hard constraints:

- Windows 11 host, path `C:\content_engine`. Use `path.join` everywhere; no shell-specific scripts, npm scripts only.
- Every provider call goes through `packages/engine/src/providers/*`. No SDK import anywhere else.
- Every prompt string lives in `prompts/*.yaml`. No prompt text in `.ts` files.
- Every model id lives in `routing/routes.yaml`. No model id in code.
- Every stage writes a ledger row before it returns, including failures.
- Video generated at 720p or 1080p only. No 4K in the spike.
- `--dry-run` compiles prompts and prints estimated credits without calling any provider. It must work before the first real call.
- Per-brief credit cap from the brief file; the pipeline stops that brief when hit and records why.

## 3. Repo layout

```
C:\content_engine\
  package.json  pnpm-workspace.yaml  tsconfig.base.json  .env  .gitignore
  apps\
    review\                 Next.js review board (section 6)
  packages\
    engine\
      src\
        providers\
          higgsfield.ts     generate(task, params) -> { files, credits, seconds }
          anthropic.ts      json(prompt, schema), vision(images, rubric)
          elevenlabs.ts     speak(text, voiceId) -> wav
        compile.ts          brief + brand + prompts -> PromptPlan
        generate.ts         PromptPlan -> images / clips via routing table
        score.ts            hard checks + rubric -> ScoreCard per variant
        assemble.ts         clips + VO + captions + logo -> mp4s, crops
        pipeline.ts         runImagePost(brief), runVideoPost(brief)
        ledger.ts           SQLite: jobs, stages, costs, decisions
        schemas.ts          Zod: Brief, Brand, PromptPlan, ScoreCard, LedgerRow, Decision
      test\                 unit tests for compile, score rules, ledger
  prompts\
    image.yaml  video.yaml  copy.yaml  score.yaml
  routing\routes.yaml
  brand\<brand>.yaml
  brand\<brand>\assets\     logo.png, 5-10 product shots, 2-3 past winners
  briefs\<id>.yaml           20 files
  out\<brief_id>\<variant>\ hero.png, clip.mp4, final_9x16.mp4, final_1x1.mp4, final_4x5.mp4, caption.txt, prompt.json, score.json
  data\ledger.sqlite
  scripts\
    run.ts                  tsx scripts/run.ts --briefs briefs --format image|video|all [--dry-run] [--only <id>]
    report.ts               tsx scripts/report.ts  -> cost per post, pass rates, human vs scorer agreement
```

## 4. Data contracts

All five are Zod schemas in `schemas.ts`; YAML files are validated on load and the run stops on the first invalid file.

### Brief (briefs/<id>.yaml)

```yaml
id: banj-001
brand: banjaaran
format: video            # image | video
platform: instagram      # instagram | linkedin | youtube
hook: Hand-stitched in Kolhapur. Worn in Bandra.
angle: artisan pride, no discount talk
cta: Festive edit, link in bio
products: [kolhapuri-tan]
style_anchor: warm-evening   # key in brand.style_anchors
variants: 3
credit_cap: 40
```

### Brand (brand/<brand>.yaml)

```yaml
name: Banjaaran Studio
category: handcrafted footwear
audience: urban women 25-40, values craft over trend
tone: [warm, confident, unhurried]
banned_words: [cheap, sale, discount]
banned_visuals: [studio white background, mannequins]
palette: ['#B5471F', '#D9C3A3', '#2F5D50', '#1C1A17']
logo: assets/logo.png
products:
  kolhapuri-tan: { name: Kolhapuri Tan, price_inr: 3200, images: [assets/kolh-1.jpg, assets/kolh-2.jpg] }
style_anchors:
  warm-evening: { description: golden hour, street, shallow depth, references: [assets/win-1.jpg] }
voice_id: <elevenlabs voice id>
```

### PromptPlan (output of compile, saved as prompt.json)

| Field | Type | Notes |
| --- | --- | --- |
| brief_id, brand, format | string | copied |
| shots[] | array | one per variant: image_prompt, negative_prompt, reference_images[], aspect, video_prompt?, camera? |
| copy | object | script?, caption, hashtags[] |
| routing | object | resolved model ids per task from routes.yaml |
| estimated_credits | number | printed in dry-run |
| versions | object | brand_hash, prompt_yaml_hash, routes_hash |

### ScoreCard (score.json per variant)

`hard_fails[]` (aspect, palette_distance, artefacts, legibility, banned_visual), `soft` (brand_fit, product_clarity, hook_strength, platform_fit, each 1-5), `total`, `rank`, `reasons[]`.

### Ledger (ledger.sqlite)

table `stages` (run_id, brief_id, variant, stage, model, credits, seconds, status, error, started_at); table `decisions` (brief_id, variant, action approve|reject|edit, note, rating 1-5, decided_at). `report.ts` joins them.

## 5. Pipeline stages

Seven stages; each is a function `(ctx, input) -> output` that writes one ledger row, is safe to re-run for the same (brief_id, variant, stage), and never calls a provider outside `providers/`.

| # | Stage | Input | Output | Model (from routes.yaml) | Fail rule |
| --- | --- | --- | --- | --- | --- |
| 1 | compile | Brief, Brand, prompts/*.yaml | PromptPlan | Claude Sonnet, JSON mode | Invalid JSON: retry once with error appended; then stop brief |
| 2 | hero | PromptPlan.shots | hero.png x variants | Higgsfield text-to-image (default Seedream v4; reference images when style_anchor set) | Provider error: retry once; over credit_cap: stop brief |
| 3 | score-1 | hero images, Brand | ScoreCard per image | Claude vision + sharp palette distance | Hard fail: variant dropped; if all dropped, re-run stage 2 once with negative prompt strengthened |
| 4 | motion (video only) | top 2 heroes, PromptPlan.video_prompt | clip.mp4 5-10s, 720p | Higgsfield image-to-video (default Kling; fallback Seedance) | Same as stage 2 |
| 5 | copy | PromptPlan, Brand | caption, hashtags, script (video) | Claude Sonnet | Banned word present: regenerate once, then flag |
| 6 | voice (video only) | script, Brand.voice_id | vo.wav | ElevenLabs | Error: continue without VO, flag |
| 7 | assemble | clip or hero, vo, caption, logo | final_9x16.mp4, final_1x1.*, final_4x5.*, caption.txt | ffmpeg, sharp | ffmpeg non-zero exit: log stderr line, mark failed |
| 8 | score-2 | finals | ScoreCard, rank | Claude vision | Rank written; nothing dropped here, board shows all survivors |

Stage ordering rules: stage 3 runs before stage 4 so video credits are spent only on images that passed. Re-runs from the review board name a stage and re-execute from it onward with the edit note appended to that stage's prompt.

Scorer hard checks, deterministic before any LLM call: aspect ratio equals requested within 1%; mean palette distance to Brand.palette below threshold in `prompts/score.yaml`; file decodes and is not blank. LLM rubric follows, returning the four soft scores and reasons in JSON.

## 6. Review board

A local Next.js app at http://localhost:3000 that lists every brief in `out/`, shows its surviving variants ranked, and records decisions to the ledger; it follows the dashboard mockups already on canvas.

| Screen | Shows | Actions |
| --- | --- | --- |
| / | Cards per brief: top variant preview, hook, format and platform pills, variant count, status (pending / approved / rejected / failed) | Open; quick Approve top variant |
| /brief/[id] | Large preview of ranked-first variant (video plays), thumbnails of others, ScoreCard bars and reasons, hidden variants with hard-fail reason, caption in an editable textarea, brief fields | Approve variant; Reject brief; Edit note + choose stage + Re-run (spawns run.ts --only <id> --from <stage> --note "..."); rate 1-5 |
| /report | Output of report.ts: cost per post, cost per rated-4+ post, minutes brief-to-finals, scorer top pick vs human pick agreement, top rejection reasons | None |

Rules: no prompt text, model names or credit numbers on / or /brief/[id] (they live on /report and in prompt.json); every decision writes a decisions row immediately; media served from out/ via a route handler, never copied.

## 7. Acceptance tests and definition of done

The spike is done when all rows below pass on the real machine, in this order.

| # | Test | Pass condition |
| --- | --- | --- |
| A1 | `pnpm install && pnpm typecheck && pnpm test` | Green; unit tests cover compile output shape, every scorer hard check, ledger write |
| A2 | `tsx scripts/run.ts --briefs briefs --format all --dry-run` | Every brief validates; PromptPlan per brief in out/; total estimated credits printed; zero provider calls (assert via ledger empty) |
| A3 | `tsx scripts/run.ts --only banj-001 --format image` | 3 heroes, score.json each, caption.txt, three crops; ledger has one row per stage |
| A4 | `tsx scripts/run.ts --only banj-001 --format video` | At least one final_9x16.mp4 with audio track, captions burned, logo visible; under 15 minutes wall time |
| A5 | Kill the process mid-run, re-run same command | Completed stages skipped, missing stages run, no duplicate ledger rows |
| A6 | Set credit_cap: 5 on a brief and run | Brief stops with status = capped, reason in ledger, nothing generated past the cap |
| A7 | `pnpm --filter review dev` | / lists briefs; /brief/banj-001 plays video; Approve writes a decisions row; Re-run with note re-executes from the chosen stage |
| A8 | Full run of 20 briefs, then human ratings in the board | `tsx scripts/report.ts` prints cost per post, cost per rated-4+ post, brief-to-finals minutes, scorer vs human agreement |

Gate for the business decision, judged by the brand owner: at least 10 of 20 briefs have a variant rated 4 or 5. The number is recorded in /report, not argued about.

## 8. Ground rules for Claude Code

Build in the order of section 7; each acceptance test passing is a commit.

- Work only inside `C:\content_engine`. Never read or write outside it.
- First commit: repo skeleton, .gitignore with .env, out/, data/, node_modules/. Verify .env is ignored before anything else.
- Never print, log or commit an API key. Load from .env only.
- Before the first real provider call, run A2 (dry-run) and show the estimated credits; wait for a go-ahead in chat.
- One real call per provider first (a single image, a single 5s clip, a single 10-word VO) to confirm auth and response shape, then the pipeline.
- Read the installed SDK's types in node_modules for higgsfield-js before writing providers/higgsfield.ts; do not guess method names or model ids. If a model id in routes.yaml is rejected, report it and stop rather than substituting.
- Prompts go in YAML and are loaded at run time; if a prompt needs changing, change the YAML, not the code.
- Every stage function is idempotent by (brief_id, variant, stage): check the ledger and existing output files before running.
- No background daemons, queues or cloud services. Plain async functions with p-limit concurrency of 2 for provider calls.
- When blocked by a provider error for more than two attempts, write the exact error to `data/blockers.md` with the brief id and stage, move to the next brief, and summarise blockers at the end.
- After A8, write `REPORT.md` at the repo root: what passed, what failed, the numbers from report.ts, and the five most common rejection reasons. No claims without a ledger row behind them.
- Keep commits small with conventional messages: `feat(engine): compile stage`, `test(score): palette distance`.

## 9. Needed from Sakshi before starting

Everything below must be in place before the first run.ts; the first four block day one.

- [ ] Higgsfield API key with a spend cap set on the provider dashboard (suggest ₹5,000 for the spike). Confirm which video models the account can call (Kling, Seedance) and their credit cost per second; put them in routing/routes.yaml.
- [ ] Anthropic API key (Claude Sonnet) and ElevenLabs API key with one voice id for the brand.
- [ ] Machine ready: Node 20 LTS, pnpm, Git, ffmpeg on PATH (winget install Gyan.FFmpeg), VS Code with Claude Code. `ffmpeg -version` and `node -v` both run in a fresh terminal.
- [ ] One brand file: brand/banjaaran.yaml filled from the template in section 4, plus assets/ with logo (PNG, transparent), 5-10 product shots (at least 1500 px), 2-3 past posts that performed well. Rights to use all of them confirmed.
- [ ] 20 briefs as YAML: 12 image, 8 video; mix of Instagram and LinkedIn. Each with hook, angle, CTA, one product, one style anchor. Reuse the Banjaaran and Forest Essentials prompt work as starting points.
- [ ] Prompt seeds: paste the best existing Higgsfield / Seedance prompts into prompts/image.yaml and prompts/video.yaml as the initial templates.
- [ ] A rater: the brand owner or the marketer, available for 60-90 minutes on day 3 to rate 20 briefs in the review board.
- [ ] Decisions: default image model (Seedream v4 unless told otherwise); default video model; video length (5s or 10s); which two crops matter most per platform.
- [ ] Go / no-go in chat after the dry-run shows estimated credits, before real generation starts.

## 10. Prompt to paste into Claude Code

> Read SPEC.md fully before doing anything. It is the complete specification for a three-day local spike of a content generation engine built on Higgsfield.
>
> Your job: build exactly what SPEC.md describes, in the order of its section 7 acceptance tests (A1 to A8), following every ground rule in section 8 and every hard constraint in section 2. Commit after each acceptance test passes.
>
> Start by:
> 1. Creating the repo skeleton from section 3 with .gitignore covering .env, out/, data/, node_modules/. Show me `git check-ignore .env` output.
> 2. Installing dependencies and reading the types of higgsfield-js, @anthropic-ai/sdk and @elevenlabs/elevenlabs-js in node_modules. Summarise the exact method names you will use for text-to-image, image-to-video, JSON completion, vision, and text-to-speech.
> 3. Writing schemas.ts and loading brand/banjaaran.yaml and briefs/*.yaml with validation errors reported per file.
> 4. Implementing compile.ts and the --dry-run path, then running A2 and showing me the estimated credits.
>
> Stop after step 4 and wait for my go-ahead before any real provider call. Do not guess model ids; use routing/routes.yaml and report any the provider rejects. Prompts live only in prompts/*.yaml. Every stage writes a ledger row. Ask me only when SPEC.md is silent or contradictory; otherwise decide and note the decision in DECISIONS.md.

After the go-ahead, the follow-up prompt is one line: `Continue with A3 through A8. Write REPORT.md when A8 passes.`
