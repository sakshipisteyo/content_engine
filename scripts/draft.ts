/**
 * AI writer from the command line / the board's "Let AI write it" panel.
 *   tsx scripts/draft.ts --brand acme [--template stat-card] [--notes "..."]   -> one draft (JSON)
 *   tsx scripts/draft.ts --brand acme --ideas [--count 6]                      -> ideas (JSON)
 * Prints JSON on stdout; errors as "error: ..." on stderr.
 */
import { draftPost, suggestIdeas, loadBrand, loadRoutes, loadEnv } from "../packages/engine/src/index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

loadEnv();
try {
  const brandKey = arg("brand");
  if (!brandKey) throw new Error("--brand required");
  const brand = loadBrand(brandKey);
  const routes = loadRoutes();
  if (process.argv.includes("--ideas")) {
    const ideas = await suggestIdeas(brand, routes, Math.min(10, Math.max(1, Number(arg("count") ?? 6))));
    console.log(JSON.stringify({ ideas }));
  } else {
    const draft = await draftPost(brand, brandKey, routes, { notes: arg("notes"), templateKey: arg("template") });
    console.log(JSON.stringify({ draft }));
  }
} catch (e) {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
}
