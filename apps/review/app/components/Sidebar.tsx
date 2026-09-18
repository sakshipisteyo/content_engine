import Link from "next/link";

export function Sidebar() {
  return (
    <nav className="w-[236px] shrink-0 box-border px-4 py-6 flex flex-col gap-6 border-r border-line bg-ground">
      <div className="flex items-center gap-2.5 px-2">
        <div className="w-7 h-7 rounded-lg bg-ink" />
        <div className="font-display text-lg font-semibold">Content Engine</div>
      </div>

      <div className="flex items-center gap-2.5 h-12 px-3 border border-line rounded-[10px] bg-panel">
        <div className="w-[26px] h-[26px] rounded-md bg-clay" />
        <div>
          <div className="font-semibold text-[13px]">Banjaaran Studio</div>
          <div className="text-[11px] text-muted">Brand · spike</div>
        </div>
      </div>

      <Link
        href="/create"
        className="flex items-center justify-center gap-2 h-11 rounded-[10px] bg-ink text-white font-semibold no-underline hover:brightness-125"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        New post
      </Link>

      <div className="flex flex-col gap-0.5">
        <Link
          href="/"
          className="flex items-center gap-2.5 h-11 px-3 rounded-lg bg-active text-ink font-semibold no-underline"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 11 12 3l9 8v10H3z" />
          </svg>
          Review board
        </Link>
        <Link
          href="/report"
          className="flex items-center gap-2.5 h-11 px-3 rounded-lg text-ink no-underline hover:bg-active"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
          </svg>
          Report
        </Link>
      </div>

      <div className="flex-1" />
      <div className="text-[11px] text-muted px-2 leading-relaxed">
        Local spike. Content and costs come from <code>out/</code> and the ledger.
      </div>
    </nav>
  );
}
