"use client";

import { useEffect, useState } from "react";
import type { ScheduleEntry } from "../../lib/types";
import type { BriefSummary } from "../../lib/data";

interface Props {
  briefs: BriefSummary[];
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "IG",
  linkedin: "LI",
  youtube: "YT",
};

/** Local calendar date "YYYY-MM-DD" (not UTC: in India, local midnight is the previous UTC day). */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Local "HH:MM" of a stored instant. */
function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** A local date + time as the instant to store (the rep's 09:00 is 09:00 where they are). */
function toInstant(day: string, time: string): string {
  return new Date(`${day}T${time}:00`).toISOString();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function getDays(startDate: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  for (let i = 0; i < 21; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

const todayStr = () => localDay(new Date());

/** What is being dragged: a scheduled entry (move) or an approved post (schedule). */
type Drag = { kind: "entry"; briefId: string } | { kind: "post"; briefId: string };

export function ScheduleBoard({ briefs }: Props) {
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  // Click a scheduled post to move it (works without drag, e.g. on a touch screen).
  const [editing, setEditing] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("09:00");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const updated = (await fetch("/api/schedule").then((r) => r.json())) as ScheduleEntry[];
    setSchedule(updated);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const days = getDays(baseDate);

  const activeSchedule = schedule.filter((s) => s.status === "scheduled");

  const unscheduled = briefs.filter(
    (b) => b.status === "approved" && !activeSchedule.some((s) => s.brief_id === b.id),
  );

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  async function schedulePost(briefId: string, day: string, time: string) {
    setBusy(true);
    const brief = briefs.find((b) => b.id === briefId);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief_id: briefId,
        variant: brief?.topVariant,
        platform: brief?.platform ?? "instagram",
        scheduled_at: toInstant(day, time),
      }),
    });
    await refresh();
    setBusy(false);
    setScheduling(null);
    flash(`Scheduled for ${new Date(`${day}T${time}`).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`);
  }

  async function movePost(briefId: string, day: string, time: string) {
    setBusy(true);
    // Optimistic: the card jumps at once; the server confirms.
    setSchedule((s) => s.map((e) => (e.brief_id === briefId && e.status === "scheduled" ? { ...e, scheduled_at: toInstant(day, time) } : e)));
    await fetch("/api/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief_id: briefId, action: "reschedule", scheduled_at: toInstant(day, time) }),
    });
    await refresh();
    setBusy(false);
    setEditing(null);
    flash(`Moved to ${new Date(`${day}T${time}`).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`);
  }

  async function handleCancel(briefId: string) {
    await fetch("/api/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief_id: briefId, action: "cancel" }),
    });
    await refresh();
    setEditing(null);
    flash("Unscheduled — it's back under Ready to schedule");
  }

  async function dropOn(day: string) {
    setOverDay(null);
    const d = drag;
    setDrag(null);
    if (!d || day < todayStr()) return;
    if (d.kind === "entry") {
      const entry = activeSchedule.find((e) => e.brief_id === d.briefId);
      if (!entry) return;
      const time = localTime(entry.scheduled_at);
      if (localDay(new Date(entry.scheduled_at)) === day) return;
      await movePost(d.briefId, day, time);
    } else {
      await schedulePost(d.briefId, day, "09:00");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Week navigation */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          aria-label="Previous week"
          className="h-9 w-9 rounded-lg border border-line2 bg-panel flex items-center justify-center hover:bg-active"
        >
          &larr;
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          className="h-9 px-4 rounded-lg border border-line2 bg-panel text-sm font-medium hover:bg-active"
        >
          Today
        </button>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          aria-label="Next week"
          className="h-9 w-9 rounded-lg border border-line2 bg-panel flex items-center justify-center hover:bg-active"
        >
          &rarr;
        </button>
        <span className="text-sm text-muted ml-2">
          {days[0]!.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </span>
        <span className="text-xs text-muted">Drag a post to another day to move it, or click it to change the date and time.</span>
        {notice && (
          <span role="status" className="ml-auto text-xs font-semibold text-forest bg-forest/10 border border-forest/20 rounded-lg px-3 py-1.5">
            {notice}
          </span>
        )}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-line rounded-xl overflow-hidden border border-line">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-active px-3 py-2 text-xs font-semibold text-muted text-center">
            {d}
          </div>
        ))}

        {days.map((day) => {
          const dayStr = localDay(day);
          const dayEntries = activeSchedule
            .filter((s) => localDay(new Date(s.scheduled_at)) === dayStr)
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
          const past = dayStr < todayStr();
          const isOver = overDay === dayStr && !!drag && !past;

          return (
            <div
              key={dayStr}
              data-day={dayStr}
              onDragOver={(e) => {
                if (past || !drag) return;
                e.preventDefault();
                if (overDay !== dayStr) setOverDay(dayStr);
              }}
              onDragLeave={() => setOverDay((o) => (o === dayStr ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                void dropOn(dayStr);
              }}
              className={`bg-panel min-h-[110px] px-2 py-1.5 flex flex-col gap-1 transition ${past ? "opacity-50" : ""} ${
                isOver ? "ring-2 ring-inset ring-forest bg-forest/5" : ""
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  dayStr === todayStr() ? "bg-clay text-white" : "text-muted"
                }`}
              >
                {day.getDate()}
              </div>
              {dayEntries.map((entry) => {
                const brief = briefs.find((b) => b.id === entry.brief_id);
                const open = editing === entry.brief_id;
                return (
                  <div key={entry.brief_id} className="flex flex-col gap-1">
                    <button
                      type="button"
                      draggable={!past}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", entry.brief_id);
                        setDrag({ kind: "entry", briefId: entry.brief_id });
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOverDay(null);
                      }}
                      onClick={() => {
                        if (open) return setEditing(null);
                        setEditing(entry.brief_id);
                        setEditDate(localDay(new Date(entry.scheduled_at)));
                        setEditTime(localTime(entry.scheduled_at));
                      }}
                      title="Drag to another day, or click to change"
                      className={`text-left px-2 py-1 border rounded text-[11px] leading-tight ${
                        past ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                      } ${open ? "bg-forest/20 border-forest/40" : "bg-forest/10 border-forest/20 hover:bg-forest/15"}`}
                    >
                      <div className="font-medium text-forest truncate">
                        {PLATFORM_LABEL[entry.platform] ?? entry.platform} {brief?.hook?.replace(/\*/g, "").slice(0, 34) ?? entry.brief_id}
                      </div>
                      <div className="text-muted">{formatTime(entry.scheduled_at)}</div>
                    </button>
                    {open && (
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-line2 bg-field">
                        <input
                          type="date"
                          aria-label="New date"
                          value={editDate}
                          min={todayStr()}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="h-8 px-2 bg-panel border border-line rounded text-xs"
                        />
                        <input
                          type="time"
                          aria-label="New time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="h-8 px-2 bg-panel border border-line rounded text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => movePost(entry.brief_id, editDate, editTime)}
                          disabled={busy || !editDate || editDate < todayStr()}
                          className="h-8 bg-forest text-white rounded text-xs font-semibold disabled:opacity-50"
                        >
                          {busy ? "Saving…" : "Move"}
                        </button>
                        <div className="flex gap-1.5">
                          <a href={`/brief/${entry.brief_id}`} className="flex-1 h-7 flex items-center justify-center border border-line2 rounded text-[11px] hover:bg-active">
                            Open post
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCancel(entry.brief_id)}
                            className="flex-1 h-7 border border-line2 rounded text-[11px] text-clay hover:bg-active"
                          >
                            Unschedule
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Unscheduled approved posts */}
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-medium">Ready to schedule</h2>
        {unscheduled.length === 0 ? (
          <p className="text-sm text-muted">No approved posts waiting. Approve posts on the review board first.</p>
        ) : (
          <>
            <p className="text-xs text-muted -mt-1">Pick a date, or drag a card onto a day in the calendar (it goes in at 9:00).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {unscheduled.map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", b.id);
                    setDrag({ kind: "post", briefId: b.id });
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setOverDay(null);
                  }}
                  className="bg-panel border border-line rounded-xl px-4 py-3 flex flex-col gap-2 cursor-grab active:cursor-grabbing"
                >
                  <div className="font-semibold text-sm truncate">{b.hook.replace(/\*/g, "")}</div>
                  <div className="text-xs text-muted">
                    {b.platform} · {b.format}
                  </div>
                  {scheduling === b.id ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <input
                        type="date"
                        aria-label="Date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        min={todayStr()}
                        className="h-9 px-3 bg-field border border-line rounded-lg text-sm"
                      />
                      <input
                        type="time"
                        aria-label="Time"
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        className="h-9 px-3 bg-field border border-line rounded-lg text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => schedulePost(b.id, selectedDate, selectedTime)}
                          disabled={busy || !selectedDate}
                          className="flex-1 h-9 bg-forest text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {busy ? "Saving..." : "Confirm"}
                        </button>
                        <button onClick={() => setScheduling(null)} className="h-9 px-3 border border-line2 rounded-lg text-sm hover:bg-active">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setScheduling(b.id);
                        setSelectedDate("");
                        setSelectedTime("09:00");
                      }}
                      className="h-9 bg-ink text-white rounded-lg text-sm font-medium hover:brightness-125"
                    >
                      Schedule
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
