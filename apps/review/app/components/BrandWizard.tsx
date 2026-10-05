"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type BusinessType = "product" | "service";
const GOALS = [
  ["leads", "Get leads / demos"],
  ["awareness", "Brand awareness"],
  ["launch", "Launch something"],
  ["authority", "Thought leadership"],
  ["community", "Build community"],
  ["hiring", "Hiring"],
] as const;
const CHANNELS = [
  ["linkedin", "LinkedIn"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["x", "X / Twitter"],
  ["youtube", "YouTube"],
] as const;
const THEMES = [
  ["dark", "Dark"],
  ["light", "Light"],
  ["brand", "Brand colour"],
] as const;
const STEPS = ["Business", "Audience & goals", "Voice & content", "Look"];

/** Starter pillars from the business type and goals; the user edits them freely. */
function suggestPillars(type: BusinessType, goals: string[]): string[] {
  const base =
    type === "service"
      ? ["Expert tips — practical how-tos from our work", "Client wins — results and stories", "Point of view — our take on the industry"]
      : ["Product in action — features and use cases", "Customer wins — results and quotes", "Tips — how to get more out of it"];
  const extra: Record<string, string> = {
    launch: "What's new — launches and updates",
    authority: "Founder takes — opinions and lessons",
    community: "Behind the scenes — team and culture",
    hiring: "Life at the company — roles and team",
    leads: "Myths vs facts — objections answered",
  };
  for (const g of goals) if (extra[g] && base.length < 5) base.push(extra[g]);
  return base;
}

const splitLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const splitList = (s: string) => s.split(/[,\n]/).map((l) => l.trim()).filter(Boolean);

export function BrandWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // 1 · Business
  const [name, setName] = useState("");
  const [type, setType] = useState<BusinessType>("product");
  const [website, setWebsite] = useState("");
  const [offer, setOffer] = useState("");
  const [offerings, setOfferings] = useState("");
  const [proof, setProof] = useState("");
  // 2 · Audience & goals
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("");
  const [pains, setPains] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(["linkedin"]);
  const [perWeek, setPerWeek] = useState("3");
  // 3 · Voice & content
  const [tone, setTone] = useState("");
  const [pillars, setPillars] = useState("");
  const [cta, setCta] = useState("");
  const [banned, setBanned] = useState("");
  const [examples, setExamples] = useState("");
  const [rules, setRules] = useState("");
  const [disclaimer, setDisclaimer] = useState("");
  // 4 · Look
  const [logo, setLogo] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [exactColors, setExactColors] = useState(false);
  const [colors, setColors] = useState<string[]>(["#111827", "#2563EB", ""]);
  const [themes, setThemes] = useState<string[]>(["dark", "light", "brand"]);
  const [fontRegular, setFontRegular] = useState<File | null>(null);
  const [fontBold, setFontBold] = useState<File | null>(null);
  const [budget, setBudget] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  /** First problem on a step, or null. */
  function check(s: number): string | null {
    if (s === 0) {
      if (!name.trim()) return "Give your brand a name.";
      if (!offer.trim()) return "Say in one line what you sell.";
    }
    if (s === 1 && !audience.trim()) return "Say who you're trying to reach.";
    if (s === 3) {
      if (type === "product" && photos.length === 0) return "Add at least one product photo, or go back and choose 'We sell a service'.";
      if (exactColors) {
        const hex = colors.map((c) => c.trim()).filter(Boolean);
        if (!hex.length) return "Enter at least one brand colour, or switch back to auto-detect.";
        const bad = hex.find((c) => !/^#[0-9a-fA-F]{6}$/.test(c));
        if (bad) return `"${bad}" isn't a colour like #1A2B3C.`;
      }
      if (!themes.length) return "Pick at least one post theme.";
      if (fontBold && !fontRegular) return "Add the regular font file too.";
    }
    return null;
  }

  function next() {
    const problem = check(step);
    setErr(problem);
    if (problem) return;
    if (step === 1 && !pillars.trim()) setPillars(suggestPillars(type, goals).join("\n"));
    setStep(step + 1);
  }

  async function submit() {
    for (let s = 0; s < STEPS.length; s++) {
      const problem = check(s);
      if (problem) {
        setStep(s);
        return setErr(problem);
      }
    }
    setErr(null);
    setBusy(true);
    const intake = {
      name: name.trim(),
      business_type: type,
      website: website.trim() || undefined,
      offer: offer.trim(),
      offerings: splitLines(offerings),
      proof_points: splitLines(proof),
      category: category.trim() || undefined,
      audience: audience.trim(),
      pains: splitLines(pains),
      goals,
      channels,
      posts_per_week: Number(perWeek) || undefined,
      tone: splitList(tone),
      pillars: splitLines(pillars).map((l) => {
        const [n, ...rest] = l.split(/\s+[—–-]\s+/);
        const description = rest.join(" - ").trim();
        return { name: n!.trim(), ...(description ? { description } : {}) };
      }),
      default_cta: cta.trim() || undefined,
      banned_words: splitList(banned),
      examples: splitLines(examples),
      brand_rules: rules.trim() || undefined,
      disclaimer: disclaimer.trim() || undefined,
      handle: handle.trim() || undefined,
      display_name: displayName.trim() || undefined,
      colors: exactColors ? colors.map((c) => c.trim()).filter(Boolean) : [],
      themes,
      monthly_credit_budget: Number(budget) || undefined,
    };
    const fd = new FormData();
    fd.set("intake", JSON.stringify(intake));
    if (logo) fd.set("logo", logo);
    for (const p of photos) fd.append("products", p);
    if (fontRegular) fd.set("font_regular", fontRegular);
    if (fontBold) fd.set("font_bold", fontBold);
    try {
      const res = await fetch("/api/brand", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
      if (res.ok && body.key) router.push(`/?brand=${body.key}`);
      else setErr(body.error ?? `Could not create the brand (HTTP ${res.status}).`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const service = type === "service";
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <ol className="flex flex-wrap gap-2 m-0 p-0 list-none">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => (i < step ? setStep(i) : undefined)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                i === step
                  ? "border-forest bg-forest text-white"
                  : i < step
                    ? "border-forest/40 text-forest bg-panel cursor-pointer"
                    : "border-line2 text-muted bg-panel"
              }`}
            >
              {i + 1} · {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Section title="Your business">
          <Text label="Brand name" value={name} set={setName} ph="e.g. Acme AI" />
          <div className="flex flex-col gap-1 text-xs text-muted">
            What you sell
            <div className="flex gap-2">
              <Chip on={!service} onClick={() => setType("product")}>We sell a product</Chip>
              <Chip on={service} onClick={() => setType("service")}>We sell a service</Chip>
            </div>
          </div>
          <Text label="In one line: what you sell, and to whom" value={offer} set={setOffer} ph="AI copilot that answers support tickets for B2B SaaS teams" />
          <Area
            label={service ? "Your services (one per line, optional)" : "Your products (one per line, optional)"}
            value={offerings}
            set={setOfferings}
            ph={service ? "AI strategy workshops\nCustom agent builds" : "Support Copilot\nAnalytics add-on"}
          />
          <Text label="Website (optional)" value={website} set={setWebsite} ph="https://acme.ai" />
          <Area
            label="Proof points (optional, one per line) — the only facts and numbers posts will use"
            value={proof}
            set={setProof}
            ph={"Used by 120+ SaaS teams\nCuts first-response time by 60%\nSOC 2 Type II"}
          />
        </Section>
      )}

      {step === 1 && (
        <Section title="Audience & goals">
          <Text label="Who you're trying to reach" value={audience} set={setAudience} ph="Heads of support at B2B SaaS companies, 50–500 staff" />
          <Text label="Industry / category (optional)" value={category} set={setCategory} ph="AI customer-support software" />
          <Area label="Their problems you solve (optional, one per line)" value={pains} set={setPains} ph={"Ticket backlogs after launches\nSlow first replies\nHiring can't keep up"} />
          <ChipGroup label="Goals" options={GOALS} value={goals} toggle={(v) => toggle(goals, setGoals, v)} />
          <ChipGroup label="Where you post" options={CHANNELS} value={channels} toggle={(v) => toggle(channels, setChannels, v)} />
          <Text label="Posts per week" value={perWeek} set={setPerWeek} ph="3" />
        </Section>
      )}

      {step === 2 && (
        <Section title="Voice & content">
          <Text label="Tone (comma separated)" value={tone} set={setTone} ph="sharp, technical, no hype" />
          <div className="flex flex-col gap-1">
            <Area
              label="Content pillars — the topics you post about, one per line ('Name — what it covers')"
              value={pillars}
              set={setPillars}
              ph={suggestPillars(type, goals).join("\n")}
              rows={5}
            />
            <button
              type="button"
              onClick={() => setPillars(suggestPillars(type, goals).join("\n"))}
              className="text-xs font-semibold text-clay hover:text-clay-dark w-fit"
            >
              Suggest pillars for me
            </button>
          </div>
          <Text label="Default call to action" value={cta} set={setCta} ph="Book a demo" />
          <Text label="Words to never use (comma separated)" value={banned} set={setBanned} ph="cheap, revolutionary, game-changer" />
          <Area label="Posts or lines you like (optional, one per line)" value={examples} set={setExamples} ph="Support isn't a cost centre. It's your retention team." />
          <Area
            label="Brand rules (optional) — guidelines, terminology, legal do's and don'ts"
            value={rules}
            set={setRules}
            ph={"Always write 'Acme AI', never 'Acme'.\nNo competitor names. No pricing claims."}
          />
          <Text label="Disclaimer added to every caption (optional)" value={disclaimer} set={setDisclaimer} ph="Results vary by team and setup." />
        </Section>
      )}

      {step === 3 && (
        <Section title="Look">
          <FileField label={logo ? logo.name : "Logo (optional, transparent PNG is best)"} accept="image/*" onPick={(f) => setLogo(f[0] ?? null)} />
          <FileField
            label={
              photos.length
                ? `${photos.length} photo${photos.length > 1 ? "s" : ""} selected`
                : service
                  ? "Photos (optional): team, office, work, screenshots — up to 5"
                  : "Product photos or screenshots — 1 to 5"
            }
            accept="image/*"
            multiple
            onPick={(f) => setPhotos(f.slice(0, 5))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Text label="Social handle (optional)" value={handle} set={setHandle} ph="@acmeai" />
            <Text label="Display name on posts (optional)" value={displayName} set={setDisplayName} ph="Acme AI" />
          </div>

          <div className="flex flex-col gap-2 text-xs text-muted">
            Brand colours
            <div className="flex gap-2">
              <Chip on={!exactColors} onClick={() => setExactColors(false)}>Detect from logo &amp; photos</Chip>
              <Chip on={exactColors} onClick={() => setExactColors(true)}>Use our exact colours</Chip>
            </div>
            {exactColors && (
              <div className="flex flex-col gap-2">
                <span>Primary first. The brand-colour theme uses the primary as its background.</span>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <label key={i} className="flex items-center gap-2 p-2 border border-line2 rounded-[10px] bg-field">
                      <input
                        type="color"
                        aria-label={`colour ${i + 1} picker`}
                        value={/^#[0-9a-fA-F]{6}$/.test(colors[i] ?? "") ? colors[i] : "#ffffff"}
                        onChange={(e) => setColors(Object.assign([...colors], { [i]: e.target.value.toUpperCase() }))}
                        className="w-8 h-8 border-0 bg-transparent p-0 cursor-pointer"
                      />
                      <input
                        aria-label={`colour ${i + 1}`}
                        value={colors[i] ?? ""}
                        onChange={(e) => setColors(Object.assign([...colors], { [i]: e.target.value }))}
                        placeholder={i === 0 ? "#Primary" : "#optional"}
                        className="w-24 h-8 px-2 text-sm bg-transparent text-ink outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <ChipGroup label="Post themes (each becomes one version of every text post)" options={THEMES} value={themes} toggle={(v) => toggle(themes, setThemes, v)} />

          <div className="flex flex-col gap-2 text-xs text-muted">
            Your brand font (optional, .ttf or .otf). Leave empty to use the default.
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FileField label={fontRegular ? fontRegular.name : "Regular font file"} accept=".ttf,.otf" onPick={(f) => setFontRegular(f[0] ?? null)} />
              <FileField label={fontBold ? fontBold.name : "Bold font file (optional)"} accept=".ttf,.otf" onPick={(f) => setFontBold(f[0] ?? null)} />
            </div>
          </div>
          <Text label="Monthly AI credit budget (optional)" value={budget} set={setBudget} ph="400" />
        </Section>
      )}

      {err && <div className="text-sm text-clay">{err}</div>}
      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              setErr(null);
              setStep(step - 1);
            }}
            className="h-12 px-5 rounded-[10px] border border-line2 bg-panel font-semibold cursor-pointer hover:bg-active"
          >
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="h-12 px-6 rounded-[10px] bg-forest text-white font-semibold cursor-pointer hover:brightness-110"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-12 px-6 rounded-[10px] bg-forest text-white font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Setting up…" : "Create brand"}
          </button>
        )}
        <span className="text-xs text-muted">Step {step + 1} of {STEPS.length}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 font-display text-xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`px-3 py-2 rounded-[10px] border text-sm cursor-pointer ${
        on ? "border-forest bg-forest/10 text-forest font-semibold" : "border-line2 bg-panel text-ink hover:bg-active"
      }`}
    >
      {children}
    </button>
  );
}

function ChipGroup({
  label,
  options,
  value,
  toggle,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: string[];
  toggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <Chip key={v} on={value.includes(v)} onClick={() => toggle(v)}>
            {l}
          </Chip>
        ))}
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

function Text({ label, value, set, ph }: { label: string; value: string; set: (v: string) => void; ph: string }) {
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

function Area({
  label,
  value,
  set,
  ph,
  rows = 3,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  ph: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={ph}
        rows={rows}
        className="px-3 py-2 border border-line2 rounded-[10px] text-sm bg-field text-ink resize-y"
      />
    </label>
  );
}
