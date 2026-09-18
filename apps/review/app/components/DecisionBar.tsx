"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const STAGES = [
  "compile",
  "hero",
  "score-1",
  "motion",
  "copy",
  "voice",
  "assemble",
  "score-2",
] as const;

export function DecisionBar({
  briefId,
  topVariant,
}: {
  briefId: string;
  topVariant: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rating, setRating] = useState<number>(0);
  const [note, setNote] = useState("");
  const [fromStage, setFromStage] = useState<(typeof STAGES)[number]>("hero");
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setMsg(null);
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brief_id: briefId,
        variant: action === "approve" ? topVariant : null,
        action,
        note: note || null,
        rating: rating || null,
      }),
    });
    if (res.ok) {
      setMsg(action === "approve" ? "Approved ✓" : "Rejected");
      start(() => router.refresh());
    } else setMsg("Could not save decision.");
  }

  async function rerun() {
    setMsg(null);
    await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brief_id: briefId,
        variant: topVariant,
        action: "edit",
        note: note || null,
        rating: null,
      }),
    });
    const res = await fetch("/api/rerun", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief_id: briefId, from: fromStage, note }),
    });
    const body = (await res.json().catch(() => ({}))) as { started?: boolean; reason?: string };
    setMsg(
      body.started
        ? `Re-running from “${fromStage}”… refresh in a bit.`
        : `Re-run recorded but not started: ${body.reason ?? "add API keys to .env"}`,
    );
    start(() => router.refresh());
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Rate</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            aria-label={`${n} star`}
            className={`w-7 h-7 rounded-md border text-sm ${
              rating >= n ? "bg-ink text-white border-ink" : "bg-panel text-muted border-line2"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <label htmlFor="edit" className="text-xs text-muted">
        Ask for a change in plain words, pick the stage to re-run from
      </label>
      <div className="flex gap-2">
        <input
          id="edit"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. warmer light, shorter hook, slower pan"
          className="flex-1 h-11 box-border px-3 border border-line2 rounded-[10px] text-sm bg-field text-ink"
        />
        <select
          value={fromStage}
          onChange={(e) => setFromStage(e.target.value as (typeof STAGES)[number])}
          className="h-11 px-2 border border-line2 rounded-[10px] text-sm bg-field text-ink"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={rerun}
          disabled={pending}
          className="h-11 px-4 border border-line2 rounded-[10px] bg-panel font-medium text-ink cursor-pointer hover:bg-active disabled:opacity-50"
        >
          Re-run
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => decide("reject")}
          disabled={pending}
          className="h-12 px-5 border border-line2 rounded-[10px] bg-panel font-medium text-ink cursor-pointer hover:bg-active disabled:opacity-50"
        >
          Reject brief
        </button>
        <button
          onClick={() => decide("approve")}
          disabled={pending || topVariant === null}
          className="flex-1 h-12 border-0 rounded-[10px] bg-forest text-white font-semibold text-[15px] cursor-pointer hover:brightness-110 disabled:opacity-50"
        >
          {topVariant ? `Approve variant ${topVariant}` : "No variant to approve"}
        </button>
      </div>
      {msg && <div className="text-xs text-muted text-center">{msg}</div>}
    </section>
  );
}
