# CLAUDE.md — read before working on this repo

Content Engine: a self-serve, on-brand social content engine for SMEs (current target:
SaaS / AI companies). Brand + post type + a few words -> scored posts in every size,
reviewed on a Next.js board. Full picture: **[ARCHITECTURE.md](ARCHITECTURE.md)**. How to
run: [README.md](README.md). Why things are as they are: [DECISIONS.md](DECISIONS.md).
Original spec: [SPEC.md](SPEC.md). Vision/phases: [PLAN.md](PLAN.md).

## Hard rules

- **`main` is used by a client.** Work on a branch, open a PR, keep `main` working. The
  owner merges, or asks you to.
- **Never rewrite history or force-push `main`.** Dropping the malware commits `571b629` /
  `8e93b22` from history is paused by the owner; needs explicit go-ahead, a backup bundle
  and tree-identity checks.
- **Never check out or run `571b629` or `8e93b22`** (PolinRider malware payload, see
  ARCHITECTURE.md section 9).
- **Run `node scripts/tripwire.mjs` before `pnpm install` on any clone and before every
  commit.** If it prints `TRIPWIRE`, stop and report; do not build or run the tree.
- No secrets in the repo. Keys go in `.env` (gitignored) or the host's env settings.
- Model ids and credit costs live in `routing/routes.yaml`, never in code.
- Other repos the owner mentions (e.g. supersam) are handled by someone else; do not
  touch them unless asked.

## Working conventions

- Node 22.5+ (`node:sqlite`), pnpm 9.15.0 (`corepack pnpm@9.15.0 ...` if no global pnpm).
- Engine: `packages/engine` (TypeScript, zod, sharp). Board: `apps/review` (Next.js 16,
  Tailwind 4, `proxy.ts` for auth). The board spawns engine scripts; it does not import
  the engine package.
- Checks before a PR: `pnpm test`, `pnpm --filter review typecheck`,
  `node scripts/tripwire.mjs`. Root `pnpm typecheck` has 2 known pre-existing errors.
- **Test in a real browser before saying something works**: fresh clone, `pnpm seed`,
  `pnpm review`, then click every nav page, the seeded briefs, the brand wizard, each
  text template, approve. Playwright + preinstalled Chromium works in cloud sessions.
- `pnpm seed` wipes `out/` and the ledger. Never run it on someone's real data.
- Text posts (quote card, insight carousel, tips list, myth vs fact) render locally for 0
  credits. Photo/video templates need Higgsfield/OpenRouter/ElevenLabs keys.
- Add new decisions to DECISIONS.md (numbered, dated) and keep ARCHITECTURE.md current.
- Video posts: `packages/engine/src/montage.ts` (plan + render), `video.ts` (editor, bundled
  ffmpeg). Never spend Higgsfield credits in tests; mock the provider (see
  `test/montage.test.ts`). Test Chromium can't play H.264: verify MP4s with ffmpeg.
- New brand fields must stay optional (old brand files must still load). Intake logic is
  `packages/engine/src/intake.ts`; the wizard is `apps/review/app/components/BrandWizard.tsx`.

## Deployment status (2026-10-02)

- **Local is the supported setup** (owner runs it on Windows for demos).
- Vercel (owner's personal Hobby account, not the Pisteyo org) works for viewing seeded
  demo posts only: its `/tmp` is per instance, so created brands/posts can 404. Do not
  present it as working for creation. Real hosting needs a persistent-disk server or
  object storage + Postgres (ARCHITECTURE.md section 8).

## Owner preferences

- Plain, short answers; give exact commands for Windows PowerShell.
- Be upfront about what was and wasn't tested.
