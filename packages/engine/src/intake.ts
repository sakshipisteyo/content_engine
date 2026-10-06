/**
 * Brand intake: the answers from the 4-step "Add your brand" wizard -> a validated Brand.
 * Works for product brands (photos), service brands (no photos: offerings stand in for
 * products) and enterprise brand kits (exact colours, own fonts, rules, disclaimer).
 * Pure: the caller saves the uploads and extracts the palette (scripts/create-brand.ts).
 */
import { z } from "zod";
import {
  BrandSchema,
  BusinessType,
  Channel,
  Goal,
  PillarSchema,
  ThemeName,
  type Brand,
  type Product,
} from "./schemas";

const text = z.string().trim();
const lines = z.array(z.string().trim().min(1)).default([]);

export const IntakeSchema = z.object({
  name: text.min(1),
  business_type: BusinessType.default("product"),
  website: text.optional(),
  offer: text.optional(),
  /** Products or services, one name each. Product photos map onto these in order. */
  offerings: lines,
  proof_points: lines,
  category: text.optional(),
  audience: text.optional(),
  pains: lines,
  goals: z.array(Goal).default([]),
  channels: z.array(Channel).default([]),
  posts_per_week: z.number().int().min(1).max(21).optional(),
  tone: lines,
  pillars: z.array(PillarSchema).default([]),
  default_cta: text.optional(),
  banned_words: lines,
  examples: lines,
  brand_rules: text.optional(),
  disclaimer: text.optional(),
  handle: text.optional(),
  display_name: text.optional(),
  /** Exact brand colours, primary first (enterprise). Empty = auto-detect. */
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).default([]),
  themes: z.array(ThemeName).default([]),
  monthly_credit_budget: z.number().positive().optional(),
});
export type Intake = z.input<typeof IntakeSchema>;

/** Files the caller saved under brand/<key>/assets/ (names only). */
export interface IntakeFiles {
  logo?: string;
  products: string[];
  font?: { family: string; regular: string; bold?: string };
}

/** Used when there is nothing to read colours from and none were entered. */
export const FALLBACK_PALETTE = ["#111827", "#2563EB", "#F3F4F6"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/**
 * Build the brand. `detected` is the palette read from the logo/photos (may be empty);
 * entered colours always win and lock the palette.
 */
export function brandFromIntake(raw: Intake, files: IntakeFiles, detected: string[]): Brand {
  const i = IntakeSchema.parse(raw);
  const locked = i.colors.length > 0;
  const palette = (locked ? i.colors : detected.length ? detected : FALLBACK_PALETTE).map((c) => c.toUpperCase());

  // Products: one per offering; photos attach in order. A photo with no offering name is
  // named after the brand (uploads are renamed product-N, so the file name says nothing). Service brands need no photos; a brand with neither gets one
  // entry from the offer so every post has something to be "about".
  const products: Record<string, Product> = {};
  const count = Math.max(i.offerings.length, files.products.length);
  for (let n = 0; n < count; n++) {
    const file = files.products[n];
    const name = i.offerings[n] ?? i.name;
    let key = slug(name) || `offering-${n + 1}`;
    while (products[key]) key = `${key}-${n + 1}`;
    products[key] = { name, price_inr: 0, images: file ? [`assets/${file}`] : [] };
  }
  if (!Object.keys(products).length) {
    const name = i.offer || (i.business_type === "service" ? "Our services" : i.name);
    products[slug(name) || "offering"] = { name, price_inr: 0, images: [] };
  }

  const firstImage = files.products[0] ?? files.logo;
  const brand: Brand = {
    name: i.name,
    category: i.category || (i.business_type === "service" ? "services" : "products"),
    audience: i.audience || "its customers",
    tone: i.tone.length ? i.tone : ["clear", "confident"],
    banned_words: i.banned_words,
    banned_visuals: [],
    palette,
    // A brand with no logo still needs the field; posts fall back to an initial avatar.
    logo: files.logo ? `assets/${files.logo}` : firstImage ? `assets/${firstImage}` : "assets/logo.png",
    products,
    style_anchors: {
      signature: {
        description:
          i.business_type === "service"
            ? "clean, modern, on-brand, people and workspaces, natural light"
            : "on-brand, natural directional light, the product as the clear hero",
        // Only a real photo steers AI images; a logo as reference gets painted into scenes.
        references: files.products[0] ? [`assets/${files.products[0]}`] : [],
      },
    },
    voice_id: "REPLACE_WITH_ELEVENLABS_VOICE_ID",
    business_type: i.business_type,
  };

  const opt = <K extends keyof Brand>(k: K, v: Brand[K] | undefined) => {
    const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    if (!empty) brand[k] = v as Brand[K];
  };
  opt("website", i.website);
  opt("offer", i.offer);
  opt("proof_points", i.proof_points);
  opt("pains", i.pains);
  opt("goals", i.goals);
  opt("channels", i.channels);
  opt("posts_per_week", i.posts_per_week);
  opt("pillars", i.pillars);
  opt("default_cta", i.default_cta);
  opt("examples", i.examples);
  opt("brand_rules", i.brand_rules);
  opt("disclaimer", i.disclaimer);
  opt("themes", i.themes);
  opt("monthly_credit_budget", i.monthly_credit_budget);
  if (locked) brand.palette_locked = true;
  if (i.handle || i.display_name) {
    brand.social = {
      ...(i.display_name ? { display_name: i.display_name } : {}),
      ...(i.handle ? { handle: i.handle.startsWith("@") ? i.handle : `@${i.handle}` } : {}),
    };
  }
  if (files.font) {
    brand.font = files.font.family;
    brand.font_files = {
      regular: `assets/${files.font.regular}`,
      ...(files.font.bold ? { bold: `assets/${files.font.bold}` } : {}),
    };
  }
  return BrandSchema.parse(brand);
}
