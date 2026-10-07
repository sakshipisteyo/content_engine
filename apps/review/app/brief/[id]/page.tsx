import { notFound } from "next/navigation";
import Link from "next/link";
import { getBriefDetail, savedCaption, type VariantView } from "../../../lib/data";
import { StatusPill, Pill, Preview, ScoreBars } from "../../components/ui";
import { VideoButton } from "../../components/VideoActions";
import type { MontageInfo } from "../../../lib/data";
import { CaptionBox } from "../../components/CaptionBox";
import { DecisionBar } from "../../components/DecisionBar";
import { AutoRefresh } from "../../components/AutoRefresh";
import { generatingSince, hasKeys } from "../../../lib/generate";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getBriefDetail(id);
  if (!d) notFound();

  const top = d.survivors[0] ?? null;
  const others = d.survivors.slice(1);
  const soft = top?.card?.soft ?? null;
  const scoreAvg = soft
    ? ((soft.brand_fit + soft.product_clarity + soft.hook_strength + soft.platform_fit) / 4).toFixed(1)
    : null;
  const format = d.plan?.format ?? d.brief?.format ?? "image";
  // *stars* mark emphasis on photo posts; show the plain words here.
  const hook = (d.brief?.hook ?? d.plan?.copy.caption ?? id).replace(/\*([^*\n]+)\*/g, "$1");
  const saved = savedCaption(id);
  const isSlides = d.plan?.post_kind === "slides";
  const isText = d.plan?.renderer === "typographic";
  const isMontage = d.plan?.renderer === "montage";
  const hasMedia = d.survivors.some((v) => v.media !== null);
  const since = hasMedia ? null : generatingSince(id);
  const keys = hasKeys();
  const credits = d.plan?.estimated_credits ?? 0;

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
          {isSlides && <Pill solid>Carousel</Pill>}
          <Pill>{isMontage ? "Video · 16:9 · 9:16 · 1:1" : format === "video" ? "Reel · 9:16" : `Image · ${top?.aspect ?? "4:5"}`}</Pill>
          <Pill>{PLATFORM_LABEL[d.plan?.platform ?? "instagram"] ?? d.plan?.platform}</Pill>
          <StatusPill status={d.status} />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <section aria-label="Variants" className="flex-1 box-border px-8 py-7 flex gap-6 items-start overflow-auto">
          {!hasMedia && d.survivors.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 py-16">
              <div className="w-20 h-20 rounded-2xl bg-active flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </div>
              <div className="text-center max-w-xs">
                {since ? (
                  <>
                    <div className="font-display text-lg font-medium">Generating…</div>
                    <div className="text-sm text-muted mt-1">
                      Started {Math.max(1, Math.round((Date.now() - since) / 60000))} min ago. Images, scores and the caption
                      usually take 1–3 minutes — this page refreshes itself.
                    </div>
                    <AutoRefresh seconds={10} />
                  </>
                ) : (
                  <>
                    <div className="font-display text-lg font-medium">Not generated yet</div>
                    <div className="text-sm text-muted mt-1">
                      {keys ? (
                        <>
                          Pick <b>hero</b> and click <b>Re-run</b> to generate{credits ? ` (~${credits} credits)` : ""}. The caption is a
                          placeholder until then.
                        </>
                      ) : (
                        <>
                          Add your API keys to <code className="text-xs">.env</code>, then re-run from the hero stage.
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : isMontage && top ? (
            <VideoPost id={id} variant={top} montage={d.montage} />
          ) : isText ? (
            <TextPostVariants id={id} survivors={d.survivors} hidden={d.hidden} />
          ) : isSlides ? (
            <div className="flex flex-col gap-4">
              <div className="text-xs text-muted font-semibold tracking-wide">
                CAROUSEL · {d.survivors.length} SLIDE{d.survivors.length === 1 ? "" : "S"}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {d.survivors.map((v, i) => (
                  <div key={v.variant} className="flex flex-col gap-2 shrink-0">
                    <div className="relative">
                      <Preview
                        media={v.media}
                        format={format}
                        aspect={v.aspect}
                        className="w-[280px] h-[280px] rounded-[18px] border border-line2"
                      />
                      <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-ink text-white text-xs font-semibold">
                        {i + 1}
                      </span>
                    </div>
                    {v.media && (
                      <a
                        href={v.media}
                        download
                        className="text-[12px] font-semibold text-clay hover:text-clay-dark w-fit"
                      >
                        ↓ Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </section>

        <aside className="w-[460px] shrink-0 box-border border-l border-line bg-panel px-7 pt-7 pb-6 flex flex-col gap-5 overflow-auto">
          <section className="flex flex-col gap-2.5">
            <div className="flex justify-between items-baseline">
              <h2 className="m-0 font-display text-lg font-medium">Why this scored highest</h2>
              {scoreAvg && <span className="text-[13px] font-semibold text-forest">{scoreAvg} / 5</span>}
            </div>
            <ScoreBars
              soft={soft}
              emptyNote={
                isText
                  ? "Text posts are checked for contrast and fit (below); no vision scoring."
                  : isMontage
                    ? "Videos are checked for length and platform fit (below); no vision scoring."
                    : !hasMedia
                      ? "Nothing generated yet — scores appear after generation."
                      : undefined
              }
            />
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
              // A caption saved from this box (already including its hashtags) wins over the
              // AI one — before, saved edits were written to disk but never shown again.
              initial={saved ?? d.plan?.copy.caption ?? ""}
              hashtags={saved ? [] : d.plan?.copy.hashtags ?? []}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="m-0 font-display text-lg font-medium">Brief this came from</h2>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[13px]">
              {isText ? (
                <>
                  <div className="col-span-2">
                    <Field label={d.brief?.body ? "Title" : "Statement"} value={d.brief?.hook} />
                  </div>
                  {d.brief?.body ? (
                    <div className="col-span-2">
                      <div className="text-muted text-xs">Outline</div>
                      <pre className="m-0 whitespace-pre-wrap font-sans text-[12px] leading-relaxed">{d.brief.body}</pre>
                    </div>
                  ) : (
                    <Field label="Credit line" value={d.brief?.attribution} />
                  )}
                  <Field label="CTA" value={d.brief?.cta} />
                </>
              ) : (
                <>
                  <Field label="Hook" value={d.brief?.hook} />
                  <Field label="Angle" value={d.brief?.angle} />
                  <Field label="CTA" value={d.brief?.cta} />
                  <Field label="Style anchor" value={d.brief?.style_anchor} />
                </>
              )}
            </div>
          </section>

          <div className="flex-1" />
          <DecisionBar briefId={id} topVariant={d.topVariant} status={d.status} />
        </aside>
      </div>
    </div>
  );
}

const TEXT_SIZES = [
  { file: "final_16x9.jpg", label: "16:9" },
  { file: "final_4x5.jpg", label: "4:5" },
  { file: "final_1x1.jpg", label: "1:1" },
  { file: "final_9x16.jpg", label: "9:16" },
];

/** Typographic posts: every theme side by side, uncropped, with per-size downloads. */
function TextPostVariants({
  id,
  survivors,
  hidden,
}: {
  id: string;
  survivors: VariantView[];
  hidden: { variant: number; reasons: string[] }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted font-semibold tracking-wide">
        TEXT POST · {survivors.length} THEME{survivors.length === 1 ? "" : "S"}
        {survivors[0] && survivors[0].pages.length > 1 ? ` · ${survivors[0].pages.length} PAGES` : ""} · 0 CREDITS
      </div>
      <div className="flex gap-5 flex-wrap">
        {survivors.map((v) => (
          <div key={v.variant} className="flex flex-col gap-2 w-[300px]">
            <span className="text-xs font-semibold capitalize text-ink">{v.theme ?? `Variant ${v.variant}`} theme</span>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {v.media && (
                <img
                  src={v.media}
                  alt={`${v.theme ?? "variant"} theme preview`}
                  className="w-[300px] h-auto rounded-[14px] border border-line2"
                />
              )}
            </div>
            {v.pages.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {v.pages.map((src, i) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`page ${i + 1}`} className="w-[56px] h-[70px] object-cover rounded border border-line2" />
                  </a>
                ))}
              </div>
            )}
            {v.videos.length > 0 && (
              <div className="flex gap-2">
                {v.videos.map((vid) => (
                  <div key={vid.url} className="flex flex-col gap-1">
                    <video src={vid.url} poster={vid.poster ?? undefined} controls playsInline preload="none" className="w-[140px] rounded-[10px] border border-line2 bg-ink" />
                    <a href={vid.url} download className="text-[12px] font-semibold text-forest hover:brightness-110">↓ video {vid.label}</a>
                  </div>
                ))}
              </div>
            )}
            <VideoButton
              briefId={id}
              action="export"
              variant={v.variant}
              label={v.videos.length ? "Re-make video" : "Make a video (free)"}
              busyLabel="Making video… ~30 s"
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold">
              {v.pdfs.map((p) => (
                <a key={p.url} href={p.url} download className="text-forest hover:brightness-110">
                  ↓ {p.label}
                </a>
              ))}
              {TEXT_SIZES.filter((s) => v.sizes.includes(s.file) && (v.pages.length <= 1 || s.label !== "9:16")).map((s) => (
                <a
                  key={s.file}
                  href={`/api/media/${id}/v${v.variant}/${s.file}`}
                  download
                  className="text-clay hover:text-clay-dark"
                >
                  ↓ {v.pages.length > 1 ? `cover ${s.label}` : s.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="text-xs text-muted leading-relaxed">
          {hidden.length} hidden: {hidden.map((h) => `#${h.variant} (${h.reasons.join(", ")})`).join("; ")}
        </div>
      )}
    </div>
  );
}

/** Video posts (montage): every size playable and downloadable, plus render actions. */
function VideoPost({ id, variant, montage }: { id: string; variant: VariantView; montage: MontageInfo | null }) {
  const draft = montage?.mode !== "full";
  const needsAi = (montage?.estimate ?? 0) > 0;
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="text-xs text-muted font-semibold tracking-wide">
        VIDEO · {montage ? `${montage.seconds.toFixed(0)} S · ` : ""}
        {draft ? (needsAi ? "DRAFT (FREE) — AI SHOTS SHOWN AS CAMERA MOVES" : "EDITED FROM YOUR UPLOADS · 0 CREDITS") : `RENDERED WITH HIGGSFIELD · ${montage?.spent ?? 0} CREDITS`}
      </div>
      <div className="flex gap-5 flex-wrap items-end">
        {variant.videos.map((vid) => (
          <div key={vid.url} className="flex flex-col gap-2">
            <video
              src={vid.url}
              poster={vid.poster ?? undefined}
              controls
              playsInline
              preload="metadata"
              className={`${vid.label === "16:9" ? "w-[460px]" : vid.label === "9:16" ? "w-[200px]" : "w-[260px]"} rounded-[14px] border border-line2 bg-ink`}
            />
            <a href={vid.url} download className="text-[12px] font-semibold text-clay hover:text-clay-dark">
              ↓ {vid.label} MP4
            </a>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 items-start">
        {needsAi && (
          <VideoButton
            briefId={id}
            action="full"
            primary
            label={`Render with Higgsfield (~${montage?.estimate ?? 0} credits)`}
            busyLabel="Rendering with Higgsfield… several minutes"
            disabled={!montage?.higgsfield_ready}
            title={montage?.higgsfield_ready ? undefined : "Add HIGGSFIELD_API_KEY to .env, then restart the board"}
            confirm={`This spends about ${montage?.estimate ?? 0} Higgsfield credits. Continue?`}
          />
        )}
        <VideoButton briefId={id} action="draft" label="Re-render draft (free)" busyLabel="Rendering… about a minute" />
      </div>
      {needsAi && !montage?.higgsfield_ready && (
        <div className="text-xs text-muted max-w-xl">
          Higgsfield isn&apos;t set up yet: add <code>HIGGSFIELD_API_KEY</code> (and for presenter videos{" "}
          <code>ELEVENLABS_API_KEY</code>) to <code>.env</code>, restart the board, then re-render the draft to enable this button.
        </div>
      )}
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
