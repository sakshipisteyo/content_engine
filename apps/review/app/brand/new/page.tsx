import Link from "next/link";
import { BrandWizard } from "../../components/BrandWizard";

export const dynamic = "force-dynamic";

export default function NewBrandPage() {
  return (
    <div className="box-border px-10 py-8 flex flex-col gap-7">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-[13px] text-muted">Content Engine · set up</div>
          <h1 className="m-0 font-display text-[34px] font-medium tracking-tight">Add your brand</h1>
          <p className="m-0 text-sm text-muted max-w-xl">
            Four short steps: your business, who you reach, how you sound, and how you look.
            Every post then uses your offer, pillars, tone, colours and fonts. Enterprise brand
            kits can lock exact colours and upload their own typeface.
          </p>
        </div>
        <Link
          href="/"
          className="h-11 px-4 border border-line2 rounded-[10px] bg-panel font-medium text-ink no-underline flex items-center hover:bg-active"
        >
          Back to board
        </Link>
      </header>
      <BrandWizard />
    </div>
  );
}
