"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandCatalog, TemplateCatalog } from "../../lib/catalog";

export function BatchForm({
  brands,
  templates,
}: {
  brands: BrandCatalog[];
  templates: TemplateCatalog[];
}) {
  const router = useRouter();
  const [brandKey, setBrandKey] = useState(brands[0]?.key ?? "");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(
    templates.length ? [templates[0]!.key] : [],
  );
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [hooks, setHooks] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: string[]; failed: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const brand = useMemo(() => brands.find((b) => b.key === brandKey), [brands, brandKey]);
  const anchor = brand?.anchors[0]?.key ?? "";

  function onBrand(k: string) {
    setBrandKey(k);
    setSelectedProducts([]);
  }

  function toggleTemplate(key: string) {
    setSelectedTemplates((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function toggleProduct(key: string) {
    setSelectedProducts((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const products = brand?.products ?? [];
  const totalJobs = selectedTemplates.length * (selectedProducts.length || 1) * count;

  async function submit() {
    setErr(null);
    setResult(null);
    if (!selectedTemplates.length) return setErr("Pick at least one ad type.");
    setBusy(true);
    try {
      const hookList = hooks
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean);
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: brandKey,
          products: selectedProducts.length ? selectedProducts : [products[0]?.key ?? ""],
          templates: selectedTemplates,
          anchor,
          hooks: hookList.length ? hookList : undefined,
          count,
        }),
      });
      const body = (await res.json()) as { created?: string[]; failed?: number; error?: string };
      if (res.ok && body.created) {
        setResult({ created: body.created, failed: body.failed ?? 0 });
      } else {
        setErr(body.error ?? "Batch failed.");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Brand */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Brand</label>
        <select
          value={brandKey}
          onChange={(e) => onBrand(e.target.value)}
          className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field text-ink w-fit"
        >
          {brands.map((b) => (
            <option key={b.key} value={b.key}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Ad types (multi-select) */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Ad types</label>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((t) => (
            <button
              key={t.key}
              onClick={() => toggleTemplate(t.key)}
              className={`text-left p-4 rounded-xl border bg-panel cursor-pointer transition ${
                selectedTemplates.includes(t.key)
                  ? "border-forest ring-2 ring-forest/30"
                  : "border-line hover:bg-active"
              }`}
            >
              <div className="font-display text-base font-medium">{t.name}</div>
              <div className="text-xs text-muted mt-1">
                {t.format} · {t.platform}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Products (multi-select) */}
      {products.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold">Products</label>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => (
              <button
                key={p.key}
                onClick={() => toggleProduct(p.key)}
                className={`px-4 py-2 rounded-lg border text-sm cursor-pointer transition ${
                  selectedProducts.includes(p.key)
                    ? "border-forest bg-forest/10 text-forest font-semibold"
                    : "border-line2 bg-panel text-ink hover:bg-active"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">
            {selectedProducts.length === 0
              ? "None selected — will use the first product."
              : `${selectedProducts.length} selected`}
          </span>
        </div>
      )}

      {/* Hooks */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">
          Hooks <span className="text-muted font-normal">(one per line, optional)</span>
        </label>
        <textarea
          value={hooks}
          onChange={(e) => setHooks(e.target.value)}
          placeholder={"New season, same roots.\nHandcrafted for the everyday.\nMade with care, worn with pride."}
          rows={3}
          className="px-3 py-2 border border-line2 rounded-[10px] text-sm bg-field resize-y"
        />
      </div>

      {/* Variations per combo */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Variations per combination</label>
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`w-12 h-11 rounded-[10px] border text-sm font-semibold cursor-pointer transition ${
                count === n
                  ? "border-forest bg-forest/10 text-forest"
                  : "border-line2 bg-panel text-ink hover:bg-active"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="text-sm text-clay">{err}</div>}

      {result && (
        <div className="p-4 rounded-xl border border-forest/30 bg-forest/5">
          <div className="font-semibold text-forest">
            {result.created.length} post{result.created.length === 1 ? "" : "s"} created
            {result.failed > 0 && `, ${result.failed} failed`}
          </div>
          <button
            onClick={() => router.push("/")}
            className="mt-2 text-sm font-semibold text-forest underline cursor-pointer bg-transparent border-0 p-0"
          >
            View on review board →
          </button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={submit}
          disabled={busy || selectedTemplates.length === 0}
          className="h-12 px-6 rounded-[10px] bg-forest text-white font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Creating…" : `Generate ${totalJobs} post${totalJobs === 1 ? "" : "s"}`}
        </button>
        <span className="text-xs text-muted">
          {selectedTemplates.length} type{selectedTemplates.length === 1 ? "" : "s"} ×{" "}
          {selectedProducts.length || 1} product{selectedProducts.length === 1 ? "" : "s"} ×{" "}
          {count} = {totalJobs} job{totalJobs === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
