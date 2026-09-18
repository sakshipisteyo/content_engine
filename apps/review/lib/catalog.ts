import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { ROOT } from "./repo";

export interface BrandCatalog {
  key: string;
  name: string;
  products: { key: string; name: string }[];
  anchors: { key: string; description: string }[];
}

export interface TemplateCatalog {
  key: string;
  name: string;
  description: string;
  format: string;
  platform: string;
  usesProductImage: boolean;
}

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
}

export function listBrandCatalog(): BrandCatalog[] {
  const dir = join(ROOT, "brand");
  const out: BrandCatalog[] = [];
  for (const f of yamlFiles(dir)) {
    try {
      const y = parse(readFileSync(join(dir, f), "utf8")) as {
        name?: string;
        products?: Record<string, { name?: string }>;
        style_anchors?: Record<string, { description?: string }>;
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
      };
      out.push({
        key: y.key ?? f.replace(/\.ya?ml$/, ""),
        name: y.name ?? "",
        description: y.description ?? "",
        format: y.format ?? "image",
        platform: y.platform ?? "instagram",
        usesProductImage: y.uses_product_image !== false,
      });
    } catch {
      /* skip malformed template */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
