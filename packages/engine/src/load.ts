/**
 * Load + validate every YAML input. Each loader validates against a Zod schema and
 * throws a ConfigError (naming the file) on failure. loadAllBriefs collects per-file
 * errors so the CLI can report them all, then stop (SPEC section 4 / section 10 step 3).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import {
  BrandSchema,
  BriefSchema,
  RoutesSchema,
  PromptsFileSchema,
  ScoreConfigSchema,
  TemplateSchema,
  type Brand,
  type Brief,
  type Routes,
  type PromptsFile,
  type ScoreConfig,
  type Template,
  type Versions,
} from "./schemas";
import {
  PATHS,
  ConfigError,
  loadYaml,
  hashFile,
  hashString,
  listBriefFiles,
} from "./config";
import type { CompilePrompts } from "./compile";

export function loadRoutes(): Routes {
  return loadYaml(join(PATHS.routing, "routes.yaml"), RoutesSchema);
}

export function loadPrompts(): CompilePrompts {
  return {
    image: loadYaml<PromptsFile>(join(PATHS.prompts, "image.yaml"), PromptsFileSchema),
    video: loadYaml<PromptsFile>(join(PATHS.prompts, "video.yaml"), PromptsFileSchema),
    copy: loadYaml<PromptsFile>(join(PATHS.prompts, "copy.yaml"), PromptsFileSchema),
  };
}

export function loadScoreConfig(): ScoreConfig {
  return loadYaml(join(PATHS.prompts, "score.yaml"), ScoreConfigSchema);
}

export function templateFile(key: string): string {
  return join(PATHS.templates, `${key}.yaml`);
}

export function loadTemplate(key: string): Template {
  return loadYaml(templateFile(key), TemplateSchema);
}

/** List available ad-type templates (by key), sorted. */
export function listTemplates(): Template[] {
  if (!existsSync(PATHS.templates)) return [];
  return readdirSync(PATHS.templates)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => loadYaml<Template>(join(PATHS.templates, f), TemplateSchema))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function brandFile(brandKey: string): string {
  return join(PATHS.brand, `${brandKey}.yaml`);
}

/** List available brand keys (from brand/<key>.yaml), sorted. */
export function listBrandKeys(): string[] {
  if (!existsSync(PATHS.brand)) return [];
  return readdirSync(PATHS.brand)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => f.replace(/\.ya?ml$/, ""))
    .sort();
}

export function loadBrand(brandKey: string): Brand {
  return loadYaml(brandFile(brandKey), BrandSchema);
}

export interface LoadedBrief {
  file: string;
  brief: Brief;
}

export interface BriefLoadError {
  file: string;
  message: string;
}

export interface BriefsLoad {
  briefs: LoadedBrief[];
  errors: BriefLoadError[];
}

/** Load every brief; collect errors per file rather than throwing on the first. */
export function loadAllBriefs(dir: string = PATHS.briefs): BriefsLoad {
  const briefs: LoadedBrief[] = [];
  const errors: BriefLoadError[] = [];
  for (const file of listBriefFiles(dir)) {
    try {
      briefs.push({ file, brief: loadYaml(file, BriefSchema) });
    } catch (e) {
      errors.push({
        file: basename(file),
        message: e instanceof ConfigError ? e.message : (e as Error).message,
      });
    }
  }
  return { briefs, errors };
}

/** Version hashes for the PromptPlan.versions block. */
export function computeVersions(brandKey: string): Versions {
  const promptText = ["image.yaml", "video.yaml", "copy.yaml", "score.yaml"]
    .map((f) => {
      try {
        return readFileSync(join(PATHS.prompts, f), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n---\n");
  return {
    brand_hash: hashFile(brandFile(brandKey)),
    prompt_yaml_hash: hashString(promptText),
    routes_hash: hashFile(join(PATHS.routing, "routes.yaml")),
  };
}
