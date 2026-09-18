/**
 * Anthropic provider. The ONLY place @anthropic-ai/sdk is imported.
 * json()  -> forced tool_use for guaranteed structured output (Claude has no
 *            OpenAI-style JSON mode; a single forced tool is the robust equivalent).
 * vision() -> same, with image content blocks prepended.
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
}

/** JSON Schema for the single forced tool (object schema). */
export type ObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

const TOOL_NAME = "emit_result";

async function callForcedTool(
  content: Anthropic.ContentBlockParam[],
  schema: ObjectSchema,
  opts: JsonOptions,
): Promise<unknown> {
  const res = await getClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    ...(opts.system ? { system: opts.system } : {}),
    tools: [
      {
        name: TOOL_NAME,
        description: "Return the result as structured JSON matching the schema.",
        input_schema: schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content }],
  });
  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) return block.input;
  }
  throw new Error("Anthropic returned no tool_use block");
}

/** Structured completion from a text prompt. */
export function json(
  prompt: string,
  schema: ObjectSchema,
  opts: JsonOptions,
): Promise<unknown> {
  return callForcedTool([{ type: "text", text: prompt }], schema, opts);
}

/** Structured completion from images + a rubric prompt (vision scoring). */
export function vision(
  imagePaths: string[],
  rubric: string,
  schema: ObjectSchema,
  opts: JsonOptions,
): Promise<unknown> {
  const content: Anthropic.ContentBlockParam[] = [
    ...imagePaths.map((p): Anthropic.ContentBlockParam => {
      const { media_type, data } = imageToBase64(p);
      return { type: "image", source: { type: "base64", media_type, data } };
    }),
    { type: "text", text: rubric },
  ];
  return callForcedTool(content, schema, opts);
}
