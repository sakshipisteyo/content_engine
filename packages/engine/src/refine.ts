/**
 * Claude-backed copy generation for the copy stage (stage 5). Returns caption,
 * hashtags and (for video) a VO script. Banned-word enforcement lives in the pipeline.
 */
import { json, type ObjectSchema } from "./providers/anthropic";
import { interpolate } from "./text";
import { CopySchema, type Brand, type Brief, type Copy, type PromptsFile } from "./schemas";

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

export async function refineCopy(
  brand: Brand,
  brief: Brief,
  prompt: PromptsFile,
  model: string,
  copyStyle = "",
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
  };
  const text = interpolate(prompt.template, tokens);
  const raw = (await json(text, COPY_SCHEMA, {
    model,
    system: prompt.system,
    maxTokens: 700,
  })) as { caption: string; hashtags: string[]; script?: string | null };

  const copy: Copy = {
    caption: raw.caption,
    hashtags: raw.hashtags ?? [],
    ...(brief.format === "video" && raw.script ? { script: raw.script } : {}),
  };
  return CopySchema.parse(copy);
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
