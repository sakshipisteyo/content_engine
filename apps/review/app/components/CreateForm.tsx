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
  const [attribution, setAttribution] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [media, setMedia] = useState<File[]>([]);
  const [presenter, setPresenter] = useState<File | null>(null);
  const [music, setMusic] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const brand = useMemo(() => brands.find((b) => b.key === brandKey), [brands, brandKey]);
  const template = useMemo(() => templates.find((t) => t.key === templateKey), [templates, templateKey]);
  const isText = template?.renderer === "typographic";
  const isVideo = template?.renderer === "montage";
  /** Text and video posts need only the brand (no product / style pickers). */
  const simple = isText || isVideo;
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
    if (!hook.trim()) {
      return setErr(isText ? "Write the statement for the card." : isVideo ? "Give the video a title." : "Add a hook — a few words about the post.");
    }
    if (isVideo) {
      if (template?.asksMedia === "screens" && media.length === 0) return setErr("Upload the screenshots or screen recording to walk through.");
      if (template?.asksMedia === "presenter" && !presenter) return setErr("Upload a photo of the presenter.");
      if (template?.asksMedia === "presenter" && !body.trim()) return setErr("Write the script the presenter will say.");
    }
    setBusy(true);
    const fd = new FormData();
    fd.set("brand", brandKey);
    fd.set("template", templateKey);
    fd.set("hook", hook);
    if (cta.trim()) fd.set("cta", cta.trim());
    if (angle) fd.set("angle", angle);
    if (product) fd.set("product", product);
    if (anchor) fd.set("anchor", anchor);
    if (file && !isText) fd.set("product_image", file);
    if (isText && attribution.trim()) fd.set("attribution", attribution.trim());
    if (template?.asksBody && body.trim()) fd.set("body", body.trim());
    if (isVideo) {
      for (const m of media) fd.append("media", m);
      if (presenter) fd.set("presenter", presenter);
      if (music) fd.set("music", music);
    }
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
                {t.renderer === "typographic" ? "text post" : t.renderer === "montage" ? "video" : t.format} · {t.platform}
                {t.renderer === "typographic" && " · 0 credits"}
                {t.renderer === "montage" && " · free draft"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Brand + product + anchor */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">2 · {simple ? "Brand" : "Brand & product"}</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Brand" value={brandKey} onChange={onBrand} options={brands.map((b) => ({ v: b.key, l: b.name }))} />
          {!simple && (<>
          <Select
            label={brand?.businessType === "service" ? "Offering" : "Product"}
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
          </>)}
        </div>
      </div>

      {/* Product image upload (photo templates only) */}
      {!simple && (
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
      )}

      {/* Words */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">
          {simple ? "3" : "4"} · {template?.hookLabel ?? "A few words"}
        </label>
        {(isText && template?.asksBody) || isVideo ? (
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder={template.hookPlaceholder ?? "Title"}
            maxLength={120}
            className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
          />
        ) : isText ? (
          <>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder={template?.hookPlaceholder ?? "Your statement"}
              rows={4}
              maxLength={400}
              className="px-3 py-2.5 border border-line2 rounded-[10px] text-sm bg-field resize-y"
            />
            <div className="text-[11px] text-muted -mt-1">
              {hook.length}/400 · shown on the card exactly as written, under your brand&apos;s name and handle
            </div>
          </>
        ) : (
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder={template?.hookPlaceholder ?? "Hook — what's the post about? e.g. Hand-stitched in Kolhapur, worn in Bandra."}
            className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
          />
        )}
        {template?.asksBody && (
          <>
            <label className="text-xs text-muted mt-1">{template.bodyLabel ?? "Outline"}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={template.bodyPlaceholder ?? ""}
              rows={8}
              className="px-3 py-2.5 border border-line2 rounded-[10px] text-sm bg-field resize-y font-mono"
            />
            {!isVideo && (
              <div className="text-[11px] text-muted -mt-1">
                Leave blank to have it drafted from the title (needs an OpenRouter key). The example shows the format.
              </div>
            )}
          </>
        )}
        {isVideo && (
          <div className="flex flex-col gap-3 mt-2">
            {template?.asksMedia === "presenter" && (
              <FilePick
                label={presenter ? presenter.name : "Presenter photo — a clear, front-facing portrait (JPG/PNG)"}
                accept="image/png,image/jpeg,image/webp"
                onPick={(f) => setPresenter(f[0] ?? null)}
              />
            )}
            <FilePick
              label={
                media.length
                  ? `${media.length} file${media.length > 1 ? "s" : ""}: ${media.map((m) => m.name).join(", ")}`
                  : template?.asksMedia === "screens"
                    ? "Screenshots and/or a screen recording (MP4/MOV/WebM), in step order"
                    : template?.asksMedia === "presenter"
                      ? "Optional: product shots or clips to show after the presenter"
                      : "Product photos or clips (optional — the brand's photos are used otherwise)"
              }
              accept="image/*,video/mp4,video/quicktime,video/webm,.mov,.mkv"
              multiple
              onPick={(f) => setMedia(f.slice(0, 20))}
            />
            <FilePick label={music ? music.name : "Background music (optional, MP3/WAV) — use a track you have rights to"} accept="audio/*" onPick={(f) => setMusic(f[0] ?? null)} />
          </div>
        )}
        {template?.asksAttribution && (
          <input
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            placeholder="Credit line (optional) — who said it, if it isn't you. e.g. Blake Burge"
            className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder={brand?.defaultCta ? `Call to action (default: ${brand.defaultCta})` : "Call to action (e.g. Book a demo)"}
            className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
          />
          <input
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Angle / pillar (optional, e.g. customer wins)"
            className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
          />
        </div>
        {brand?.pillars.length ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Your pillars:
            {brand.pillars.map((p) => (
              <button
                key={p.name}
                type="button"
                title={p.description}
                onClick={() => setAngle(p.name)}
                className={`px-3 py-1 rounded-full border cursor-pointer ${
                  angle === p.name ? "border-forest bg-forest text-white" : "border-line2 bg-panel text-ink hover:bg-active"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {err && <div className="text-sm text-clay">{err}</div>}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy}
          className="h-12 px-6 rounded-[10px] bg-forest text-white font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
        >
          {busy ? (isVideo ? "Rendering video… about a minute" : "Creating…") : isVideo ? "Create video (free draft)" : "Generate post"}
        </button>
        <span className="text-xs text-muted">
          {isText
            ? "Renders now — dark, light and brand-colour versions, free."
            : isVideo
              ? "Renders a free draft in 16:9, 9:16 and 1:1. Higgsfield shots render from the post page."
              : "Compiles the plan now; real pixels render once API keys are added."}
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

function FilePick({ label, accept, multiple, onPick }: { label: string; accept: string; multiple?: boolean; onPick: (f: File[]) => void }) {
  return (
    <label className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-line2 bg-field cursor-pointer hover:bg-active">
      <span className="px-3 py-2 rounded-lg bg-panel border border-line2 text-sm font-medium shrink-0">Browse</span>
      <span className="text-sm text-muted break-all">{label}</span>
      <input type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => onPick(Array.from(e.target.files ?? []))} />
    </label>
  );
}
