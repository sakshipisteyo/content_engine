/**
 * Re-render a video post. Draft (default) is free and local; --full calls Higgsfield
 * (and ElevenLabs for voice) within the post's credit cap.
 *   tsx scripts/render-video.ts --id <brief-id> [--full]
 * Prints: rendered <id> <mode> <seconds>s <credits> credits
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PATHS,
  BriefSchema,
  loadBrand,
  loadTemplate,
  loadRoutes,
  openLedger,
  runMontage,
  MontageError,
  type PromptPlan,
} from "../packages/engine/src/index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const id = arg("id") ?? die("--id required");
const mode = process.argv.includes("--full") ? "full" : "draft";
const dir = join(PATHS.out, id);
let brief, plan: PromptPlan;
try {
  brief = BriefSchema.parse(JSON.parse(readFileSync(join(dir, "brief.json"), "utf8")));
  plan = JSON.parse(readFileSync(join(dir, "prompt.json"), "utf8")) as PromptPlan;
} catch (e) {
  die(`can't read post ${id}: ${(e as Error).message}`);
}
const template = loadTemplate(brief.template ?? die("this post has no template"));
if (template.renderer !== "montage") die("not a video post");
const brand = loadBrand(brief.brand);
const ledger = openLedger();
try {
  const r = await runMontage(
    { brandKey: brief.brand, brand, routes: loadRoutes(), ledger, runId: `render-${Date.now()}` },
    brief,
    template,
    { text: plan.copy.caption, hashtags: plan.copy.hashtags },
    mode,
  );
  console.log(`rendered ${id} ${r.mode} ${r.seconds.toFixed(1)}s ${r.spent_credits} credits`);
} catch (e) {
  die(e instanceof MontageError ? e.message : `video render failed: ${(e as Error).message}`);
} finally {
  ledger.close();
}
