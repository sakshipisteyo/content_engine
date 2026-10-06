/**
 * "What's new": recent news in the brand's field, found by a web search, turned into post
 * ideas with the brand's angle. Works for any industry: the search is built from what the
 * brand intake knows (category, offer, audience, pillars).
 *
 * Search: OpenRouter's web plugin (the existing OPENROUTER_API_KEY; ~3 cents a search).
 * Trust rules — a news post that cites a made-up story is worse than no post:
 *   - an item is kept only if its URL is one the search actually returned (annotations),
 *     so the model can't invent a story and a plausible link;
 *   - the link must open (or be a real page that blocks bots: 403/429);
 *   - it must be dated within the window.
 */
import { z } from "zod";
import type { Brand, Routes } from "./schemas";
import { loadEnv, requireEnv } from "./config";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

export const NewsItemSchema = z.object({
  headline: z.string().min(1),
  date: z.string(),
  publisher: z.string(),
  url: z.string().url(),
  summary: z.string().min(1),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export function newsReady(): boolean {
  loadEnv();
  return !!process.env.OPENROUTER_API_KEY?.trim();
}

/** What to search for: the brand's field in a few words, from the intake. */
export function newsTopic(brand: Brand): string {
  const parts = [
    brand.category,
    brand.offer,
    brand.pillars?.length ? `themes: ${brand.pillars.map((p) => p.name).join(", ")}` : "",
    brand.audience ? `relevant to ${brand.audience}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

const today = () => new Date().toISOString().slice(0, 10);

/** Comparable form of a URL: no scheme, "www.", query, fragment or trailing slash. */
export function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

/** JSON object from model text that may be wrapped in ```json fences or prose. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const raw = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}

/** Keep items that came from the search, are recent, and are well formed. */
export function filterNews(items: unknown[], searched: Set<string>, now: Date, days: number): NewsItem[] {
  const oldest = now.getTime() - (days + 2) * 86_400_000; // a little slack for time zones
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const parsed = NewsItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const item = parsed.data;
    const key = normUrl(item.url);
    if (!searched.has(key) || seen.has(key)) continue;
    const t = Date.parse(item.date);
    if (!Number.isFinite(t) || t < oldest || t > now.getTime() + 86_400_000) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Does the link open? 403/429 count: real pages often block scripts but not people. */
async function opens(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (content-engine link check)" },
    });
    // Only the status matters; close the body or the open socket keeps the process alive
    // for minutes after the work is done.
    await res.body?.cancel().catch(() => {});
    return res.ok || res.status === 403 || res.status === 429;
  } catch {
    return false;
  }
}

/** Recent news in the brand's field (verified as above), newest first. */
export async function findNews(brand: Brand, routes: Routes, opts: { days?: number; max?: number } = {}): Promise<NewsItem[]> {
  const days = opts.days ?? 14;
  const max = opts.max ?? 8;
  const prompt = [
    `Today is ${today()}. Search the web for the ${max} most notable news stories from the last ${days} days for this field:`,
    newsTopic(brand),
    "",
    "Prefer: product launches and major releases, enterprise rollouts with concrete details, research or surveys with numbers, regulation that changes how businesses work.",
    "Skip: opinion pieces, listicles, press releases with no news, anything older than the window.",
    "Use only stories you actually found in the search results, with their real URL. Do not guess URLs.",
    'Return JSON only: {"items":[{"headline":"","date":"YYYY-MM-DD","publisher":"","url":"","summary":"2 sentences of facts from the article"}]}',
  ].join("\n");

  const res = await fetch(OPENROUTER, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}` },
    body: JSON.stringify({
      model: routes.news?.model ?? routes.copy.model,
      max_tokens: 2500,
      plugins: [{ id: "web", max_results: routes.news?.max_results ?? 10 }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`news search failed: OpenRouter ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; annotations?: Array<{ url_citation?: { url?: string } }> } }>;
  };
  const msg = data.choices?.[0]?.message;
  const searched = new Set((msg?.annotations ?? []).map((a) => a.url_citation?.url).filter((u): u is string => !!u).map(normUrl));
  let items: unknown[] = [];
  try {
    items = ((extractJson(msg?.content ?? "") as { items?: unknown[] }).items) ?? [];
  } catch {
    throw new Error("the news search returned something unreadable; try again");
  }
  const kept = filterNews(items, searched, new Date(), days);
  const checked = await Promise.all(kept.map(async (i) => ((await opens(i.url)) ? i : null)));
  return checked.filter((i): i is NewsItem => !!i).sort((a, b) => b.date.localeCompare(a.date));
}
