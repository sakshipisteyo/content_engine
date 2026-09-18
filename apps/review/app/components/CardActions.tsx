"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function CardActions({ briefId, variant }: { briefId: string; variant: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setMsg(null);
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief_id: briefId, variant, action }),
    });
    if (res.ok) start(() => router.refresh());
    else setMsg("failed");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <button
          aria-label="Reject"
          onClick={() => decide("reject")}
          disabled={pending}
          className="w-11 h-10 border border-line2 rounded-lg bg-panel cursor-pointer flex items-center justify-center hover:bg-active disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <Link
          href={`/brief/${briefId}`}
          className="flex-1 h-10 border border-line2 rounded-lg bg-panel font-medium text-ink no-underline flex items-center justify-center hover:bg-active"
        >
          Open
        </Link>
        <button
          onClick={() => decide("approve")}
          disabled={pending || variant === null}
          className="flex-1 h-10 border-0 rounded-lg bg-forest text-white font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
        >
          Approve
        </button>
      </div>
      {msg && <div className="text-[11px] text-clay">Could not save — is the ledger writable?</div>}
    </div>
  );
}
