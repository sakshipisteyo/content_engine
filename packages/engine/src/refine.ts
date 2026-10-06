/**
 * Claude-backed copy generation for the copy stage (stage 5). Returns caption,
 * hashtags and (for video) a VO script. Banned-word enforcement lives in the pipeline.
 */
import { json, type ObjectSchema } from "./providers/openrouter";
import { interpolate } from "./text";
import { CopySchema, type Brand, type Brief, type Copy, type PromptsFile, type Template } from "./schemas";

const COPY_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    script: { type: ["string", "null"] },
  },
  required: ["caption", "hashtags"],
  additionalProperties: false,
};

const SHORT_RULE =
  "Write: a caption (<= 300 characters), 5-8 hashtags, and — only for video — a spoken " +
  "voiceover script of 2-3 sentences (<= 55 words) that lands the hook and the CTA.";

const LONG_RULE =
  "Write a full LinkedIn post as the caption, 110-200 words: a first line that stops the scroll " +
  "(a tension, a surprising fact or a question — no greeting, no emoji), short paragraphs of 1-2 " +
  "sentences separated by blank lines, the point in plain words, one concrete example (a " +
  "hypothetical clearly framed as one unless the facts above give a real one), and a closing " +
  "question that invites comments, then the CTA. Hashtags: 2-4. Script: null unless video. " +
  "Never present an example as the brand's own experience (\"we see\", \"our clients\", \"a client of ours\") " +
  "and never use a number, percentage or amount that is not in the facts above.";

/** Numbers in the caption ("50%", "3x", "$2M", "1,161") that none of the facts contain. */
export function unsupportedNumbers(caption: string, facts: (string | undefined)[]): string[] {
  const known = facts.filter(Boolean).join(" ").replace(/,/g, "");
  const found = caption.match(/\$?\d[\d,]*(?:\.\d+)?\s?(?:%|x\b|k\b|m\b|bn\b|percent\b)?/gi) ?? [];
  return [...new Set(found.map((n) => n.trim()))].filter((n) => {
    const digits = n.replace(/[^\d.]/g, "").replace(/\.$/, "");
    // Years ("2026") are fine; anything else must appear in the facts.
    return digits.length > 0 && !known.includes(digits) && !/^20\d\d$/.test(digits);
  });
}

export async function refineCopy(
  brand: Brand,
  brief: Brief,
  prompt: PromptsFile,
  model: string,
  copyStyle = "",
  // LinkedIn rewards a real post (hook line, short paragraphs, a question), not a one-liner.
  long = brief.platform === "linkedin",
): Promise<Copy> {
  const productNames = brief.products
    .map((k) => brand.products[k]?.name ?? k)
    .join(" and ");
  const tokens: Record<string, string> = {
    brand_name: brand.name,
    category: brand.category,
    audience: brand.audience,
    tone: brand.tone.join(", "),
    platform: brief.platform,
    product_name: productNames,
    hook: brief.hook,
    angle: brief.angle,
    cta: brief.cta,
    banned_words: brand.banned_words.join(", "),
    template_copy_style: copyStyle,
    brand_context: brandContext(brand) || "none",
    post_content: brief.body?.trim()
      ? `The image already shows this (expand on it, don't contradict or just repeat it):\n${brief.body.trim()}`
      : "",
    source_note: brief.source
      ? `This post is the brand's take on a news story: "${brief.source.title}"` +
        `${brief.source.publisher ? ` (${brief.source.publisher}` : " ("}${brief.source.date ? `, ${brief.source.date}` : ""}).` +
        ` State only facts from that story, name the publisher, and end the caption with the link on its own line: ${brief.source.url}`
      : "",
    length_rule: long ? LONG_RULE : SHORT_RULE,
  };
  const text = interpolate(prompt.template, tokens);
  const generate = (extra = "") =>
    json(text + extra, COPY_SCHEMA, { model, system: prompt.system, maxTokens: long ? 1400 : 700 }) as Promise<{
      caption: string;
      hashtags: string[];
      script?: string | null;
    }>;
  let raw = await generate();
  // Invented numbers read as claims ("50% faster"): rewrite once without them.
  const invented = unsupportedNumbers(raw.caption, [brief.hook, brief.body, brief.cta, brief.source?.title, brief.source?.date, brief.source?.url, ...(brand.proof_points ?? [])]);
  if (invented.length) {
    raw = await generate(
      `\nYour previous caption used numbers that are not in the facts (${invented.join(", ")}). Rewrite it without them.`,
    );
  }

  const copy: Copy = {
    // *stars* mark emphasis on the image only; in a caption they'd show literally.
    caption: raw.caption.replace(/\*([^*\n]+)\*/g, "$1"),
    // Models sometimes drop the "#"; the board and the platforms need it.
    hashtags: (raw.hashtags ?? []).map((t) => t.trim().replace(/^#*/, "#")).filter((t) => t.length > 1),
    ...(brief.format === "video" && raw.script ? { script: raw.script } : {}),
  };
  return CopySchema.parse(copy);
}

/**
 * What the brand intake adds to copy prompts: offer, proof, pains, goals, channels,
 * pillars, rules, examples. Empty string for brands set up before the intake existed.
 */
export function brandContext(brand: Brand): string {
  const list = (xs?: string[]) => (xs?.length ? xs.join("; ") : "");
  const lines = [
    brand.business_type && `Business type: ${brand.business_type}.`,
    brand.offer && `What they sell: ${brand.offer}.`,
    brand.website && `Website: ${brand.website}.`,
    list(brand.proof_points) && `Proof points (the only facts and numbers you may state): ${list(brand.proof_points)}.`,
    list(brand.pains) && `Audience pains: ${list(brand.pains)}.`,
    list(brand.goals) && `Goals: ${list(brand.goals)}.`,
    list(brand.channels) && `Posts on: ${list(brand.channels)}.`,
    brand.pillars?.length &&
      `Content pillars: ${brand.pillars.map((p) => (p.description ? `${p.name} (${p.description})` : p.name)).join("; ")}.`,
    list(brand.examples) && `Examples the brand likes (match the style, never copy): ${list(brand.examples)}.`,
    brand.brand_rules && `Brand rules (always follow): ${brand.brand_rules}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** True if any banned word appears (case-insensitive, word-ish) in the copy. */
export function hasBannedWord(copy: Copy, banned: string[]): string | null {
  const hay = `${copy.caption} ${copy.hashtags.join(" ")} ${copy.script ?? ""}`.toLowerCase();
  for (const w of banned) {
    if (!w) continue;
    if (hay.includes(w.toLowerCase())) return w;
  }
  return null;
}

const BODY_SCHEMA: ObjectSchema = {
  type: "object",
  properties: { body: { type: "string" } },
  required: ["body"],
  additionalProperties: false,
};

/**
 * Draft the outline for an outline-driven typographic template (carousel, tips, myth vs
 * fact) from the brief's topic, following the template's draft_instructions format.
 */
export async function draftBody(
  brand: Brand,
  brief: Brief,
  template: Template,
  model: string,
): Promise<string> {
  const text = [
    `Brand: ${brand.name} — ${brand.category}. Audience: ${brand.audience}. Tone: ${brand.tone.join(", ")}.`,
    `Platform: ${brief.platform}. Topic / title: "${brief.hook}". Angle: ${brief.angle}.`,
    `Banned words (never use): ${brand.banned_words.join(", ") || "none"}.`,
    brandContext(brand),
    `Only state facts you are confident are true; no invented statistics, names or quotes.`,
    template.draft_instructions ?? "",
    `Return JSON: { "body": string } — the outline text only, in exactly that format.`,
  ].join("\n");
  const raw = (await json(text, BODY_SCHEMA, { model, maxTokens: 1200 })) as { body?: string };
  const body = raw.body?.trim();
  if (!body) throw new Error("copy model returned an empty outline");
  return body;
}
