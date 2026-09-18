import { listBrandCatalog, listTemplateCatalog } from "../../lib/catalog";
import { BatchForm } from "../components/BatchForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function BatchPage() {
  const brands = listBrandCatalog();
  const templates = listTemplateCatalog();

  return (
    <div className="box-border px-10 py-8 flex flex-col gap-7">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] text-muted">Content Engine · batch</div>
          <h1 className="m-0 font-display text-[34px] font-medium tracking-tight">
            Fill my week
          </h1>
          <p className="text-sm text-muted m-0 mt-1">
            Pick products and ad types, and the engine creates one post for every combination.
          </p>
        </div>
        <Link
          href="/"
          className="h-11 px-4 border border-line2 rounded-[10px] bg-panel font-medium text-ink no-underline flex items-center hover:bg-active"
        >
          ← Back to board
        </Link>
      </header>

      {brands.length === 0 ? (
        <div className="p-8 bg-panel border border-line rounded-xl text-muted">
          No brands yet.{" "}
          <Link href="/brand/new" className="text-clay font-semibold">
            Set up your brand first
          </Link>
          .
        </div>
      ) : (
        <BatchForm brands={brands} templates={templates} />
      )}
    </div>
  );
}
