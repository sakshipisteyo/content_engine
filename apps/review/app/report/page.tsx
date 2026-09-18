import Link from "next/link";
import { getStages, getDecisions } from "../../lib/ledger";
import { listBriefIds, loadCards } from "../../lib/data";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "n/a";
}

export default function ReportPage() {
  const stages = getStages();
  const decisions = getDecisions();
  const briefIds = listBriefIds();

  const totalCredits = stages.reduce((n, s) => n + (s.credits || 0), 0);
  const postsWithFinals = new Set(
    stages.filter((s) => s.stage === "assemble" && s.status === "ok").map((s) => s.brief_id),
  );
  const nPosts = postsWithFinals.size || briefIds.length || 1;
  const rated4 = new Set(decisions.filter((d) => (d.rating ?? 0) >= 4).map((d) => d.brief_id));

  const secByBrief = new Map<string, number>();
  for (const s of stages) secByBrief.set(s.brief_id, (secByBrief.get(s.brief_id) ?? 0) + (s.seconds || 0));
  const avgMin = secByBrief.size
    ? [...secByBrief.values()].reduce((a, b) => a + b, 0) / secByBrief.size / 60
    : 0;

  const scorerTop = new Map<string, number>();
  for (const id of briefIds) for (const c of loadCards(id)) if (c.rank === 1) scorerTop.set(id, c.variant);
  const approvals = decisions.filter((d) => d.action === "approve" && d.variant != null);
  let agree = 0;
  for (const d of approvals) if (scorerTop.get(d.brief_id) === d.variant) agree++;
  const agreePct = approvals.length ? (100 * agree) / approvals.length : NaN;

  const reasonCounts = new Map<string, number>();
  for (const id of briefIds) for (const c of loadCards(id)) for (const h of c.hard_fails) reasonCounts.set(h, (reasonCounts.get(h) ?? 0) + 1);
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const stats: { label: string; value: string; sub?: string }[] = [
    { label: "Total credits", value: String(totalCredits), sub: "Higgsfield" },
    { label: "Cost per post", value: fmt(totalCredits / nPosts), sub: "credits" },
    {
      label: "Cost per rated-4+ post",
      value: rated4.size ? fmt(totalCredits / rated4.size) : "n/a",
      sub: rated4.size ? "credits" : "no ratings yet",
    },
    { label: "Avg brief → finals", value: fmt(avgMin), sub: "minutes" },
    {
      label: "Scorer vs human",
      value: Number.isNaN(agreePct) ? "n/a" : `${fmt(agreePct)}%`,
      sub: `${agree}/${approvals.length} approvals`,
    },
    { label: "Rated 4 or 5", value: String(rated4.size), sub: "gate: ≥ 10 of 20" },
  ];

  return (
    <div className="box-border px-10 py-8 flex flex-col gap-7">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] text-muted">Content Engine · report</div>
          <h1 className="m-0 font-display text-[34px] font-medium tracking-tight">Cost & quality</h1>
        </div>
        <Link
          href="/"
          className="h-11 px-4 border border-line2 rounded-[10px] bg-panel font-medium text-ink no-underline flex items-center hover:bg-active"
        >
          Back to board
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="p-5 bg-panel border border-line rounded-xl flex flex-col gap-1.5">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="font-display text-[32px] font-medium leading-none">{s.value}</div>
            {s.sub && <div className="text-xs text-muted">{s.sub}</div>}
          </div>
        ))}
      </section>

      <section className="bg-panel border border-line rounded-xl p-6 flex flex-col gap-3 max-w-xl">
        <h2 className="m-0 font-display text-xl font-medium">Top rejection reasons</h2>
        {topReasons.length === 0 ? (
          <div className="text-sm text-muted">None recorded yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {topReasons.map(([reason, n]) => (
              <div key={reason} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-right font-semibold">{n}</span>
                <div className="flex-1 h-2 rounded bg-active">
                  <div
                    className="h-2 rounded bg-clay"
                    style={{ width: `${(n / topReasons[0]![1]) * 100}%` }}
                  />
                </div>
                <span className="w-40 text-muted">{reason}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {stages.length === 0 && (
        <div className="text-sm text-muted">
          No ledger activity yet. Numbers fill in after a real run (or seed mock data).
        </div>
      )}
    </div>
  );
}
