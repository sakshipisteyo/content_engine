/**
 * OpenRouter provider. Drop-in replacement for the Anthropic provider.
 * Uses OpenRouter's OpenAI-compatible API with function calling for
 * guaranteed structured JSON output. No extra SDK dependency — pure fetch.
 */
import { requireEnv } from "../config";
import { imageToBase64 } from "../media";

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface JsonOptions {
  model: string;
  system?: string;
  maxTokens?: number;
}

export type ObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

const TOOL_NAME = "emit_result";

interface OpenRouterMessage {
  role: "system" | "user";
  content: string | Array<{ type: string; [k: string]: unknown }>;
}

async function callForcedTool(
  content: Array<{ type: string; [k: string]: unknown }>,
  schema: ObjectSchema,
  opts: JsonOptions,
): Promise<unknown> {
  const messages: OpenRouterMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content });

  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    messages,
    tools: [
      {
        type: "function" as const,
        function: {
          name: TOOL_NAME,
          description: "Return the result as structured JSON matching the schema.",
          parameters: schema,
        },
      },
    ],
    tool_choice: { type: "function" as const, function: { name: TOOL_NAME } },
  };

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> };
    }>;
  };
  const choice = data.choices?.[0];
  const call = choice?.message?.tool_calls?.[0];
  if (call?.function?.name === TOOL_NAME) {
    return JSON.parse(call.function.arguments);
  }
  throw new Error("OpenRouter returned no tool_call — raw: " + JSON.stringify(data).slice(0, 500));
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
  const content: Array<{ type: string; [k: string]: unknown }> = [
    ...imagePaths.map((p) => {
      const { media_type, data } = imageToBase64(p);
      return {
        type: "image_url",
        image_url: { url: `data:${media_type};base64,${data}` },
      };
    }),
    { type: "text", text: rubric },
  ];
  return callForcedTool(content, schema, opts);
}
