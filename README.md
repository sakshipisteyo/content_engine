# Content Engine (local spike)

Brief + brand → compiled prompts → Higgsfield pixels → scored, ranked, assembled,
ready-to-post content, with a browser review board and a cost ledger. Full spec in
[SPEC.md](SPEC.md); decisions and deviations in [DECISIONS.md](DECISIONS.md).

## Status

Building against SPEC section 7 acceptance tests (A1 → A8). See DECISIONS.md for the
current state and known blockers (ffmpeg, API keys, real brand/briefs).

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
