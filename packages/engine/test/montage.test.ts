import { describe, it, expect, vi, beforeAll } from "vitest";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

// Full-mode Higgsfield calls are mocked: no network, no credits. The mocks record calls so
// the test can check what a real render would send.
const calls: { upload: string[]; animate: Record<string, unknown>[] } = { upload: [], animate: [] };
let fakeClip = "";
vi.mock("../src/providers/higgsfield", async (orig) => {
  const real = await orig<typeof import("../src/providers/higgsfield")>();
  return {
    ...real,
    uploadFile: async (_d: Buffer, type: string) => {
      calls.upload.push(type);
      return `https://cdn.example/${calls.upload.length}`;
    },
    listMotions: async () => [
      { id: "m-dolly", name: "Dolly In" },
      { id: "m-orbit", name: "Orbit Right" },
    ],
    animate: async (opts: Record<string, unknown>) => {
      calls.animate.push(opts);
      return "https://cdn.example/clip.mp4";
    },
  };
});
vi.mock("../src/media", async (orig) => {
  const real = await orig<typeof import("../src/media")>();
  return { ...real, downloadToFile: async (_url: string, dest: string) => copyFileSync(fakeClip, dest) };
});

const {
  planMontage,
  parseRange,
  runMontage,
  MontageError,
  loadBrand,
  loadRoutes,
  loadTemplate,
  loadEnv,
  ffmpeg,
  probeDuration,
  PATHS,
} = await import("../src/index");
const { pickMotion } = await import("../src/providers/higgsfield");

const work = join(tmpdir(), `montage-test-${process.pid}`);
const brand = loadBrand("banjaaran");
const routes = loadRoutes();
const base = {
  id: "t-montage",
  brand: "banjaaran",
  format: "video" as const,
  platform: "linkedin" as const,
  hook: "Set up in 2 minutes",
  angle: "Product Walkthrough (video)",
  cta: "Book a demo",
  products: [Object.keys(brand.products)[0]!],
  style_anchor: Object.keys(brand.style_anchors)[0]!,
  variants: 1,
  credit_cap: 100,
};

beforeAll(async () => {
  mkdirSync(work, { recursive: true });
  await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2255aa" } }).png().toFile(join(work, "a.png"));
  await sharp({ create: { width: 800, height: 600, channels: 3, background: "#aa5522" } }).png().toFile(join(work, "b.png"));
  fakeClip = join(work, "clip.mp4");
  await ffmpeg(["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30", "-t", "2", "-pix_fmt", "yuv420p", fakeClip]);
});

describe("planMontage", () => {
  it("parses time ranges", () => {
    expect(parseRange("0:05-0:12")).toEqual({ start: 5, end: 12 });
    expect(parseRange("1:02:03 - 1:02:10")).toEqual({ start: 3723, end: 3730 });
    expect(parseRange("12-5")).toBeNull();
    expect(parseRange("Connect your helpdesk")).toBeNull();
  });

  it("walkthrough: one step per screen, ranges cut the recording, cards around it", () => {
    const rec = join(work, "rec.mp4");
    const plan = planMontage(
      { ...base, template: "walkthrough", media: [join(work, "a.png"), rec], body: "Connect | in one click\n0:02-0:06 | Watch it work" },
      brand, "banjaaran", loadTemplate("walkthrough"), routes,
    );
    expect(plan.shots.map((s) => s.type)).toEqual(["card", "media", "media", "card"]);
    expect(plan.shots[1]).toMatchObject({ caption: "Connect — in one click", fit: "contain" });
    expect(plan.shots[2]).toMatchObject({ start: 2, end: 6, caption: "Watch it work" });
    expect(plan.estimate).toBe(0);
    // The angle defaulted to the template name, so the intro shows no subtitle.
    expect(plan.shots[0]!.subtitle).toBeUndefined();
  });

  it("walkthrough needs uploads; ranges need a recording", () => {
    expect(() => planMontage({ ...base, template: "walkthrough" }, brand, "banjaaran", loadTemplate("walkthrough"), routes)).toThrow(MontageError);
    expect(() =>
      planMontage({ ...base, media: [join(work, "a.png")], body: "0:01-0:03 | x" }, brand, "banjaaran", loadTemplate("walkthrough"), routes),
    ).toThrow(/no screen recording/);
  });

  it("product demo: one AI shot per line with its camera move, priced from routes.yaml", () => {
    const plan = planMontage(
      { ...base, media: [join(work, "a.png"), join(work, "b.png")], body: "Fast | dolly in\nSmart" },
      brand, "banjaaran", loadTemplate("product-demo"), routes,
    );
    const ai = plan.shots.filter((s) => s.type === "ai-animate");
    expect(ai.map((s) => s.move)).toEqual(["dolly in", "orbit"]);
    expect(plan.estimate).toBe(2 * routes.video.duration_seconds * routes.video.credits_per_second);
  });

  it("presenter: needs a photo and a script; chunks fit Speak's 15 s limit", () => {
    const tpl = loadTemplate("presenter");
    expect(() => planMontage({ ...base, body: "Hi." }, brand, "banjaaran", tpl, routes)).toThrow(/photo of the presenter/);
    const long = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} has exactly seven words.`).join(" ");
    const plan = planMontage({ ...base, presenter: join(work, "a.png"), body: long }, brand, "banjaaran", tpl, routes);
    const chunks = plan.shots.filter((s) => s.type === "ai-presenter");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.prompt!.split(/\s+/).length).toBeLessThanOrEqual(38);
  });

  it("matches friendly camera moves to Higgsfield presets", () => {
    const presets = [
      { id: "1", name: "Dolly In" },
      { id: "2", name: "Crash Zoom In" },
      { id: "3", name: "Orbit Left" },
    ];
    expect(pickMotion(presets, "dolly in")?.id).toBe("1");
    expect(pickMotion(presets, "orbit")?.id).toBe("3");
    expect(pickMotion(presets, "crash zoom")?.id).toBe("2");
    expect(pickMotion(presets, "fpv drone")).toBeUndefined();
  });
});

describe("runMontage", () => {
  const ledgerRows: { stage: string; credits: number; status: string }[] = [];
  const ledger = { recordStage: (r: { stage: string; credits: number; status: string }) => ledgerRows.push(r) } as never;
  const ctx = { brandKey: "banjaaran", brand, routes, ledger, runId: "test" };
  const caption = { text: "Book a demo", hashtags: ["#test"] };

  it("full mode refuses without a Higgsfield key and over the credit cap", async () => {
    const brief = { ...base, id: "t-cap", template: "product-demo", media: [join(work, "a.png")], body: "One | dolly in" };
    // Load .env first, or the engine's first loadEnv() restores a real key from the
    // developer's .env after we delete it and the "no key" check never fires.
    loadEnv();
    delete process.env.HIGGSFIELD_API_KEY;
    await expect(runMontage(ctx, brief, loadTemplate("product-demo"), caption, "full")).rejects.toThrow(/HIGGSFIELD_API_KEY/);
    process.env.HIGGSFIELD_API_KEY = "test:test";
    await expect(runMontage(ctx, { ...brief, credit_cap: 1 }, loadTemplate("product-demo"), caption, "full")).rejects.toThrow(/over the post's cap/);
  });

  it("full mode uploads, animates with the matched preset, records credits and renders all sizes", async () => {
    process.env.HIGGSFIELD_API_KEY = "test:test";
    rmSync(join(PATHS.data, "higgsfield-motions.json"), { force: true });
    const id = `t-full-${process.pid}`;
    const brief = { ...base, id, template: "product-demo", media: [join(work, "a.png")], body: "Every ticket answered | dolly in" };
    const r = await runMontage(ctx, brief, loadTemplate("product-demo"), caption, "full");
    expect(calls.upload).toEqual(["image/jpeg"]);
    expect(calls.animate[0]).toMatchObject({ motionId: "m-dolly", imageUrl: "https://cdn.example/1" });
    expect(r.spent_credits).toBe(routes.video.duration_seconds * routes.video.credits_per_second);
    expect(ledgerRows.some((x) => x.stage === "motion" && x.status === "ok" && x.credits === r.spent_credits)).toBe(true);
    const dir = join(PATHS.out, id, "v1");
    for (const tag of ["9x16", "1x1", "16x9"]) expect(existsSync(join(dir, `final_${tag}.mp4`))).toBe(true);
    // intro 3 s + one 2 s Higgsfield clip + outro 3.5 s
    expect(await probeDuration(join(dir, "final_9x16.mp4"))).toBeCloseTo(8.5, 0);
    expect(JSON.parse(readFileSync(join(PATHS.out, id, "montage.json"), "utf8")).mode).toBe("full");
    rmSync(join(PATHS.out, id), { recursive: true, force: true });
    rmSync(join(PATHS.data, "higgsfield-motions.json"), { force: true });
    delete process.env.HIGGSFIELD_API_KEY;
  }, 120_000);
});
