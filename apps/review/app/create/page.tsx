import Link from "next/link";
import { listBrandCatalog, listTemplateCatalog } from "../../lib/catalog";
import { CreateForm } from "../components/CreateForm";

export const dynamic = "force-dynamic";

export default function CreatePage() {
  const brands = listBrandCatalog();
  const templates = listTemplateCatalog();

  return (
    <div className="box-border px-10 py-8 flex flex-col gap-7">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] text-muted">Content Engine · create</div>
          <h1 className="m-0 font-display text-[34px] font-medium tracking-tight">New post</h1>
        </div>
        <Link
          href="/"
          className="h-11 px-4 border border-line2 rounded-[10px] bg-panel font-medium text-ink no-underline flex items-center hover:bg-active"
        >
          Back to board
        </Link>
      </header>

      {brands.length === 0 || templates.length === 0 ? (
        <div className="p-6 bg-panel border border-line rounded-xl text-muted">
          Need at least one brand file and one template to create a post.
        </div>
      ) : (
        <CreateForm brands={brands} templates={templates} />
      )}
    </div>
  );
}
