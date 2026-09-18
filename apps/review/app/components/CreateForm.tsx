"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandCatalog, TemplateCatalog } from "../../lib/catalog";

export function CreateForm({
  brands,
  templates,
}: {
  brands: BrandCatalog[];
  templates: TemplateCatalog[];
}) {
  const router = useRouter();
  const [brandKey, setBrandKey] = useState(brands[0]?.key ?? "");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [hook, setHook] = useState("");
  const [cta, setCta] = useState("");
  const [angle, setAngle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const brand = useMemo(() => brands.find((b) => b.key === brandKey), [brands, brandKey]);
  const template = useMemo(() => templates.find((t) => t.key === templateKey), [templates, templateKey]);
  const [product, setProduct] = useState(brand?.products[0]?.key ?? "");
  const [anchor, setAnchor] = useState(brand?.anchors[0]?.key ?? "");

  function onBrand(k: string) {
    setBrandKey(k);
    const b = brands.find((x) => x.key === k);
    setProduct(b?.products[0]?.key ?? "");
    setAnchor(b?.anchors[0]?.key ?? "");
  }

  async function submit() {
    setErr(null);
    if (!hook.trim()) return setErr("Add a hook — a few words about the post.");
    setBusy(true);
    const fd = new FormData();
    fd.set("brand", brandKey);
    fd.set("template", templateKey);
    fd.set("hook", hook);
    fd.set("cta", cta || "Learn more");
    if (angle) fd.set("angle", angle);
    if (product) fd.set("product", product);
    if (anchor) fd.set("anchor", anchor);
    if (file) fd.set("product_image", file);
    try {
      const res = await fetch("/api/create", { method: "POST", body: fd });
      const body = (await res.json()) as { id?: string; error?: string };
      if (res.ok && body.id) router.push(`/brief/${body.id}`);
      else setErr(body.error ?? "Create failed.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsImage = template?.usesProductImage ?? true;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Template picker */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">1 · Pick an ad type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t) => (
            <button
              key={t.key}
              onClick={() => setTemplateKey(t.key)}
              className={`text-left p-4 rounded-xl border bg-panel cursor-pointer transition ${
                templateKey === t.key ? "border-forest ring-2 ring-forest/30" : "border-line hover:bg-active"
              }`}
            >
              <div className="font-display text-base font-medium">{t.name}</div>
              <div className="text-xs text-muted mt-1">{t.description}</div>
              <div className="text-[11px] text-muted mt-2 uppercase tracking-wide">
                {t.format} · {t.platform}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Brand + product + anchor */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">2 · Brand & product</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Brand" value={brandKey} onChange={onBrand} options={brands.map((b) => ({ v: b.key, l: b.name }))} />
          <Select
            label="Product"
            value={product}
            onChange={setProduct}
            options={(brand?.products ?? []).map((p) => ({ v: p.key, l: p.name }))}
          />
          <Select
            label="Style anchor"
            value={anchor}
            onChange={setAnchor}
            options={(brand?.anchors ?? []).map((a) => ({ v: a.key, l: a.key }))}
          />
        </div>
      </div>

      {/* Product image upload */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">
          3 · Product image {needsImage ? "" : <span className="text-muted font-normal">(optional for this type)</span>}
        </label>
        <label className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-line2 bg-field cursor-pointer hover:bg-active">
          <span className="px-3 py-2 rounded-lg bg-panel border border-line2 text-sm font-medium">Choose image</span>
          <span className="text-sm text-muted">{file ? file.name : "PNG or JPG of your product"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {/* Words */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">4 · A few words</label>
        <input
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          placeholder="Hook — what's the post about? e.g. Hand-stitched in Kolhapur, worn in Bandra."
          className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="Call to action (e.g. Shop the festive edit)"
            className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
          />
          <input
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Angle (optional, e.g. artisan pride)"
            className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
          />
        </div>
      </div>

      {err && <div className="text-sm text-clay">{err}</div>}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="h-12 px-6 rounded-[10px] bg-forest text-white font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Generate post"}
        </button>
        <span className="text-xs text-muted">
          Compiles the plan now; real pixels render once API keys are added.
        </span>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 px-2 border border-line2 rounded-[10px] text-sm bg-field text-ink"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}
