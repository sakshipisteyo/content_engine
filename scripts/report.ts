/**
 * tsx scripts/report.ts — cost + quality report from the ledger and score cards.
 * Prints: cost per post, cost per rated-4+ post, brief-to-finals minutes,
 * scorer-top-pick vs human-pick agreement, and the top rejection reasons (SPEC A8).
 * Safe to run on an empty ledger.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PATHS,
  openLedger,
  type LedgerStage,
  type Decision,
  type ScoreCard,
} from "../packages/engine/src/index";

function loadScoreCards(): ScoreCard[] {
  const cards: ScoreCard[] = [];
  if (!existsSync(PATHS.out)) return cards;
  for (const briefId of readdirSync(PATHS.out)) {
    const briefDir = join(PATHS.out, briefId);
    let variants: string[];
    try {
      variants = readdirSync(briefDir).filter((d) => d.startsWith("v"));
    } catch {
      continue;
    }
    for (const v of variants) {
      const f = join(briefDir, v, "score.json");
      if (!existsSync(f)) continue;
      try {
        cards.push(JSON.parse(readFileSync(f, "utf8")) as ScoreCard);
      } catch {
        /* ignore malformed */
      }
    }
  }
  return cards;
}

function money(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "n/a";
}

function main(): void {
  const ledger = openLedger();
  const stages: LedgerStage[] = ledger.allStages();
  const decisions: Decision[] = ledger.allDecisions();
  ledger.close();
  const cards = loadScoreCards();

  const briefIds = [...new Set(stages.map((s) => s.brief_id))];
  const totalCredits = stages.reduce((n, s) => n + (s.credits || 0), 0);
  const postsWithFinals = new Set(
    stages.filter((s) => s.stage === "assemble" && s.status === "ok").map((s) => s.brief_id),
  );
  const nPosts = postsWithFinals.size || briefIds.length;

  // Ratings from decisions (latest per brief/variant wins for simplicity).
  const rated4plus = new Set(
    decisions.filter((d) => (d.rating ?? 0) >= 4).map((d) => d.brief_id),
  );

  // Brief-to-finals minutes: sum of stage seconds per brief.
  const secondsByBrief = new Map<string, number>();
  for (const s of stages) {
    secondsByBrief.set(s.brief_id, (secondsByBrief.get(s.brief_id) ?? 0) + (s.seconds || 0));
  }
  const avgMinutes =
    secondsByBrief.size === 0
      ? 0
      : [...secondsByBrief.values()].reduce((a, b) => a + b, 0) / secondsByBrief.size / 60;

  // Scorer top pick (rank 1) vs human approved variant.
  const scorerTop = new Map<string, number>();
  for (const c of cards) if (c.rank === 1) scorerTop.set(c.brief_id, c.variant);
  const approvals = decisions.filter((d) => d.action === "approve" && d.variant != null);
  let agree = 0;
  for (const d of approvals) if (scorerTop.get(d.brief_id) === d.variant) agree++;
  const agreementPct = approvals.length ? (100 * agree) / approvals.length : NaN;

  // Top rejection reasons: hard fails on score cards + score-1 flagged errors.
  const reasonCounts = new Map<string, number>();
  for (const c of cards) for (const h of c.hard_fails) bump(reasonCounts, h);
  for (const s of stages)
    if (s.stage === "score-1" && s.error) for (const r of s.error.split(",")) bump(reasonCounts, r.trim());
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  console.log(`\n=== Content Engine report ===\n`);
  console.log(`Briefs with ledger activity : ${briefIds.length}`);
  console.log(`Posts with finals           : ${postsWithFinals.size}`);
  console.log(`Total Higgsfield credits    : ${totalCredits}`);
  console.log(`Cost per post               : ${money(totalCredits / nPosts)} credits`);
  console.log(
    `Cost per rated-4+ post      : ${rated4plus.size ? money(totalCredits / rated4plus.size) : "n/a (no ratings yet)"} credits`,
  );
  console.log(`Avg brief-to-finals         : ${money(avgMinutes)} min`);
  console.log(
    `Scorer vs human agreement   : ${Number.isNaN(agreementPct) ? "n/a (no approvals yet)" : money(agreementPct) + "%"} (${agree}/${approvals.length})`,
  );
  console.log(`Rated 4 or 5 (gate: >=10)   : ${rated4plus.size}`);
  console.log(`\nTop rejection reasons:`);
  if (topReasons.length === 0) console.log(`  (none recorded yet)`);
  for (const [reason, n] of topReasons) console.log(`  ${String(n).padStart(3)}  ${reason}`);
  console.log();
}

function bump(m: Map<string, number>, k: string): void {
  if (!k) return;
  m.set(k, (m.get(k) ?? 0) + 1);
}

main();
