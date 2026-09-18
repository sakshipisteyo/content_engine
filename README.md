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
