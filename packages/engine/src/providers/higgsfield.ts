/**
 * Higgsfield provider. The ONLY place @higgsfield/client is imported.
 * Uses subscribe() for the initial POST, then polls with native fetch —
 * the SDK's built-in polling checks `request_id` but the API returns `id`.
 */
import { higgsfield, config as hfConfig } from "@higgsfield/client/v2";
import { requireEnv } from "../config";

let configured = false;
let credentials = "";
function ensureConfigured(): void {
  if (configured) return;
  const key = requireEnv("HIGGSFIELD_API_KEY");
  if (key.includes(":")) {
    credentials = key;
    hfConfig({ credentials: key });
  } else {
    const secret = requireEnv("HIGGSFIELD_SECRET");
    credentials = `${key}:${secret}`;
    hfConfig({ credentials });
  }
  configured = true;
}

export interface GenerateResult {
  urls: string[];
  status: string;
}

interface JobSetResponse {
  id?: string;
  request_id?: string;
  status?: string;
  images?: Array<{ url?: string }>;
  video?: { url?: string };
  jobs?: Array<{
    status?: string;
    results?: { raw?: { url?: string }; min?: { url?: string } };
  }>;
}

function extractUrls(r: JobSetResponse): string[] {
  const urls: string[] = [];
  for (const img of r.images ?? []) if (img.url) urls.push(img.url);
  if (r.video?.url) urls.push(r.video.url);
  for (const job of r.jobs ?? []) {
    const u = job.results?.raw?.url ?? job.results?.min?.url;
    if (u) urls.push(u);
  }
  return urls;
}

function isTerminal(r: JobSetResponse): boolean {
  if (r.status === "completed" || r.status === "failed" || r.status === "nsfw") return true;
  const jobs = r.jobs ?? [];
  if (jobs.length === 0) return false;
  return jobs.every((j) => j.status === "completed" || j.status === "failed");
}

function resolveStatus(r: JobSetResponse): string {
  if (r.status && r.status !== "queued" && r.status !== "in_progress") return r.status;
  const jobs = r.jobs ?? [];
  if (jobs.length > 0 && jobs.every((j) => j.status === "completed")) return "completed";
  if (jobs.some((j) => j.status === "failed")) return "failed";
  return r.status ?? "unknown";
}

const BASE_URL = "https://api.higgsfield.ai";
const POLL_INTERVAL = 5000;
const MAX_POLL_TIME = 300_000;

async function pollUntilDone(requestId: string): Promise<JobSetResponse> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const resp = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${credentials}` },
    });
    if (!resp.ok) throw new Error(`Poll failed: ${resp.status} ${resp.statusText}`);
    const data = (await resp.json()) as JobSetResponse;
    if (isTerminal(data)) return data;
  }
  throw new Error(`Higgsfield polling timed out after ${MAX_POLL_TIME / 1000}s`);
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
  const initial = (await higgsfield.subscribe(endpoint, {
    input: { params: input },
    withPolling: false,
  })) as unknown as JobSetResponse;

  const requestId = initial.request_id ?? initial.id;
  let final = initial;
  if (requestId && !isTerminal(initial)) {
    final = await pollUntilDone(requestId);
  }

  const status = resolveStatus(final);
  const urls = extractUrls(final);
  if (status !== "completed" || urls.length === 0) {
    throw new Error(
      `Higgsfield ${endpoint} returned status=${status} with ${urls.length} url(s)`,
    );
  }
  return { urls, status };
}
