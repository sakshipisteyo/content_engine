"use client";
import { useRouter, useSearchParams } from "next/navigation";

export interface BrandOption {
  key: string;
  name: string;
}

export function BrandSwitcher({ brands, current }: { brands: BrandOption[]; current: string | null }) {
  const router = useRouter();
  const params = useSearchParams();

  function pick(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key === "") next.delete("brand");
    else next.set("brand", key);
    router.push(`/?${next.toString()}`);
  }

  const active = brands.find((b) => b.key === current) ?? null;

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2.5 w-full h-12 px-3 border border-line rounded-[10px] bg-panel cursor-pointer text-left"
      >
        <div className="w-[26px] h-[26px] rounded-md bg-clay" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] truncate">{active?.name ?? "All brands"}</div>
          <div className="text-[11px] text-muted">{active ? "Brand" : "Showing all"}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="shrink-0">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="absolute left-0 top-full mt-1 w-full bg-panel border border-line rounded-[10px] shadow-lg z-20 hidden group-focus-within:flex flex-col py-1 max-h-60 overflow-auto">
        <button
          onClick={() => pick("")}
          className={`text-left px-3 py-2 text-sm cursor-pointer border-0 bg-transparent hover:bg-active ${current === null ? "font-semibold text-forest" : "text-ink"}`}
        >
          All brands
        </button>
        {brands.map((b) => (
          <button
            key={b.key}
            onClick={() => pick(b.key)}
            className={`text-left px-3 py-2 text-sm cursor-pointer border-0 bg-transparent hover:bg-active ${current === b.key ? "font-semibold text-forest" : "text-ink"}`}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}
