import { listBriefs } from "../../lib/data";
import { ScheduleBoard } from "../components/ScheduleBoard";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const briefs = listBriefs(brand);

  return (
    <div className="box-border px-10 py-8 flex flex-col gap-7">
      <header className="flex flex-col gap-1">
        <div className="text-[13px] text-muted">Content Engine · schedule</div>
        <h1 className="m-0 font-display text-[34px] font-medium tracking-tight">
          Content calendar
        </h1>
      </header>
      <ScheduleBoard briefs={briefs} />
    </div>
  );
}
