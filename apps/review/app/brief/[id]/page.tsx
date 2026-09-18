import { notFound } from "next/navigation";
import Link from "next/link";
import { getBriefDetail } from "../../../lib/data";
import { StatusPill, Pill, Preview, ScoreBars } from "../../components/ui";
import { CaptionBox } from "../../components/CaptionBox";
import { DecisionBar } from "../../components/DecisionBar";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = getBriefDetail(id);
  if (!d) notFound();

  const top = d.survivors[0] ?? null;
  const others = d.survivors.slice(1);
  const soft = top?.card?.soft ?? null;
  const scoreAvg = soft
    ? ((soft.brand_fit + soft.product_clarity + soft.hook_strength + soft.platform_fit) / 4).toFixed(1)
    : null;
  const format = d.plan?.format ?? d.brief?.format ?? "image";
  const hook = d.brief?.hook ?? d.plan?.copy.caption ?? id;

  return (
    <div className="flex flex-col h-screen">
      <header className="h-[68px] shrink-0 box-border px-8 border-b border-line flex items-center justify-between bg-ground">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            aria-label="Back to home"
            className="w-11 h-11 border border-line2 rounded-[10px] bg-panel flex items-center justify-center text-ink no-underline hover:bg-active"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="text-xs text-muted">
              Review · {d.brief?.brand ?? "brand"} · {id}
            </div>
            <div className="font-display text-xl font-medium">{hook}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill>{format === "video" ? "Reel · 9:16" : `Image · ${top?.aspect ?? "4:5"}`}</Pill>
          <Pill>{PLATFORM_LABEL[d.plan?.platform ?? "instagram"] ?? d.plan?.platform}</Pill>
          <StatusPill status={d.status} />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <section aria-label="Variants" className="flex-1 box-border px-8 py-7 flex gap-6 items-start overflow-auto">
          <div className="flex flex-col gap-2.5">
            <div className="relative">
              <Preview
                media={top?.media ?? null}
                format={format}
                aspect={top?.aspect ?? "9:16"}
                className="w-[360px] h-[640px] rounded-[22px] border-[3px] border-ink"
              />
              {top && (
                <div className="absolute top-4 left-4 px-2.5 py-1 rounded-md bg-ink text-white text-xs font-semibold">
                  Variant {top.variant} · ranked 1st
                </div>
              )}
            </div>
            {top?.cameraNote && <div className="text-xs text-muted w-[360px]">Camera: {top.cameraNote}</div>}
            {top?.media && (
              <a
                href={top.media}
                download
                className="text-[13px] font-semibold text-clay hover:text-clay-dark w-fit"
              >
                ↓ Download this asset
              </a>
            )}
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="text-xs text-muted font-semibold tracking-wide">OTHER VARIANTS</div>
            {others.length === 0 && <div className="text-xs text-muted w-[150px]">No other survivors.</div>}
            {others.map((v) => (
              <div key={v.variant} className="relative">
                <Preview
                  media={v.media}
                  format={format}
                  aspect={v.aspect}
                  className="w-[150px] h-[266px] rounded-[14px] border border-line2"
                />
                <span className="absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded bg-panel text-[11px] font-semibold text-ink">
                  {v.variant} · {ordinal(v.rank)}
                </span>
              </div>
            ))}
            {d.hidden.length > 0 && (
              <div className="text-xs text-muted w-[150px] leading-relaxed">
                {d.hidden.length} hidden:{" "}
                {d.hidden.map((h) => `#${h.variant} (${h.reasons.join(", ")})`).join("; ")}
              </div>
            )}
          </div>
        </section>

        <aside className="w-[460px] shrink-0 box-border border-l border-line bg-panel px-7 pt-7 pb-6 flex flex-col gap-5 overflow-auto">
          <section className="flex flex-col gap-2.5">
            <div className="flex justify-between items-baseline">
              <h2 className="m-0 font-display text-lg font-medium">Why this scored highest</h2>
              {scoreAvg && <span className="text-[13px] font-semibold text-forest">{scoreAvg} / 5</span>}
            </div>
            <ScoreBars soft={soft} />
            {top?.card?.reasons && top.card.reasons.length > 0 && (
              <ul className="text-xs text-muted list-disc pl-4 flex flex-col gap-0.5">
                {top.card.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </section>

          {d.plan?.learned?.applied && (
            <section className="flex flex-col gap-2 rounded-xl border border-line bg-active/50 p-4">
              <div className="flex items-center justify-between">
                <h2 className="m-0 font-display text-lg font-medium">What the engine learned</h2>
                <span className="text-xs text-muted">
                  from {d.plan.learned.sample_size} past post{d.plan.learned.sample_size === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="text-[13px] text-ink flex flex-col gap-1 list-disc pl-4">
                {d.plan.learned.reinforced_negatives.length > 0 && (
                  <li>
                    Reinforced {d.plan.learned.reinforced_negatives.length} guardrail
                    {d.plan.learned.reinforced_negatives.length === 1 ? "" : "s"} from recurring off-brand results
                  </li>
                )}
                {d.plan.learned.anchor_note && <li>{d.plan.learned.anchor_note}</li>}
                {d.plan.learned.preferred_anchors.length > 0 && (
                  <li>Leaning into proven style: {d.plan.learned.preferred_anchors.join(", ")}</li>
                )}
                {d.plan.learned.voice_examples > 0 && (
                  <li>Carrying {d.plan.learned.voice_examples} approved caption(s) forward as brand voice</li>
                )}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="m-0 font-display text-lg font-medium">Caption</h2>
            <CaptionBox
              briefId={id}
              initial={d.plan?.copy.caption ?? ""}
              hashtags={d.plan?.copy.hashtags ?? []}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 font-display text-lg font-medium">Brief this came from</h2>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[13px]">
              <Field label="Hook" value={d.brief?.hook} />
              <Field label="Angle" value={d.brief?.angle} />
              <Field label="CTA" value={d.brief?.cta} />
              <Field label="Style anchor" value={d.brief?.style_anchor} />
            </div>
          </section>

          <div className="flex-1" />
          <DecisionBar briefId={id} topVariant={d.topVariant} />
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-muted text-xs">{label}</div>
      <div>{value ?? "—"}</div>
    </div>
  );
}

function ordinal(n: number | null): string {
  if (n === null) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
