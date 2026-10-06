import { describe, it, expect } from "vitest";
import { BrandSchema, extractJson, filterNews, normUrl, newsTopic, scenePrompt, unsupportedNumbers } from "../src/index";

const brand = BrandSchema.parse({
  name: "Acme Advisory",
  category: "AI strategy consulting",
  audience: "operations leaders",
  tone: ["calm"],
  palette: ["#2E333D", "#FF5758", "#004C74"],
  logo: "assets/logo.png",
  products: { svc: { name: "AI services", price_inr: 0 } },
  style_anchors: { people: { description: "professionals collaborating in a bright office" } },
  banned_visuals: ["robots", "glowing AI brains"],
  voice_id: "none",
  offer: "helps teams adopt AI",
  pillars: [{ name: "Expert tips" }, { name: "Point of view" }],
});

describe("news search trust rules", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const searched = new Set(["example.com/real-story", "news.site/another"].map(normUrl));
  const item = (url: string, date: string) => ({ headline: "H", date, publisher: "P", url, summary: "S." });

  it("keeps only stories the search returned, inside the window, once", () => {
    const kept = filterNews(
      [
        item("https://www.example.com/real-story/", "2026-10-05"), // search result (www + slash normalised)
        item("https://openai.com/index/invented/", "2026-10-06"), // not in the search results: dropped
        item("https://news.site/another?utm=x", "2026-08-01"), // too old: dropped
        item("https://example.com/real-story", "2026-10-05"), // duplicate: dropped
        { headline: "no url" }, // malformed: dropped
      ],
      searched,
      now,
      14,
    );
    expect(kept.map((k) => k.url)).toEqual(["https://www.example.com/real-story/"]);
  });

  it("reads JSON from fenced or chatty model output", () => {
    expect(extractJson('Here you go:\n```json\n{"items":[1]}\n```')).toEqual({ items: [1] });
    expect(extractJson('Sure. {"items":[]} hope that helps')).toEqual({ items: [] });
  });

  it("searches the brand's own field", () => {
    const t = newsTopic(brand);
    expect(t).toContain("AI strategy consulting");
    expect(t).toContain("Expert tips");
    expect(t).toContain("operations leaders");
  });
});

describe("AI background prompt", () => {
  it("carries the brand's look, colours and banned visuals, never text or collage", () => {
    const p = scenePrompt(brand, "A team reviewing a plan together.");
    expect(p).toContain("professionals collaborating in a bright office");
    expect(p).toContain("#2E333D");
    expect(p).toContain("robots");
    expect(p).toMatch(/collage/);
    expect(p).toMatch(/any text or lettering/);
  });
});

describe("caption number guard", () => {
  it("flags numbers that aren't in the facts, allows ones that are, and years", () => {
    const caption = "We see reports 50% faster and 3x output. Hackett found 75% better results across 1,161 runs in 2026.";
    expect(unsupportedNumbers(caption, ["Hackett: 75% better performance", "1161 runs"])).toEqual(["50%", "3x"]);
    expect(unsupportedNumbers("Nothing to check in 2026.", [])).toEqual([]);
  });
});
