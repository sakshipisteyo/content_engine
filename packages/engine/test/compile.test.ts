import { describe, it, expect } from "vitest";
import {
  compileBase,
  estimateCredits,
  PromptPlanSchema,
  loadBrand,
  loadPrompts,
  loadRoutes,
  computeVersions,
  type Brief,
} from "../src/index";

const brand = loadBrand("banjaaran");
const prompts = loadPrompts();
const routes = loadRoutes();
const versions = computeVersions("banjaaran");

const imageBrief: Brief = {
  id: "test-img",
  brand: "banjaaran",
  format: "image",
  platform: "instagram",
  hook: "Hand-stitched, quietly.",
  angle: "craft over trend",
  cta: "See the edit",
  products: ["kolhapuri-tan"],
  style_anchor: "warm-evening",
  variants: 3,
  credit_cap: 20,
};

const videoBrief: Brief = {
  ...imageBrief,
  id: "test-vid",
  format: "video",
  variants: 2,
  credit_cap: 40,
};

describe("compileBase output shape", () => {
  it("produces a schema-valid PromptPlan for an image brief", () => {
    const plan = compileBase({ brief: imageBrief, brand, prompts, routes, versions, brandKey: "banjaaran" });
    expect(PromptPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.shots).toHaveLength(3);
    expect(plan.format).toBe("image");
    expect(plan.shots.every((s) => s.aspect === "4:5")).toBe(true); // instagram image
    expect(plan.shots.every((s) => s.video_prompt === undefined)).toBe(true);
    expect(plan.copy.caption).toContain("Hand-stitched");
    expect(plan.copy.script).toBeUndefined();
    expect(plan.routing.video_model).toBeNull();
  });

  it("adds video prompts + vertical aspect for a video brief", () => {
    const plan = compileBase({ brief: videoBrief, brand, prompts, routes, versions, brandKey: "banjaaran" });
    expect(PromptPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.shots).toHaveLength(2);
    expect(plan.shots.every((s) => s.aspect === "9:16")).toBe(true);
    expect(plan.shots.every((s) => typeof s.video_prompt === "string")).toBe(true);
    expect(typeof plan.copy.script).toBe("string");
    expect(plan.routing.video_model).toBe(routes.video.endpoint);
  });

  it("interpolates no leftover template tokens", () => {
    const plan = compileBase({ brief: videoBrief, brand, prompts, routes, versions, brandKey: "banjaaran" });
    for (const shot of plan.shots) {
      expect(shot.image_prompt).not.toMatch(/\{\{/);
      expect(shot.negative_prompt).not.toMatch(/\{\{/);
      expect(shot.video_prompt ?? "").not.toMatch(/\{\{/);
    }
  });
});

describe("estimateCredits", () => {
  it("image = variants * credits_per_image", () => {
    expect(estimateCredits(imageBrief, routes)).toBe(3 * routes.image.credits_per_image);
  });

  it("video = heroes + top-2 clips * duration * credits_per_second", () => {
    const heroes = 2 * routes.image.credits_per_image;
    const motion = Math.min(2, 2) * routes.video.duration_seconds * routes.video.credits_per_second;
    expect(estimateCredits(videoBrief, routes)).toBe(heroes + motion);
  });
});
