/**
 * CLI entry:
 *   tsx scripts/run.ts --briefs briefs --format image|video|all [--dry-run] [--only <id>]
 *                      [--from <stage>] [--note "..."]
 *
 * --dry-run compiles every brief, writes out/<id>/prompt.json, prints estimated credits,
 * and calls NO provider and touches NO ledger (SPEC A2). Without --dry-run it runs the
 * full staged pipeline (SPEC A3+), which needs API keys in .env.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  PATHS,
  ConfigError,
  loadRoutes,
  loadPrompts,
  loadScoreConfig,
  loadBrand,
  loadAllBriefs,
  computeVersions,
  compileBase,
  estimateCredits,
  missingReferenceImages,
  loadBrandMemoryReadOnly,
  runBrief,
  openLedger,
  type Brief,
  type Brand,
  type BrandMemory,
  type StageName,
  type PipelineCtx,
} from "../packages/engine/src/index";

const STAGE_ORDER: StageName[] = [
  "compile",
  "hero",
  "score-1",
  "motion",
  "copy",
  "voice",
  "assemble",
  "score-2",
];

interface Args {
  briefs: string;
  format: "image" | "video" | "all";
  dryRun: boolean;
  only?: string;
  from?: StageName;
  note?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { briefs: PATHS.briefs, format: "all", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--briefs":
        a.briefs = join(PATHS.root, argv[++i] ?? "briefs");
        break;
      case "--format": {
        const f = argv[++i];
        if (f !== "image" && f !== "video" && f !== "all") die(`--format must be image|video|all`);
        a.format = f;
        break;
      }
      case "--dry-run":
        a.dryRun = true;
        break;
      case "--only":
        a.only = argv[++i];
        break;
      case "--from": {
        const s = argv[++i] as StageName;
        if (!STAGE_ORDER.includes(s)) die(`--from must be one of ${STAGE_ORDER.join(", ")}`);
        a.from = s;
        break;
      }
      case "--note":
        a.note = argv[++i];
        break;
      default:
        if (arg && arg.startsWith("--")) die(`unknown flag ${arg}`);
    }
  }
  return a;
}

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function selectBriefs(all: { file: string; brief: Brief }[], args: Args): Brief[] {
  let briefs = all.map((b) => b.brief);
  if (args.only) briefs = briefs.filter((b) => b.id === args.only);
  if (args.format !== "all") briefs = briefs.filter((b) => b.format === args.format);
  return briefs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Load + validate shared config (stops on first invalid).
  let routes, prompts, scoreConfig;
  try {
    routes = loadRoutes();
    prompts = loadPrompts();
    scoreConfig = loadScoreConfig();
  } catch (e) {
    die(e instanceof ConfigError ? e.message : (e as Error).message);
  }

  // Load + validate briefs, reporting errors per file.
  const { briefs: loaded, errors } = loadAllBriefs(args.briefs);
  if (errors.length) {
    console.error(`\n${errors.length} invalid brief file(s):`);
    for (const err of errors) console.error(`\n[${err.file}]\n${err.message}`);
    die(`fix the brief file(s) above and re-run`);
  }
  if (loaded.length === 0) die(`no briefs found in ${args.briefs}`);

  const briefs = selectBriefs(loaded, args);
  if (briefs.length === 0) die(`no briefs match the selection (--only/--format)`);

  // Cache brands (validated on first use).
  const brandCache = new Map<string, Brand>();
  const getBrand = (key: string): Brand => {
    if (!brandCache.has(key)) brandCache.set(key, loadBrand(key));
    return brandCache.get(key)!;
  };

  if (args.dryRun) {
    await dryRun(briefs, getBrand, routes, prompts);
    return;
  }
  await realRun(briefs, getBrand, routes, prompts, scoreConfig, args);
}

async function dryRun(
  briefs: Brief[],
  getBrand: (k: string) => Brand,
  routes: ReturnType<typeof loadRoutes>,
  prompts: ReturnType<typeof loadPrompts>,
): Promise<void> {
  console.log(`\nDRY RUN — compiling ${briefs.length} brief(s), no provider calls.\n`);
  let total = 0;
  const warnings: string[] = [];
  const memCache = new Map<string, BrandMemory>();
  for (const brief of briefs) {
    let brand: Brand;
    try {
      brand = getBrand(brief.brand);
    } catch (e) {
      die(e instanceof ConfigError ? e.message : (e as Error).message);
    }
    if (!memCache.has(brief.brand)) {
      memCache.set(brief.brand, loadBrandMemoryReadOnly(brief.brand, () => openLedger()));
    }
    const memory = memCache.get(brief.brand)!;
    const versions = computeVersions(brief.brand);
    const plan = compileBase({
      brief,
      brand,
      prompts,
      routes,
      versions,
      brandKey: brief.brand,
      memory,
    });
    const dir = join(PATHS.out, brief.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.json"), JSON.stringify(plan, null, 2));
    writeFileSync(join(dir, "brief.json"), JSON.stringify(brief, null, 2));

    const credits = estimateCredits(brief, routes);
    total += credits;
    console.log(
      `  ${brief.id.padEnd(10)} ${brief.format.padEnd(5)} ${brief.platform.padEnd(9)} ` +
        `${brief.variants} var  ~${credits} credits  (cap ${brief.credit_cap})` +
        (credits > brief.credit_cap ? "  ⚠ over cap" : ""),
    );
    if (plan.learned?.applied) {
      const l = plan.learned;
      const bits = [
        `+${l.reinforced_negatives.length} learned negative(s)`,
        l.anchor_note ? "anchor steer" : null,
        l.voice_examples ? `${l.voice_examples} caption voice` : null,
      ].filter(Boolean);
      console.log(`             ↳ brand memory (${l.sample_size} past posts): ${bits.join(", ")}`);
    }
    for (const m of missingReferenceImages(plan)) {
      warnings.push(`${brief.id}: missing reference image ${m}`);
    }
  }
  console.log(`\n  ${"TOTAL".padEnd(10)} estimated credits: ~${total}\n`);
  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
    console.log(
      `\n(Reference/logo assets are placeholders until real brand assets are added.)\n`,
    );
  }
  console.log(`PromptPlans written under out/. Ledger untouched (0 provider calls).`);
}

async function realRun(
  briefs: Brief[],
  getBrand: (k: string) => Brand,
  routes: ReturnType<typeof loadRoutes>,
  prompts: ReturnType<typeof loadPrompts>,
  scoreConfig: ReturnType<typeof loadScoreConfig>,
  args: Args,
): Promise<void> {
  const ledger = openLedger();
  const runId = `run-${Date.now()}`;
  console.log(`\nREAL RUN ${runId} — ${briefs.length} brief(s). Provider calls WILL happen.\n`);

  for (const brief of briefs) {
    const brand = getBrand(brief.brand);
    if (args.from) {
      const idx = STAGE_ORDER.indexOf(args.from);
      const clearing = STAGE_ORDER.slice(idx);
      ledger.clearFrom(brief.id, clearing);
      if (args.from === "compile" || args.from === "hero") {
        const dir = join(PATHS.out, brief.id);
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      }
    }
    const ctx: PipelineCtx = {
      brandKey: brief.brand,
      brand,
      prompts,
      routes,
      scoreConfig,
      versions: computeVersions(brief.brand),
      ledger,
      runId,
      concurrency: 2,
    };
    try {
      const res = await runBrief(ctx, brief);
      console.log(
        `  ${brief.id.padEnd(10)} -> ${res.status}  survivors ${res.survivors}  spent ~${res.spent_credits} credits`,
      );
    } catch (e) {
      console.error(`  ${brief.id.padEnd(10)} -> ERROR ${(e as Error).message}`);
    }
  }
  ledger.close();
  console.log(`\nDone. Review at http://localhost:3000 (pnpm --filter review dev).`);
}

main().catch((e) => die((e as Error).message));
