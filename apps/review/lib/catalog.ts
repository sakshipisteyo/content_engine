import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { BRAND_DIR, ROOT } from "./repo";

export interface BrandCatalog {
  key: string;
  name: string;
  products: { key: string; name: string }[];
  anchors: { key: string; description: string }[];
  businessType: "product" | "service";
  defaultCta: string | null;
  pillars: { name: string; description?: string }[];
}

export interface TemplateCatalog {
  key: string;
  name: string;
  description: string;
  format: string;
  platform: string;
  usesProductImage: boolean;
  /** "typographic" = drawn locally from the words (quote card); no photo, 0 credits. */
  renderer: string;
  hookLabel: string | null;
  hookPlaceholder: string | null;
  asksAttribution: boolean;
  asksBody: boolean;
  bodyLabel: string | null;
  bodyPlaceholder: string | null;
  /** Video (montage) templates: which uploads the form asks for. */
  asksMedia: "screens" | "photos" | "presenter" | null;
  /** Photo text posts: photo upload + scene description for Higgsfield. */
  asksPhoto: boolean;
}

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
}

export function listBrandCatalog(): BrandCatalog[] {
  const dir = BRAND_DIR;
  const out: BrandCatalog[] = [];
  for (const f of yamlFiles(dir)) {
    try {
      const y = parse(readFileSync(join(dir, f), "utf8")) as {
        name?: string;
        products?: Record<string, { name?: string }>;
        style_anchors?: Record<string, { description?: string }>;
        business_type?: string;
        default_cta?: string;
        pillars?: { name?: string; description?: string }[];
      };
      const key = f.replace(/\.ya?ml$/, "");
      out.push({
        key,
        name: y.name ?? key,
        products: Object.entries(y.products ?? {}).map(([k, v]) => ({ key: k, name: v?.name ?? k })),
        anchors: Object.entries(y.style_anchors ?? {}).map(([k, v]) => ({
          key: k,
          description: v?.description ?? "",
        })),
        businessType: y.business_type === "service" ? "service" : "product",
        defaultCta: y.default_cta ?? null,
        pillars: (y.pillars ?? [])
          .filter((p) => p?.name)
          .map((p) => ({ name: p.name!, ...(p.description ? { description: p.description } : {}) })),
      });
    } catch {
      /* skip malformed brand file */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function listTemplateCatalog(): TemplateCatalog[] {
  const dir = join(ROOT, "templates");
  const out: TemplateCatalog[] = [];
  for (const f of yamlFiles(dir)) {
    try {
      const y = parse(readFileSync(join(dir, f), "utf8")) as {
        key?: string;
        name?: string;
        description?: string;
        format?: string;
        platform?: string;
        uses_product_image?: boolean;
        renderer?: string;
        hook_label?: string;
        hook_placeholder?: string;
        asks_attribution?: boolean;
        asks_body?: boolean;
        body_label?: string;
        body_placeholder?: string;
        asks_media?: "screens" | "photos" | "presenter";
        asks_photo?: boolean;
      };
      out.push({
        key: y.key ?? f.replace(/\.ya?ml$/, ""),
        name: y.name ?? "",
        description: y.description ?? "",
        format: y.format ?? "image",
        platform: y.platform ?? "instagram",
        usesProductImage: y.uses_product_image !== false,
        renderer: y.renderer ?? "higgsfield",
        hookLabel: y.hook_label ?? null,
        hookPlaceholder: y.hook_placeholder ?? null,
        asksAttribution: y.asks_attribution === true,
        asksBody: y.asks_body === true,
        bodyLabel: y.body_label ?? null,
        bodyPlaceholder: y.body_placeholder?.trim() ?? null,
        asksMedia: y.renderer === "montage" ? (y.asks_media ?? "photos") : null,
        asksPhoto: y.asks_photo === true,
      });
    } catch {
      /* skip malformed template */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
