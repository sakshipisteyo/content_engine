"use client";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) window.location.assign(next);
      else setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Sign-in failed.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field text-ink"
        />
      </label>
      {err && <div className="text-sm text-clay">{err}</div>}
      <button
        type="submit"
        disabled={busy || !password}
        className="h-11 mt-1 rounded-[10px] bg-forest text-white font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
