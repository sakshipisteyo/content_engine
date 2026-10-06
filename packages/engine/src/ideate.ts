/**
 * AI writer: Claude does the thinking. From rough notes (a story, numbers, a link's text)
 * plus everything the brand intake knows, it picks the post type and writes every field —
 * headline with *emphasis*, outline / subline / stat line / steps / scenes / script, the
 * photo scene to generate, CTA and pillar. With no notes it proposes post ideas from the
 * brand's pillars, offer and proof points.
 *
 * Claude via the official SDK (routes.yaml `ideate`, ANTHROPIC_API_KEY); without that key
 * it falls back to OpenRouter with `copy.model`. Output is structured JSON, checked
 * against the chosen template's format and retried once with the parse error.
 */
import { z } from "zod";
import type { Brand, Routes, Template } from "./schemas";
import { loadEnv } from "./config";
import { listTemplates } from "./load";
import { brandContext } from "./refine";
import { BODY_LAYOUTS, validateLayoutInput } from "./layouts";
import { planMontage } from "./montage";

export function aiReady(): boolean {
  loadEnv();
  return !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim());
}

type Schema = { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };

async function ask(prompt: string, schema: Schema, routes: Routes, system: string): Promise<unknown> {
  loadEnv();
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    const anthropic = await import("./providers/anthropic");
    return anthropic.json(prompt, schema, {
      model: routes.ideate?.model ?? "claude-opus-5-5",
      effort: routes.ideate?.effort ?? "medium",
      system,
    });
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    const openrouter = await import("./providers/openrouter");
    return openrouter.json(prompt, schema, { model: routes.copy.model, system, maxTokens: 4000 });
  }
  throw new Error("add ANTHROPIC_API_KEY (or OPENROUTER_API_KEY) to .env so the AI writer can draft posts");
}

/** Templates the writer may choose: everything except AI-photo types without a format. */
export function writableTemplates(): Template[] {
  return listTemplates().filter((t) => t.renderer === "typographic" || t.renderer === "montage");
}

function brandBrief(brand: Brand): string {
  const ctx = brandContext(brand);
  return [
    `Brand: ${brand.name} — ${brand.category}. Audience: ${brand.audience}. Tone: ${brand.tone.join(", ")}.`,
    brand.banned_words.length ? `Never use: ${brand.banned_words.join(", ")}.` : "",
    ctx,
  ]
    .filter(Boolean)
    .join("\n");
}

function templateMenu(templates: Template[]): string {
  return templates
    .map((t) =>
      [
        `- key: ${t.key} — ${t.name}: ${t.description}`,
        `  hook = ${t.hook_label ?? "the main line"}`,
        t.asks_body ? `  body = ${t.body_label ?? "outline"}. Example body:\n${(t.body_placeholder ?? "").trim().split("\n").map((l) => `    ${l}`).join("\n")}` : "  body = empty",
        t.asks_photo ? "  scene = describe a realistic photo for the background (people, place, action; no text in it)" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

const SYSTEM = `You are the creative director and copywriter of a social content studio for B2B brands.
You think about what will make the target audience stop scrolling, then write tight, specific copy in the brand's voice.
Rules: never invent facts, numbers, customer names or quotes — use only what the notes and the brand's proof points state; if there is no real number, don't pick a stat post.
Write in plain language, no hype words, no emojis, no hashtags in the headline.`;

export const DraftSchema = z.object({
  template: z.string().min(1),
  hook: z.string().min(1),
  body: z.string(),
  attribution: z.string(),
  scene: z.string(),
  cta: z.string(),
  angle: z.string(),
  why: z.string(),
});
export type Draft = z.infer<typeof DraftSchema>;

const DRAFT_JSON: Schema = {
  type: "object",
  properties: {
    template: { type: "string", description: "key of the chosen post type" },
    hook: { type: "string", description: "the main line; wrap 1-2 key words in *stars* for photo-headline / stat-card" },
    body: { type: "string", description: "exactly in the chosen template's body format; empty if it has none" },
    attribution: { type: "string", description: "credit line for a quote card when quoting someone; else empty" },
    scene: { type: "string", description: "photo description for photo post types; else empty" },
    cta: { type: "string", description: "short call to action" },
    angle: { type: "string", description: "the content pillar or angle this post serves" },
    why: { type: "string", description: "one sentence on why this format and hook will work" },
  },
  required: ["template", "hook", "body", "attribution", "scene", "cta", "angle", "why"],
  additionalProperties: false,
};

/** Check a draft against its template's format; returns the problem or null. */
function problemWith(d: Draft, t: Template | undefined, brand: Brand, brandKey: string, routes: Routes): string | null {
  if (!t) return `unknown template "${d.template}"`;
  try {
    if (t.renderer === "typographic" && t.layout && BODY_LAYOUTS.includes(t.layout)) validateLayoutInput(t.layout, { body: d.body });
    if (t.renderer === "montage" && (t.video_kind === "cinematic" || t.video_kind === "presenter")) {
      planMontage(
        {
          id: "draft", brand: brandKey, format: "video", platform: t.platform, hook: d.hook, angle: d.angle || t.name, cta: d.cta || "Learn more",
          products: [Object.keys(brand.products)[0] ?? "x"], style_anchor: "x", variants: 1, credit_cap: 0, body: d.body,
          ...(t.video_kind === "presenter" ? { presenter: "draft.jpg" } : {}),
        },
        brand, brandKey, t, routes,
      );
    }
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

/**
 * Draft one post. `notes` may be empty (the writer picks a topic from the pillars);
 * `templateKey` fixes the post type, otherwise the writer chooses.
 */
export async function draftPost(
  brand: Brand,
  brandKey: string,
  routes: Routes,
  input: { notes?: string; templateKey?: string },
): Promise<Draft> {
  const all = writableTemplates();
  const fixed = input.templateKey ? all.find((t) => t.key === input.templateKey) : undefined;
  if (input.templateKey && !fixed) throw new Error(`the AI writer can't draft "${input.templateKey}" posts`);
  const menu = fixed ? [fixed] : all;
  const base = [
    brandBrief(brand),
    "",
    input.notes?.trim()
      ? `What the brand wants to post about (their notes — the only source of facts besides the proof points):\n"""\n${input.notes.trim()}\n"""`
      : "No notes: choose one strong topic from the brand's pillars, pains and proof points.",
    "",
    fixed ? `Write a "${fixed.key}" post.` : "Choose the post type that fits best:",
    templateMenu(menu),
    "",
    "Return the draft as JSON.",
  ].join("\n");

  let prompt = base;
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = DraftSchema.parse(await ask(prompt, DRAFT_JSON, routes, SYSTEM));
    if (fixed) draft.template = fixed.key;
    const problem = problemWith(draft, all.find((t) => t.key === draft.template), brand, brandKey, routes);
    if (!problem) return draft;
    prompt = `${base}\n\nYour previous draft had a problem: ${problem}. Fix it and return the full draft again.`;
  }
  throw new Error("the AI draft didn't match the post format twice; try again or edit it by hand");
}

export const IdeaSchema = z.object({
  title: z.string().min(1),
  template: z.string().min(1),
  notes: z.string().min(1),
  why: z.string(),
});
export type Idea = z.infer<typeof IdeaSchema>;

const IDEAS_JSON: Schema = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "the post idea in a few words" },
          template: { type: "string", description: "best post type key" },
          notes: { type: "string", description: "2-4 sentences of notes the writer can draft from, using only real facts from the brand" },
          why: { type: "string", description: "why this will land with the audience" },
        },
        required: ["title", "template", "notes", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
};

/** Post ideas spread across the brand's pillars and formats. */
export async function suggestIdeas(brand: Brand, routes: Routes, count = 6): Promise<Idea[]> {
  const templates = writableTemplates();
  const prompt = [
    brandBrief(brand),
    "",
    `Suggest ${count} post ideas for the next two weeks: spread them across the pillars and across formats (text, photo, video), mix proof, opinion and practical value.`,
    "Post types:",
    templates.map((t) => `- ${t.key}: ${t.name} — ${t.description}`).join("\n"),
  ].join("\n");
  const raw = (await ask(prompt, IDEAS_JSON, routes, SYSTEM)) as { ideas?: unknown[] };
  const keys = new Set(templates.map((t) => t.key));
  return z
    .array(IdeaSchema)
    .parse(raw.ideas ?? [])
    .filter((i) => keys.has(i.template))
    .slice(0, count);
}
