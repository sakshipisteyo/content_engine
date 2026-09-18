export default function Loading() {
  return (
    <div className="box-border px-10 py-8 flex flex-col gap-7 animate-pulse">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-48 rounded bg-active" />
          <div className="h-9 w-72 rounded bg-active" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 w-28 rounded-[10px] bg-active" />
          <div className="h-11 w-24 rounded-[10px] bg-active" />
        </div>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-panel border border-line rounded-[14px] overflow-hidden flex flex-col">
            <div className="h-[210px] bg-active" />
            <div className="px-4 pt-3.5 pb-4 flex flex-col gap-3">
              <div className="h-4 w-3/4 rounded bg-active" />
              <div className="h-3 w-1/3 rounded bg-active" />
              <div className="h-9 w-full rounded bg-active" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
