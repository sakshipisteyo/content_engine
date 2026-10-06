import { describe, it, expect, vi, beforeEach } from "vitest";

// Claude is mocked: each test queues the JSON the model "returns" and inspects the prompt.
const replies: unknown[] = [];
const prompts: string[] = [];
const opts: Record<string, unknown>[] = [];
vi.mock("../src/providers/anthropic", () => ({
  json: async (prompt: string, _schema: unknown, o: Record<string, unknown>) => {
    prompts.push(prompt);
    opts.push(o);
    if (!replies.length) throw new Error("no reply queued");
    return replies.shift();
  },
}));

const { draftPost, suggestIdeas, aiReady, loadBrand, loadRoutes } = await import("../src/index");
const brand = loadBrand("brewcraft");
const routes = loadRoutes();
const good = {
  template: "stat-card",
  hook: "The most-used agent was… *vanilla*.",
  body: "1,161 | runs in the first weeks\nAdoption beats complexity.",
  attribution: "",
  scene: "Nurses at computers in a bright hospital office",
  cta: "Book a call",
  angle: "Customer wins",
  why: "A real number plus a surprise lands on LinkedIn.",
};

beforeEach(() => {
  replies.length = 0;
  prompts.length = 0;
  opts.length = 0;
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("AI writer", () => {
  it("drafts from notes with the routes.yaml model and the brand context in the prompt", async () => {
    replies.push(good);
    const d = await draftPost(brand, "brewcraft", routes, { notes: "1,161 runs in the first weeks; the plain Q&A agent won." });
    expect(d).toMatchObject({ template: "stat-card", cta: "Book a call" });
    expect(opts[0]).toMatchObject({ model: routes.ideate!.model, effort: routes.ideate!.effort });
    expect(prompts[0]).toContain("BrewCraft");
    expect(prompts[0]).toContain("1,161 runs in the first weeks");
    expect(prompts[0]).toContain("key: stat-card");
  });

  it("retries once when the body doesn't match the post format, quoting the problem", async () => {
    replies.push({ ...good, body: "about a thousand runs" }, good);
    const d = await draftPost(brand, "brewcraft", routes, { notes: "x" });
    expect(d.body).toBe(good.body);
    expect(prompts[1]).toContain("previous draft had a problem");
  });

  it("gives up after two bad drafts", async () => {
    replies.push({ ...good, body: "no label" }, { ...good, body: "still no label" });
    await expect(draftPost(brand, "brewcraft", routes, { notes: "x" })).rejects.toThrow(/didn't match/);
  });

  it("keeps a fixed post type and offers only that one", async () => {
    replies.push({ ...good, template: "quote-card", hook: "Good coffee is a decision.", body: "" });
    const d = await draftPost(brand, "brewcraft", routes, { templateKey: "quote-card" });
    expect(d.template).toBe("quote-card");
    expect(prompts[0]).toContain("key: quote-card");
    expect(prompts[0]).not.toContain("key: stat-card");
    expect(prompts[0]).toContain("No notes");
  });

  it("suggests ideas and drops unknown post types", async () => {
    replies.push({
      ideas: [
        { title: "Roast date myth", template: "myth-vs-fact", notes: "Freshness beats origin.", why: "Common belief." },
        { title: "Bad", template: "no-such-type", notes: "x", why: "y" },
      ],
    });
    const ideas = await suggestIdeas(brand, routes, 6);
    expect(ideas.map((i) => i.template)).toEqual(["myth-vs-fact"]);
  });

  it("explains which key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const savedOR = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    expect(aiReady()).toBe(false);
    await expect(draftPost(brand, "brewcraft", routes, { notes: "x" })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    if (savedOR) process.env.OPENROUTER_API_KEY = savedOR;
  });
});
