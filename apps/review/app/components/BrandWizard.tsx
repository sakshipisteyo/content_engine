"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function BrandWizard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tone, setTone] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [products, setProducts] = useState<File[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("");
  const [banned, setBanned] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!name.trim()) return setErr("Give your brand a name.");
    if (products.length === 0) return setErr("Add at least one product photo.");
    setBusy(true);
    const fd = new FormData();
    fd.set("name", name);
    if (tone) fd.set("tone", tone);
    if (logo) fd.set("logo", logo);
    for (const p of products) fd.append("products", p);
    if (advanced) {
      if (category) fd.set("category", category);
      if (audience) fd.set("audience", audience);
      if (banned) fd.set("banned", banned);
      if (budget) fd.set("budget", budget);
    }
    try {
      const res = await fetch("/api/brand", { method: "POST", body: fd });
      const body = (await res.json()) as { key?: string; error?: string };
      if (res.ok && body.key) router.push(`/?brand=${body.key}`);
      else setErr(body.error ?? "Could not create the brand.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">1 · Your brand name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Banjaaran Studio"
          className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">
          2 · Logo <span className="text-muted font-normal">(optional, transparent PNG is best)</span>
        </label>
        <FileField label={logo ? logo.name : "Choose logo"} accept="image/*" onPick={(f) => setLogo(f[0] ?? null)} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">3 · Product photos</label>
        <FileField
          label={products.length ? `${products.length} selected` : "Choose 1–5 product photos"}
          accept="image/*"
          multiple
          onPick={(f) => setProducts(f.slice(0, 5))}
        />
        <span className="text-xs text-muted">We read your brand colours straight from these.</span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">
          4 · Tone <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="warm, confident, unhurried"
          className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
        />
      </div>

      <button onClick={() => setAdvanced((a) => !a)} className="text-sm font-semibold text-clay hover:text-clay-dark w-fit">
        {advanced ? "− Hide advanced" : "+ Advanced (category, audience, banned words, budget)"}
      </button>
      {advanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Text label="Category" value={category} set={setCategory} ph="handcrafted footwear" />
          <Text label="Audience" value={audience} set={setAudience} ph="urban women 25–40" />
          <Text label="Banned words (comma)" value={banned} set={setBanned} ph="cheap, sale, discount" />
          <Text label="Monthly credit budget" value={budget} set={setBudget} ph="400" />
        </div>
      )}

      {err && <div className="text-sm text-clay">{err}</div>}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="h-12 px-6 rounded-[10px] bg-forest text-white font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Setting up…" : "Create brand"}
        </button>
        <span className="text-xs text-muted">We auto-detect your palette; you can refine it later.</span>
      </div>
    </div>
  );
}

function FileField({
  label,
  accept,
  multiple,
  onPick,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  onPick: (files: File[]) => void;
}) {
  return (
    <label className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-line2 bg-field cursor-pointer hover:bg-active">
      <span className="px-3 py-2 rounded-lg bg-panel border border-line2 text-sm font-medium">Browse</span>
      <span className="text-sm text-muted">{label}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => onPick(Array.from(e.target.files ?? []))}
      />
    </label>
  );
}

function Text({
  label,
  value,
  set,
  ph,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  ph: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={ph}
        className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field text-ink"
      />
    </label>
  );
}
