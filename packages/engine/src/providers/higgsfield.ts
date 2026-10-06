/**
 * Higgsfield provider. The ONLY place @higgsfield/client is imported.
 * Uses subscribe() for the initial POST, then polls with native fetch —
 * the SDK's built-in polling checks `request_id` but the API returns `id`.
 */
import { higgsfield, config as hfConfig } from "@higgsfield/client/v2";
import { HiggsfieldClient } from "@higgsfield/client";
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

/* ------------------------------------------------------------- video helpers */
// Upload and the motion list live on the SDK's v1 client (the v2 client has no upload).

let v1: HiggsfieldClient | null = null;
function v1Client(): HiggsfieldClient {
  if (v1) return v1;
  ensureConfigured();
  const [apiKey, apiSecret] = credentials.split(":");
  v1 = new HiggsfieldClient({ apiKey, apiSecret });
  return v1;
}

/** Upload bytes to the Higgsfield CDN; returns the public URL DoP / Speak can read. */
export async function uploadFile(data: Buffer, contentType: string): Promise<string> {
  return v1Client().upload(data, contentType);
}

export interface MotionPreset {
  id: string;
  name: string;
  description?: string;
}

/** Camera-motion presets available to DoP on this account (live list). */
export async function listMotions(): Promise<MotionPreset[]> {
  const list = await v1Client().getMotions();
  return list.map((m) => ({ id: m.id, name: m.name, ...(m.description ? { description: m.description } : {}) }));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Pick the preset whose name best matches a friendly name ("dolly in", "orbit", "crash
 * zoom"): exact, then contains, then all words present. Undefined = describe the move in
 * the prompt instead.
 */
export function pickMotion(motions: MotionPreset[], wanted: string): MotionPreset | undefined {
  const w = norm(wanted);
  if (!w) return undefined;
  return (
    motions.find((m) => norm(m.name) === w) ??
    motions.find((m) => norm(m.name).includes(w)) ??
    motions.find((m) => w.split(" ").every((part) => norm(m.name).includes(part)))
  );
}

/** Image-to-video (DoP): animate a public image with a prompt and optional motion preset. */
export async function animate(opts: {
  endpoint: string;
  model: string;
  imageUrl: string;
  prompt: string;
  motionId?: string;
  strength?: number;
}): Promise<string> {
  const res = await generate(opts.endpoint, {
    model: opts.model,
    prompt: opts.prompt,
    input_images: [{ type: "image_url", image_url: opts.imageUrl }],
    ...(opts.motionId ? { motions: [{ id: opts.motionId, strength: opts.strength ?? 0.8 }] } : {}),
  });
  return res.urls[0]!;
}

/** Talking presenter (Speak v2): a person image + a WAV voice track -> lip-synced video. */
export async function presenter(opts: {
  endpoint: string;
  imageUrl: string;
  audioUrl: string;
  prompt: string;
  quality: "mid" | "high";
  duration: 5 | 10 | 15;
}): Promise<string> {
  const res = await generate(opts.endpoint, {
    input_image: { type: "image_url", image_url: opts.imageUrl },
    input_audio: { type: "audio_url", audio_url: opts.audioUrl },
    prompt: opts.prompt,
    quality: opts.quality,
    duration: opts.duration,
  });
  return res.urls[0]!;
}
