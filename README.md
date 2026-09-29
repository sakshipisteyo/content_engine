# Content Engine (local spike)

Brief + brand → compiled prompts → Higgsfield pixels → scored, ranked, assembled,
ready-to-post content, with a browser review board and a cost ledger. Full spec in
[SPEC.md](SPEC.md); decisions and deviations in [DECISIONS.md](DECISIONS.md).

## Status

Built against SPEC section 7 (A1 → A8). A1 (typecheck + tests) and A2 (dry-run) pass.
The engine (compile → hero → score → motion → copy → voice → assemble → score-2),
`run.ts`/`report.ts`, and the Next.js review board are all in place. A3–A6, A8 need API
keys + ffmpeg (see below). See [DECISIONS.md](DECISIONS.md) for deviations and blockers.

## Test the review board on localhost now (no keys needed)

```
corepack pnpm@9.15.0 exec tsx scripts/seed-mock.ts   # fabricate mock out/ + ledger
corepack pnpm@9.15.0 --filter review dev             # http://localhost:3000
```

The board reads `out/` and `data/ledger.sqlite`. Mock data uses placeholder images; it
lets you click through the brief list, a brief's ranked variants + scorecards, editable
caption, approve/reject/rate, and the /report page — all with zero provider calls.

## Text posts (quote cards) — real output, no keys

The `quote-card` template is drawn locally (sharp), not by Higgsfield: 0 credits, no API
keys. Pick **Quote Card** on `/create`, write the statement, optionally a credit line, and
it renders dark, light and brand-colour versions at 4:5, 1:1 and 9:16 straight away.
From the CLI:

```
corepack pnpm@9.15.0 exec tsx scripts/create.ts --brand banjaaran --template quote-card \
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

## Deploy a demo to Vercel (admin login)

1. In your Vercel account: **Add New → Project → Import** `sakshipisteyo/content_engine`.
   Leave Root Directory as the repo root; `vercel.json` sets the build.
2. **Settings → Environment Variables** (Production and Preview):
   - `ADMIN_PASSWORD`: the admin password (required; without it every request gets 503)
   - `AUTH_SECRET`: a long random string that signs the login cookie
   - `ADMIN_USERNAME`: optional, default `admin`
3. Deploy. The build runs the tripwire, bundles the engine, renders the demo posts and
   builds the board. Sign in at `/login`.

What works on the deployment: the board, the demo posts, downloads (PNG/JPG/PDF), and
**creating text posts** (quote card, insight carousel, tips list, myth vs fact) with no
API keys. New posts live in the function's `/tmp`: they can vanish when Vercel starts a
fresh instance, so treat them as demo data. Photo/video templates still need provider
keys, and the brand wizard needs a writable repo, so use those locally. Set
`DATABASE_URL` (Neon) to keep approvals, captions and the schedule across restarts.

Locally, login is off unless `ADMIN_PASSWORD` is set.

## Go live (real generation)

1. `cp .env.example .env` and fill in the three provider keys (set a Higgsfield spend cap first).
2. `winget install Gyan.FFmpeg`, then reopen the terminal (needed for video/assemble).
3. Confirm the Higgsfield model ids + per-second credit costs in `routing/routes.yaml`.
4. Delete the mock data for a clean slate: remove `out/` and `data/ledger.sqlite`.
5. One real call per provider, then a brief:
   ```
   corepack pnpm@9.15.0 exec tsx scripts/run.ts --only banj-001 --format image
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
- before every Vercel build (`vercel.json` `buildCommand`) — a tripped wire deploys nothing
- before every local commit, once enabled per clone: `git config core.hooksPath .githooks`

Run it any time: `corepack pnpm@9.15.0 tripwire`.

## Prerequisites

- Node 20+ (machine has 24). Git. ffmpeg on PATH (`winget install Gyan.FFmpeg`) — needed
  for video/assemble stages only.
- pnpm via corepack. This machine can't write the global shim, so commands are run as
  `corepack pnpm@9.15.0 <args>` (see DECISIONS.md #5). Where this README says `pnpm`,
  use that form until a bare `pnpm` is installed.

## Setup

```
corepack pnpm@9.15.0 install
cp .env.example .env   # then fill in keys before real generation
```

## Commands

```
corepack pnpm@9.15.0 typecheck
corepack pnpm@9.15.0 test
# compile + estimate credits, no provider calls:
corepack pnpm@9.15.0 exec tsx scripts/run.ts --briefs briefs --format all --dry-run
# run one brief for real (needs keys):
corepack pnpm@9.15.0 exec tsx scripts/run.ts --only banj-001 --format image
# cost / pass-rate / agreement report:
corepack pnpm@9.15.0 exec tsx scripts/report.ts
# review board at http://localhost:3000:
corepack pnpm@9.15.0 --filter review dev
```

## Layout

See SPEC section 3. Engine code in `packages/engine/src`, review board in `apps/review`,
YAML config in `prompts/`, `routing/`, `brand/`, `briefs/`, outputs in `out/`, ledger in
`data/ledger.sqlite`.
