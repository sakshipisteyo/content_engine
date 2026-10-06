"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandCatalog, TemplateCatalog } from "../../lib/catalog";

type Source = { title: string; url: string; publisher?: string; date?: string };

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
  const [photo, setPhoto] = useState<File | null>(null);
  const [scene, setScene] = useState("");
  // AI writer
  const [notes, setNotes] = useState("");
  const [aiPicks, setAiPicks] = useState(true);
  const [aiBusy, setAiBusy] = useState<"" | "draft" | "ideas" | "news">("");
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiWhy, setAiWhy] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<{ title: string; template: string; notes: string; why: string; source?: Source }[]>([]);
  // News posts: the verified story the post is about (its caption cites and links it).
  const [source, setSource] = useState<Source | null>(null);
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

  async function aiDraft(fromNotes = notes, forceTemplate?: string) {
    setAiBusy("draft");
    setAiErr(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: brandKey, notes: fromNotes, template: forceTemplate ?? (aiPicks ? undefined : templateKey) }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        error?: string;
        draft?: { template: string; hook: string; body: string; attribution: string; scene: string; cta: string; angle: string; why: string };
      };
      if (!res.ok || !out.draft) return setAiErr(out.error ?? "The AI writer failed.");
      const d = out.draft;
      if (templates.some((t) => t.key === d.template)) setTemplateKey(d.template);
      setHook(d.hook);
      setBody(d.body);
      setAttribution(d.attribution);
      setScene(d.scene);
      setCta(d.cta);
      setAngle(d.angle);
      setAiWhy(d.why || null);
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setAiBusy("");
    }
  }

  async function aiIdeas(news = false) {
    setAiBusy(news ? "news" : "ideas");
    setAiErr(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: brandKey, ...(news ? { news: true } : { ideas: true }) }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string; ideas?: typeof ideas };
      if (!res.ok || !out.ideas) return setAiErr(out.error ?? "The AI writer failed.");
      setIdeas(out.ideas);
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setAiBusy("");
    }
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
    if (source) {
      fd.set("source_url", source.url);
      fd.set("source_title", source.title);
      if (source.publisher) fd.set("source_publisher", source.publisher);
      if (source.date) fd.set("source_date", source.date);
    }
    if (template?.asksPhoto) {
      if (photo) fd.append("media", photo);
      if (scene.trim()) fd.set("scene", scene.trim());
    }
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
      {/* AI writer */}
      <section className="flex flex-col gap-3 p-5 rounded-xl border border-forest/30 bg-forest/5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="ai-notes" className="text-sm font-semibold">✨ Let AI write it</label>
          <span className="text-[11px] text-muted">Uses your brand&apos;s offer, pillars, proof points and tone</span>
        </div>
        <textarea
          id="ai-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={"Paste rough notes: what happened, a number, a lesson, a customer story. e.g.\nRolled out 6 AI agents at a hospital; 1,161 runs in the first weeks; the most-used one was the plain Q&A agent over their OneNote."}
          className="px-3 py-2.5 border border-line2 rounded-[10px] text-sm bg-field resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => aiDraft()}
            disabled={!!aiBusy || !brandKey}
            className="h-10 px-4 rounded-[10px] bg-forest text-white text-sm font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
          >
            {aiBusy === "draft" ? "Writing…" : notes.trim() ? "Write it for me" : "Surprise me (no notes)"}
          </button>
          <button
            type="button"
            onClick={() => aiIdeas()}
            disabled={!!aiBusy || !brandKey}
            className="h-10 px-4 rounded-[10px] border border-line2 bg-panel text-sm font-semibold cursor-pointer hover:bg-active disabled:opacity-50"
          >
            {aiBusy === "ideas" ? "Thinking…" : "Give me ideas"}
          </button>
          <button
            type="button"
            onClick={() => aiIdeas(true)}
            disabled={!!aiBusy || !brandKey}
            title="Searches this week's news in your brand's field and suggests your take on it"
            className="h-10 px-4 rounded-[10px] border border-line2 bg-panel text-sm font-semibold cursor-pointer hover:bg-active disabled:opacity-50"
          >
            {aiBusy === "news" ? "Searching the news… ~1 min" : "📰 What's new"}
          </button>
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={aiPicks} onChange={(e) => setAiPicks(e.target.checked)} />
            Let AI pick the post type
          </label>
        </div>
        {aiErr && <div className="text-sm text-clay">{aiErr}</div>}
        {source && (
          <div className="flex items-center gap-2 text-xs bg-panel border border-line rounded-[10px] px-3 py-2">
            <span className="font-semibold">News source:</span>
            <a href={source.url} target="_blank" rel="noreferrer" className="text-forest truncate">
              {source.publisher ? `${source.publisher}: ` : ""}{source.title}
            </a>
            <button type="button" onClick={() => setSource(null)} className="ml-auto text-muted cursor-pointer" aria-label="Remove source">✕</button>
          </div>
        )}
        {aiWhy && (
          <div className="text-xs text-ink bg-panel border border-line rounded-[10px] px-3 py-2">
            <span className="font-semibold">Drafted below — review, edit, then generate.</span> {aiWhy}
          </div>
        )}
        {ideas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ideas.map((i) => (
              <button
                key={i.title}
                type="button"
                onClick={() => {
                  setNotes(i.notes);
                  setSource(i.source ?? null);
                  setIdeas([]);
                  aiDraft(i.notes, i.template);
                }}
                className="text-left p-3 rounded-[10px] border border-line2 bg-panel cursor-pointer hover:bg-active"
              >
                <div className="text-sm font-semibold">{i.title}</div>
                <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wide">{templates.find((t) => t.key === i.template)?.name ?? i.template}</div>
                <div className="text-xs text-muted mt-1">{i.why}</div>
                {i.source && (
                  <div className="text-[11px] text-forest mt-1 truncate">
                    {i.source.publisher}{i.source.date ? ` · ${i.source.date}` : ""} — {i.source.title}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

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
        {template?.asksPhoto && (
          <div className="flex flex-col gap-2 mt-2">
            <FilePick
              label={photo ? photo.name : "Photo (optional) — or describe one below and Higgsfield generates it"}
              accept="image/png,image/jpeg,image/webp"
              onPick={(f) => setPhoto(f[0] ?? null)}
            />
            <input
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="Describe the photo, e.g. a factory floor, an engineer and an operator looking at a tablet together"
              className="h-11 px-3 border border-line2 rounded-[10px] text-sm bg-field"
            />
            <div className="text-[11px] text-muted">
              With no photo: Higgsfield generates the scene (needs a key, ~4 credits, made once and reused), else a brand photo or brand colours are used.
            </div>
          </div>
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
