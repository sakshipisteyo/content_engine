# Content Engine

Self-serve, on-brand social content for small and medium businesses (current target: SaaS
companies selling AI products). Add a brand once, pick a post type, type a few words, get
scored posts in every size to review, approve, download and schedule.

- **Architecture, data flow, deploy and security:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Rules for AI agents picking this up:** [CLAUDE.md](CLAUDE.md)
- Original spec [SPEC.md](SPEC.md) · vision and phases [PLAN.md](PLAN.md) · decisions [DECISIONS.md](DECISIONS.md)

## Status (2026-10-02)

- **Works today, no API keys:** review board, 4-step brand intake (product, service and
  enterprise brand kits with exact colours and own fonts), and four text post types
  (quote card, insight carousel with LinkedIn PDF, tips list, myth vs fact) rendered
  locally for free, approvals, schedule, report.
- **AI writer:** "Let AI write it" on New post — paste rough notes (or nothing) and Claude
  picks the post type and writes it; "Give me ideas" suggests posts from your pillars.
  Needs `ANTHROPIC_API_KEY` (or an `OPENROUTER_API_KEY`).
- **Photo posts:** Photo Headline and Stat Card — bold text over your photo, a brand photo,
  or a Higgsfield-generated scene.
- **Video (works today, free drafts):** product walkthroughs from your screenshots or
  screen recordings, product demos, cinematic brand films and presenter/UGC videos in
  16:9, 9:16 and 1:1, plus "Make a video" on any text post. ffmpeg is bundled, nothing to
  install. **Render with Higgsfield** turns the draft's stand-in shots into real AI shots
  (needs `HIGGSFIELD_API_KEY`; presenter videos also `ELEVENLABS_API_KEY`).
- **Built, needs keys:** photo/video posts through Higgsfield + Claude (OpenRouter) +
  ElevenLabs. Not yet run for real.
- **Run it locally.** The Vercel deployment is for viewing demo posts only (see
  "Deploy a demo to Vercel").

## Run it on Windows (local)

Needs **Node 22.5 or newer** (nodejs.org, LTS) and Git. In PowerShell (not as Administrator):

```powershell
git clone https://github.com/sakshipisteyo/content_engine.git
cd content_engine
git config core.hooksPath .githooks
node scripts/tripwire.mjs          # must print "tracked files clean" before you install
npm install -g pnpm@9.15.0
pnpm install
pnpm seed                          # demo posts; run ONCE (it wipes out/ and the ledger)
pnpm review                        # http://localhost:3000
```

Next time: `cd content_engine` then `pnpm review`. Stop with Ctrl+C.

Fixes for common errors:

- `corepack enable` -> `EPERM ... C:\Program Files\nodejs\yarn`: skip corepack, use
  `npm install -g pnpm@9.15.0` as above.
- `npm.ps1 cannot be loaded because running scripts is disabled`: run
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `npm.cmd` / `pnpm.cmd`.
- `pnpm` not recognized after installing: open a new PowerShell window.
- The dev server also listens on your LAN address and has no login locally. On shared
  Wi-Fi start it with a password: `$env:ADMIN_PASSWORD="choose-one"; pnpm review`.

macOS/Linux: same commands; `corepack enable` usually works instead of the npm install.

The board reads `out/` and `data/ledger.sqlite`. Demo posts are for two sample brands
(Banjaaran, fashion; BrewCraft, coffee): text posts are real renders, photo/video posts use
placeholder images and fake scores, zero provider calls.

## Text posts (quote cards) — real output, no keys

The `quote-card` template is drawn locally (sharp), not by Higgsfield: 0 credits, no API
keys. Pick **Quote Card** on `/create`, write the statement, optionally a credit line, and
it renders dark, light and brand-colour versions at 4:5, 1:1 and 9:16 straight away.
From the CLI:

```
pnpm exec tsx scripts/create.ts --brand banjaaran --template quote-card \
  --hook "Good craft is slow on purpose." [--attribution "Name"] --cta "Follow for more"
```

The card shows the brand's own identity: optional `social: { display_name, handle, avatar }`
and `font` in `brand/<key>.yaml` (defaults: brand name, handle from the name, the logo).
It never draws a verified badge or engagement counts; quoting someone goes in the credit line.

### More text templates (same renderer, 0 credits)

| Template | What you write | Output |
|---|---|---|
| `insight-carousel` | cover title + outline: subtitle line, then `## Label \| Headline` pages with paragraph and `- bullet` lines | cover + pages + CTA page, PNG pages and a LinkedIn PDF (4:5 and 1:1) |
| `tips-list` | title + one tip per line | one card, 4:5 / 1:1 / 9:16 |
| `myth-vs-fact` | title + alternating `Myth: …` / `Fact: …` lines (any two labels, e.g. Before/After) | two-column card, 4:5 / 1:1 / 9:16 |

The Create form shows the outline format as the placeholder. Leave the outline blank and,
with `OPENROUTER_API_KEY` set, the copy model drafts it from the title. CLI: `--body "..."`.

## Deploy a demo to Vercel (view-only demo)

**Limit first:** Vercel's files are read-only and its `/tmp` is separate per server
instance, so brands and posts created on the site can disappear or 404 on the next click.
The seeded demo posts always show. Use local for anything you create; see
ARCHITECTURE.md section 8 for what real hosting needs.


1. In your Vercel account: **Add New → Project → Import** `sakshipisteyo/content_engine`.
   Root Directory can be the repo root or `apps/review`; the app's build script runs the prep.
2. **Settings → Environment Variables** (Production and Preview):
   - `ADMIN_PASSWORD`: the admin password (required; without it every request gets 503)
   - `AUTH_SECRET`: a long random string that signs the login cookie
   - `ADMIN_USERNAME`: optional, default `admin`
3. Deploy. The build runs the tripwire, bundles the engine, renders the demo posts and
   builds the board. Sign in at `/login`.

Reliable on the deployment: login, the board, the seeded demo posts, downloads
(PNG/JPG/PDF). Unreliable: creating brands or posts (per-instance `/tmp`, above). Set
`DATABASE_URL` (Neon) to keep approvals, captions and the schedule across restarts.

Locally, login is off unless `ADMIN_PASSWORD` is set.

## Go live (real generation)

1. `cp .env.example .env` and fill in the three provider keys (set a Higgsfield spend cap first).
2. `winget install Gyan.FFmpeg`, then reopen the terminal (needed for video/assemble).
3. Confirm the Higgsfield model ids + per-second credit costs in `routing/routes.yaml`.
4. Delete the mock data for a clean slate: remove `out/` and `data/ledger.sqlite`.
5. One real call per provider, then a brief:
   ```
   pnpm exec tsx scripts/run.ts --only banj-001 --format image
   ```
6. Refresh the review board — real content appears in the same screens.

## Security: tripwire

Commit `571b629` (2026-09-20) was injected by malware on the dev machine (the "PolinRider"
pattern): an obfuscated payload hidden after hundreds of spaces at the end of
`apps/review/postcss.config.mjs`, and `.gitignore` entries hiding its `temp_*_push.bat`
helpers. The payload was removed in `b3f9dca`; the commit stays in history, so never check
out or run `571b629`.

`scripts/tripwire.mjs` fails on those signs (huge or whitespace-padded lines, obfuscation in
config files, tracked `.bat`/`.ps1`/executables, install scripts, non-npm tarballs). It runs:

- on every push/PR (`.github/workflows/tripwire.yml`)
- before every Vercel build (`scripts/vercel-prep.mjs`) — a tripped wire deploys nothing
- before every local commit, once enabled per clone: `git config core.hooksPath .githooks`

Run it any time: `node scripts/tripwire.mjs`, and always on a fresh clone before `pnpm install`.
Removing `571b629`/`8e93b22` from history is paused (a client uses `main`); see ARCHITECTURE.md section 9.

## Prerequisites

- Node 22.5+ (the ledger uses `node:sqlite`), Git, pnpm 9.15.0.
- ffmpeg on PATH (`winget install Gyan.FFmpeg`): only for the video/assemble stages.
- If a global `pnpm` can't be installed, prefix commands with `corepack pnpm@9.15.0`.

## Commands

```
pnpm test                       # engine unit tests
pnpm --filter review typecheck  # board typecheck
pnpm tripwire                   # malware tripwire
pnpm seed                       # demo data (wipes out/ + ledger)
pnpm review                     # board at http://localhost:3000
# compile + estimate credits, no provider calls:
pnpm exec tsx scripts/run.ts --briefs briefs --format all --dry-run
# run one brief for real (needs keys):
pnpm exec tsx scripts/run.ts --only banj-001 --format image
# cost / pass-rate / agreement report:
pnpm report
```

## Layout

See ARCHITECTURE.md section 3 (repo map) and SPEC section 3. Engine code in `packages/engine/src`, review board in `apps/review`,
YAML config in `prompts/`, `routing/`, `brand/`, `briefs/`, outputs in `out/`, ledger in
`data/ledger.sqlite`.
