import { listBriefs, getBudget } from "../lib/data";
import { listBrandCatalog } from "../lib/catalog";
import { StatusPill, Pill, Preview } from "./components/ui";
import { CardActions } from "./components/CardActions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const { brand: brandFilter } = await searchParams;
  const briefs = listBriefs(brandFilter);
  const ready = briefs.filter((b) => b.status === "pending").length;

  const brands = listBrandCatalog();
  const activeBrand = brandFilter ? brands.find((b) => b.key === brandFilter) : null;
  const budget = brandFilter ? getBudget(brandFilter) : null;

  return (
    <div className="box-border px-10 py-8 flex flex-col gap-7">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] text-muted">
            Content Engine · review board{activeBrand ? ` · ${activeBrand.name}` : ""}
          </div>
          <h1 className="m-0 font-display text-[34px] font-medium tracking-tight">
            {briefs.length === 0
              ? "No briefs yet"
              : `${ready} post${ready === 1 ? "" : "s"} ready for you`}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/report"
            className="h-11 px-4 border border-line2 rounded-[10px] bg-panel font-medium text-ink no-underline flex items-center hover:bg-active"
          >
            View report
          </Link>
          <Link
            href="/create"
            className="h-11 px-5 rounded-[10px] bg-ink text-white font-semibold no-underline flex items-center hover:brightness-125"
          >
            New post
          </Link>
        </div>
      </header>

      {budget && budget.budgetCredits !== null && (
        <div className="flex items-center gap-4 p-4 bg-panel border border-line rounded-xl">
          <div className="text-sm font-semibold">Monthly budget</div>
          <div className="flex-1 h-3 rounded-full bg-active overflow-hidden">
            <div
              className="h-3 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (budget.usedCredits / budget.budgetCredits) * 100)}%`,
                backgroundColor: budget.usedCredits / budget.budgetCredits > 0.9 ? "#B5471F" : "#2F5D50",
              }}
            />
          </div>
          <div className="text-sm text-muted whitespace-nowrap">
            {budget.usedCredits} / {budget.budgetCredits} credits
          </div>
        </div>
      )}

      {briefs.length === 0 ? (
        <div className="p-8 bg-panel border border-line rounded-xl text-muted">
          {brandFilter
            ? `No briefs for this brand yet. `
            : `Nothing in out/ yet. Run a dry run or seed mock data, then refresh.`}
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {briefs.map((b) => (
            <article
              key={b.id}
              className="bg-panel border border-line rounded-[14px] overflow-hidden flex flex-col"
            >
              <Link href={`/brief/${b.id}`} className="block relative">
                <Preview
                  media={b.preview}
                  format={b.format}
                  aspect={b.aspect}
                  className="h-[210px] w-full"
                />
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <Pill solid>{b.format === "video" ? "Reel" : "Image"}</Pill>
                  <Pill>{PLATFORM_LABEL[b.platform] ?? b.platform}</Pill>
                </div>
                <div className="absolute top-3 right-3">
                  <StatusPill status={b.status} />
                </div>
              </Link>
              <div className="px-4 pt-3.5 pb-4 flex flex-col gap-2.5 flex-1">
                <div className="font-semibold text-sm leading-snug">{b.hook}</div>
                <div className="text-xs text-muted flex-1 flex items-center gap-2">
                  <span>{b.variantsReady} variant{b.variantsReady === 1 ? "" : "s"} ready</span>
                  {b.estimatedCredits > 0 && (
                    <span className="px-1.5 py-0.5 bg-active rounded text-[11px]">
                      ~{b.estimatedCredits} cr
                    </span>
                  )}
                </div>
                <CardActions briefId={b.id} variant={b.topVariant} />
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
