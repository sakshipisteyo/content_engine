"use client";
import { useState } from "react";

export function CaptionBox({
  briefId,
  initial,
  hashtags,
}: {
  briefId: string;
  initial: string;
  hashtags: string[];
}) {
  const full = hashtags.length ? `${initial}\n\n${hashtags.join(" ")}` : initial;
  const [text, setText] = useState(full);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "err">("idle");

  async function save() {
    setSaved("saving");
    const res = await fetch("/api/caption", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief_id: briefId, caption: text }),
    });
    setSaved(res.ok ? "ok" : "err");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="caption" className="text-xs text-muted">
          Edit inline; the engine keeps your voice next time
        </label>
        <button
          onClick={save}
          disabled={saved === "saving"}
          className="text-xs font-semibold text-clay hover:text-clay-dark disabled:opacity-50"
        >
          {saved === "saving" ? "Saving…" : saved === "ok" ? "Saved ✓" : "Save"}
        </button>
      </div>
      <textarea
        id="caption"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved("idle");
        }}
        className="w-full box-border min-h-[118px] p-3 border border-line2 rounded-[10px] text-sm leading-relaxed text-ink resize-y bg-field"
      />
      {saved === "err" && <span className="text-[11px] text-clay">Save failed.</span>}
    </div>
  );
}
