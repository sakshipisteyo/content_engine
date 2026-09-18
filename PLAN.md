# Content Engine — Product Plan

## Vision (owner, 2026-09-19)

An **end-to-end content generation engine for small/medium enterprises**, with Higgsfield
in the backend. A business signs in, picks an **ad type / template** (UGC ad, product hero,
carousel, testimonial reel, founder note…), **uploads a product image**, adds a few words,
and gets **finished, on-brand, scored marketing content** (image + short video + copy) —
self-serve, minimal input. The differentiation over raw Higgsfield is the brand-aware,
cost-governed engine around it: it decides what to ask for, rejects off-brand output,
assembles the deliverable, and learns from what the business approves.

## What we have (spike foundation — done, local, A1/A2 green)

- **Engine core:** compile (brief + brand → prompt plan), provider wrappers (Higgsfield
  Soul/DoP, Claude, ElevenLabs), deterministic scoring hard-checks (palette/aspect/decode)
  + Claude vision rubric, 8-stage pipeline (hero → score → motion → copy → voice →
  assemble → score-2), per-brief credit cap, cost/decision ledger, idempotent stages.
- **Review board (Next.js):** brief list, brief detail (ranked variants, scorecard, hidden
  variants, editable caption, approve/reject/rate/re-run), cost/quality report.
- **Dry-run** credit estimation with zero provider calls.

## Gap to the vision

1. **Ad-type / template library** — reusable recipes; today "briefs" are hand-written YAML.
2. **Product-image-first flow** — upload a product photo, use it as the primary Higgsfield
   reference/subject ("add your picture and the ad takes care of it").
3. **Self-serve Create UI** — a short form (brand, template, product image, a few words) →
   job created + generated. No YAML editing.
4. **Multi-brand / multi-business** — many SMEs; multiple brand profiles (full auth /
   multi-tenant deferred).
5. **Deliverables out** — download finished assets from the board.
6. **Learning loop** — per-brand memory feeding the next compile (in progress).

## Phases

### Phase 1 — Real end-to-end engine, local (now, no keys)
- [x] Engine core, review board, dry-run
- [ ] Feedback loop / brand memory (in progress) — the "dotted arrow"
- [ ] Ad-type/template system (`templates/*.yaml`) + compile generalization
      (a job = template + brand + product + a few inputs)
- [ ] Product-image upload → primary reference; brand asset ingestion
- [ ] Self-serve **Create** screen in the review app (pick brand + template + upload + inputs)
- [ ] Multi-brand support + brand picker
- [ ] Download finished assets from the board

### Phase 2 — Real generation (needs Higgsfield + Anthropic + ElevenLabs keys)
- Wire hero → public-URL upload for DoP image-to-video
- One real call per provider (auth + response-shape check)
- Run templates end-to-end; tune prompts, thresholds, credit costs
- Validate the quality gate (≥ 10 of 20 rated 4–5) on real output

### Phase 3 — Productionize (later; beyond local-only, needs explicit go-ahead)
- Auth + multi-tenant data model, object storage for `out/`, hosted DB
- Deploy; usage metering / billing; optional publish + schedule integrations

## Constraints
- **Local-only** during the spike — no cloud deploy or remote push without a fresh
  go-ahead ([[content-engine-local-only]]).
- Higgsfield is the only pixel/video backend; model ids + costs live in
  `routing/routes.yaml` (report + stop on a rejected id, never substitute).
- No 4K in the spike; video at 720p/1080p.
