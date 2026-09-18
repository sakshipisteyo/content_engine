import type { BriefStatus } from "../../lib/types";

const STATUS_STYLE: Record<BriefStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-[#fdf6e3] text-[#8a6d0b] border-[#ecdfae]" },
  approved: { label: "Approved", cls: "bg-[#e7f0ec] text-forest border-[#cfe0d8]" },
  rejected: { label: "Rejected", cls: "bg-[#fbeae2] text-clay border-[#f0d3c5]" },
  failed: { label: "Failed", cls: "bg-[#fbe6e6] text-[#a12a2a] border-[#efc9c9]" },
};

export function StatusPill({ status }: { status: BriefStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function Pill({ children, solid = false }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <span
      className={
        solid
          ? "px-2 py-1 rounded-md bg-ink text-white text-[11px] font-semibold"
          : "px-2 py-1 rounded-md bg-panel text-ink text-[11px] font-semibold border border-line"
      }
    >
      {children}
    </span>
  );
}

function formatLabel(format: string, aspect: string): string {
  return format === "video" ? `Reel · ${aspect}` : `Image · ${aspect}`;
}

/** Media preview: real <video>/<img> when a file exists, else a labelled placeholder. */
export function Preview({
  media,
  format,
  aspect,
  className = "",
}: {
  media: string | null;
  format: string;
  aspect: string;
  className?: string;
}) {
  const isVideo = media?.toLowerCase().endsWith(".mp4");
  if (media && isVideo) {
    return <video src={media} controls playsInline className={`bg-ink object-cover ${className}`} />;
  }
  if (media) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={media} alt="variant preview" className={`object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-sand text-[#5a4632] text-xs ${className}`}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        {format === "video" ? (
          <polygon points="5 3 19 12 5 21 5 3" />
        ) : (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </>
        )}
      </svg>
      <span>{formatLabel(format, aspect)}</span>
      <span className="text-[10px] text-muted">no media yet</span>
    </div>
  );
}

const SCORE_ROWS: { key: keyof ScoreSoft; label: string }[] = [
  { key: "brand_fit", label: "Brand fit" },
  { key: "product_clarity", label: "Product clarity" },
  { key: "hook_strength", label: "Hook strength" },
  { key: "platform_fit", label: "Platform fit" },
];

interface ScoreSoft {
  brand_fit: number;
  product_clarity: number;
  hook_strength: number;
  platform_fit: number;
}

export function ScoreBars({ soft }: { soft: ScoreSoft | null }) {
  if (!soft) {
    return <div className="text-[13px] text-muted">No soft scores (variant hard-failed).</div>;
  }
  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      {SCORE_ROWS.map(({ key, label }) => {
        const val = soft[key];
        const pct = Math.max(0, Math.min(100, (val / 5) * 100));
        return (
          <div key={key} className="flex items-center gap-2.5">
            <span className="w-[92px] text-muted">{label}</span>
            <div className="flex-1 h-1.5 rounded-[3px] bg-active">
              <div className="h-1.5 rounded-[3px] bg-forest" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 text-right">{val.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}
