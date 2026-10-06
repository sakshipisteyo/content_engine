"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** One button that runs a video action (/api/video) and refreshes the page when done. */
export function VideoButton({
  briefId,
  action,
  variant,
  label,
  busyLabel,
  primary,
  disabled,
  confirm,
  title,
}: {
  briefId: string;
  action: "export" | "draft" | "full";
  variant?: number;
  label: string;
  busyLabel: string;
  primary?: boolean;
  disabled?: boolean;
  confirm?: string;
  title?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief_id: briefId, action, variant }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(body.error ?? `failed (HTTP ${res.status})`);
      else router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        title={title}
        className={`h-10 px-4 rounded-[10px] text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          primary ? "bg-forest text-white hover:brightness-110" : "border border-line2 bg-panel text-ink hover:bg-active"
        }`}
      >
        {busy ? busyLabel : label}
      </button>
      {err && <span className="text-xs text-clay max-w-[320px]">{err}</span>}
    </div>
  );
}
