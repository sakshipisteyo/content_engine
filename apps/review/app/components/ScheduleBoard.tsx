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

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function getWeekDays(startDate: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(startDate);
  start.setDate(start.getDate() - start.getDay());
  for (let i = 0; i < 21; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date) {
  return isSameDay(d, new Date());
}

export function ScheduleBoard({ briefs }: Props) {
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/schedule")
      .then((r) => r.json())
      .then((data: ScheduleEntry[]) => setSchedule(data));
  }, []);

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const days = getWeekDays(baseDate);

  const activeSchedule = schedule.filter((s) => s.status === "scheduled");

  const unscheduled = briefs.filter(
    (b) =>
      b.status === "approved" &&
      !activeSchedule.some((s) => s.brief_id === b.id),
  );

  async function handleSchedule(briefId: string) {
    if (!selectedDate || !selectedTime) return;
    setBusy(true);
    const brief = briefs.find((b) => b.id === briefId);
    const scheduled_at = `${selectedDate}T${selectedTime}:00.000Z`;
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief_id: briefId,
        variant: brief?.topVariant,
        platform: brief?.platform ?? "instagram",
        scheduled_at,
      }),
    });
    const updated = await fetch("/api/schedule").then((r) => r.json());
    setSchedule(updated);
    setBusy(false);
    setScheduling(null);
  }

  async function handleCancel(briefId: string) {
    await fetch("/api/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief_id: briefId, action: "cancel" }),
    });
    const updated = await fetch("/api/schedule").then((r) => r.json());
    setSchedule(updated);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Week navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
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
          className="h-9 w-9 rounded-lg border border-line2 bg-panel flex items-center justify-center hover:bg-active"
        >
          &rarr;
        </button>
        <span className="text-sm text-muted ml-2">
          {days[0]!.toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-line rounded-xl overflow-hidden border border-line">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-active px-3 py-2 text-xs font-semibold text-muted text-center"
          >
            {d}
          </div>
        ))}

        {days.map((day) => {
          const dayStr = day.toISOString().slice(0, 10);
          const dayEntries = activeSchedule.filter((s) =>
            s.scheduled_at.startsWith(dayStr),
          );
          const past = day < new Date(new Date().toDateString());

          return (
            <div
              key={dayStr}
              className={`bg-panel min-h-[110px] px-2 py-1.5 flex flex-col gap-1 ${
                past ? "opacity-50" : ""
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday(day) ? "bg-clay text-white" : "text-muted"
                }`}
              >
                {day.getDate()}
              </div>
              {dayEntries.map((entry) => {
                const brief = briefs.find((b) => b.id === entry.brief_id);
                return (
                  <div
                    key={entry.brief_id}
                    className="group relative px-2 py-1 bg-forest/10 border border-forest/20 rounded text-[11px] leading-tight cursor-default"
                  >
                    <div className="font-medium text-forest truncate">
                      {PLATFORM_LABEL[entry.platform] ?? entry.platform}{" "}
                      {brief?.hook?.slice(0, 30) ?? entry.brief_id}
                    </div>
                    <div className="text-muted">{formatTime(entry.scheduled_at)}</div>
                    <button
                      onClick={() => handleCancel(entry.brief_id)}
                      className="absolute top-0.5 right-0.5 hidden group-hover:block text-[10px] text-clay hover:text-clay-dark"
                    >
                      &times;
                    </button>
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
          <p className="text-sm text-muted">
            No approved posts waiting. Approve posts on the review board first.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {unscheduled.map((b) => (
              <div
                key={b.id}
                className="bg-panel border border-line rounded-xl px-4 py-3 flex flex-col gap-2"
              >
                <div className="font-semibold text-sm truncate">{b.hook}</div>
                <div className="text-xs text-muted">
                  {b.platform} · {b.format}
                </div>
                {scheduling === b.id ? (
                  <div className="flex flex-col gap-2 mt-1">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="h-9 px-3 bg-field border border-line rounded-lg text-sm"
                    />
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="h-9 px-3 bg-field border border-line rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSchedule(b.id)}
                        disabled={busy || !selectedDate}
                        className="flex-1 h-9 bg-forest text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        {busy ? "Saving..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setScheduling(null)}
                        className="h-9 px-3 border border-line2 rounded-lg text-sm hover:bg-active"
                      >
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
        )}
      </div>
    </div>
  );
}
