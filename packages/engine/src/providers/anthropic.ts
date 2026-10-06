/**
 * Anthropic provider (official SDK). The ONLY place @anthropic-ai/sdk is imported.
 * json()   -> structured outputs (output_config.format json_schema), parsed + returned.
 * vision() -> same, with image content blocks first.
 * Current Claude models reject forced tool_choice, so structured outputs replace the old
 * forced-tool trick. Server-side refusal fallback ("default") is on: a policy decline is
 * re-run on a fallback model inside the same call; a refusal of the whole chain throws.
 */
import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "../config";
import { imageToBase64 } from "../media";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

export interface JsonOptions {
  model: string;
  system?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

/** JSON Schema of the expected object (additionalProperties: false, all keys required). */
export type ObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export class RefusalError extends Error {}

async function structured(content: Anthropic.Beta.BetaContentBlockParam[], schema: ObjectSchema, opts: JsonOptions): Promise<unknown> {
  const res = await getClient().beta.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...(opts.system ? { system: opts.system } : {}),
    output_config: {
      ...(opts.effort ? { effort: opts.effort } : {}),
      format: { type: "json_schema", schema: { additionalProperties: false, ...schema } },
    },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") {
    throw new RefusalError(`Claude declined this request${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`);
  }
  if (res.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens); try shorter notes");
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Claude returned text that isn't valid JSON");
  }
}

/** Structured completion from a text prompt. */
export function json(prompt: string, schema: ObjectSchema, opts: JsonOptions): Promise<unknown> {
  return structured([{ type: "text", text: prompt }], schema, opts);
}

/** Structured completion from images + a rubric prompt (vision scoring). */
export function vision(imagePaths: string[], rubric: string, schema: ObjectSchema, opts: JsonOptions): Promise<unknown> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...imagePaths.map((p): Anthropic.Beta.BetaContentBlockParam => {
      const { media_type, data } = imageToBase64(p);
      return { type: "image", source: { type: "base64", media_type, data } };
    }),
    { type: "text", text: rubric },
  ];
  return structured(content, schema, opts);
}
