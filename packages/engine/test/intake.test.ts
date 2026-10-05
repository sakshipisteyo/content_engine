import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  brandFromIntake,
  brandContext,
  withDisclaimer,
  fontFamilyName,
  quoteThemes,
  loadBrand,
  FALLBACK_PALETTE,
  PATHS,
  BrandSchema,
} from "../src/index";

describe("brand intake", () => {
  it("builds a service brand with no photos from its offerings", () => {
    const b = brandFromIntake(
      {
        name: "Northwind Advisory",
        business_type: "service",
        offer: "AI strategy for mid-size retailers",
        offerings: ["AI workshops", "Agent builds"],
        audience: "COOs at retailers",
        pillars: [{ name: "Expert tips", description: "how-tos" }],
        goals: ["leads"],
        channels: ["linkedin", "x"],
        handle: "northwind",
      },
      { products: [] },
      [],
    );
    expect(b.business_type).toBe("service");
    expect(Object.values(b.products).map((p) => p.name)).toEqual(["AI workshops", "Agent builds"]);
    expect(Object.values(b.products).every((p) => p.images.length === 0)).toBe(true);
    expect(b.palette).toEqual(FALLBACK_PALETTE);
    expect(b.palette_locked).toBeUndefined();
    expect(b.social?.handle).toBe("@northwind");
    expect(b.channels).toEqual(["linkedin", "x"]);
    expect(b.category).toBe("services");
  });

  it("gives a brand with no offerings one entry from the offer", () => {
    const b = brandFromIntake({ name: "Solo", business_type: "service", offer: "Fractional CTO" }, { products: [] }, []);
    expect(Object.values(b.products).map((p) => p.name)).toEqual(["Fractional CTO"]);
  });

  it("maps product photos onto offerings and uses the detected palette", () => {
    const b = brandFromIntake(
      { name: "Acme AI", offerings: ["Support Copilot"] },
      { logo: "logo.png", products: ["product-1.png", "product-2.png"] },
      ["#112233", "#445566"],
    );
    expect(b.products["support-copilot"]!.images).toEqual(["assets/product-1.png"]);
    expect(Object.values(b.products).map((p) => p.name)).toEqual(["Support Copilot", "Acme AI"]);
    expect(b.products["acme-ai"]!.images).toEqual(["assets/product-2.png"]);
    expect(b.palette).toEqual(["#112233", "#445566"]);
    expect(b.logo).toBe("assets/logo.png");
  });

  it("locks exact enterprise colours, primary first, and the brand theme uses the primary", () => {
    const b = brandFromIntake(
      { name: "Globex", colors: ["#0a3d91", "#ffb000"], themes: ["light", "brand"] },
      { products: ["p.png"] },
      ["#000000"],
    );
    expect(b.palette).toEqual(["#0A3D91", "#FFB000"]);
    expect(b.palette_locked).toBe(true);
    const themes = quoteThemes(b);
    expect(themes.map((t) => t.name)).toEqual(["light", "brand"]);
    expect(themes[1]!.background).toBe("#0A3D91");
  });

  it("records the brand font files under assets/", () => {
    const b = brandFromIntake({ name: "Initech" }, { products: ["p.png"], font: { family: "Inter", regular: "font-regular.ttf" } }, []);
    expect(b.font).toBe("Inter");
    expect(b.font_files).toEqual({ regular: "assets/font-regular.ttf" });
  });

  it("rejects bad input with zod issues", () => {
    expect(() => brandFromIntake({ name: "" }, { products: [] }, [])).toThrow();
    expect(() => brandFromIntake({ name: "X", colors: ["blue"] }, { products: [] }, [])).toThrow();
  });

  it("keeps brands set up before the intake valid", () => {
    expect(() => BrandSchema.parse(loadBrand("brewcraft"))).not.toThrow();
    expect(brandContext(loadBrand("brewcraft"))).toBe("");
    expect(quoteThemes(loadBrand("brewcraft")).map((t) => t.name)).toEqual(["dark", "light", "brand"]);
  });
});

describe("copy context and disclaimer", () => {
  const b = brandFromIntake(
    {
      name: "Acme AI",
      offer: "Support copilot",
      proof_points: ["Used by 120 teams"],
      pillars: [{ name: "Customer wins" }],
      brand_rules: "Never name competitors.",
      disclaimer: "Results vary.",
    },
    { products: ["p.png"] },
    [],
  );

  it("puts offer, proof, pillars and rules in the copy prompt", () => {
    const ctx = brandContext(b);
    for (const s of ["Support copilot", "Used by 120 teams", "Customer wins", "Never name competitors."]) {
      expect(ctx).toContain(s);
    }
  });

  it("appends the disclaimer once", () => {
    const once = withDisclaimer("Book a demo", b);
    expect(once).toBe("Book a demo\n\nResults vary.");
    expect(withDisclaimer(once, b)).toBe(once);
    expect(withDisclaimer("Hi", {})).toBe("Hi");
  });
});

describe("fontFamilyName", () => {
  it("reads the family from TTF files", () => {
    const dejavu = join(PATHS.root, "assets", "fonts", "DejaVuSans-Bold.ttf");
    expect(fontFamilyName(readFileSync(dejavu))).toBe("DejaVu Sans");
    const liberation = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf";
    if (existsSync(liberation)) expect(fontFamilyName(readFileSync(liberation))).toBe("Liberation Serif");
  });

  it("returns null for files that aren't fonts", () => {
    expect(fontFamilyName(Buffer.from("not a font at all"))).toBeNull();
    expect(fontFamilyName(readFileSync(join(PATHS.root, "package.json")))).toBeNull();
  });
});
