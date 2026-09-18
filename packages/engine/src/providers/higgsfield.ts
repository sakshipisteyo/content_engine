/**
 * Higgsfield provider. The ONLY place @higgsfield/client is imported.
 * Thin wrapper over the v2 `subscribe(endpoint, { input, withPolling })` call.
 * Endpoints and model sub-ids come from routes.yaml — never hard-coded here.
 * The result shape differs between the typed V2Response and the README's JobSet,
 * so normalize() handles both and returns plain media URLs.
 */
import { higgsfield, config as hfConfig } from "@higgsfield/client/v2";
import { requireEnv } from "../config";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  const key = requireEnv("HIGGSFIELD_API_KEY");
  const secret = requireEnv("HIGGSFIELD_SECRET");
  hfConfig({ credentials: `${key}:${secret}` });
  configured = true;
}

export interface GenerateResult {
  urls: string[];
  status: string;
}

/** Extract media URLs from either the V2Response or JobSet result shape. */
function normalize(res: unknown): GenerateResult {
  const r = res as {
    status?: string;
    isCompleted?: boolean;
    isNsfw?: boolean;
    isFailed?: boolean;
    images?: Array<{ url?: string }>;
    video?: { url?: string };
    jobs?: Array<{ results?: { raw?: { url?: string }; min?: { url?: string } } }>;
  };
  const urls: string[] = [];
  for (const img of r.images ?? []) if (img.url) urls.push(img.url);
  if (r.video?.url) urls.push(r.video.url);
  for (const job of r.jobs ?? []) {
    const u = job.results?.raw?.url ?? job.results?.min?.url;
    if (u) urls.push(u);
  }
  const status =
    r.status ??
    (r.isCompleted
      ? "completed"
      : r.isFailed
        ? "failed"
        : r.isNsfw
          ? "nsfw"
          : "unknown");
  return { urls, status };
}

/**
 * Call an endpoint and poll to completion. `input` is the endpoint-specific body
 * (built by the pipeline from routes.yaml + the PromptPlan shot).
 */
export async function generate(
  endpoint: string,
  input: Record<string, unknown>,
): Promise<GenerateResult> {
  ensureConfigured();
  const res = await higgsfield.subscribe(endpoint, { input, withPolling: true });
  const out = normalize(res);
  if (out.status !== "completed" || out.urls.length === 0) {
    throw new Error(
      `Higgsfield ${endpoint} returned status=${out.status} with ${out.urls.length} url(s)`,
    );
  }
  return out;
}
