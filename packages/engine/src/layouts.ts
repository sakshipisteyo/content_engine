/**
 * Entry point for typographic posts: picks the layout, renders every aspect (and every
 * page, for carousels) of one variant, and scores it deterministically (contrast + fit).
 */
import type { Aspect, Brand, Brief, HardFail, ScoreCard, TypographicLayout } from "./schemas";
import { DEFAULT_FONT, brandHandle, contrastRatio, quoteThemes, renderQuoteCard, type Theme } from "./typographic";
import {
  renderComparisonCard,
  renderInsightCarousel,
  renderTipsCard,
  type FrameInput,
  type PageRender,
} from "./slides";
import { OutlineError, parseCarousel, parseList, parsePairs } from "./outline";

/** Layouts that produce several pages per aspect (carousels). */
export const MULTI_PAGE_LAYOUTS: TypographicLayout[] = ["insight-carousel"];

/** Layouts drawn from `brief.body` (an outline) rather than the hook alone. */
export const BODY_LAYOUTS: TypographicLayout[] = ["insight-carousel", "tips-list", "comparison"];

/** Aspects to render: carousels skip 9:16 (stories don't swipe like feed carousels). */
export function layoutAspects(layout: TypographicLayout, primary: Aspect, crops: Aspect[]): Aspect[] {
  const all = [...new Set([primary, ...crops])];
  return MULTI_PAGE_LAYOUTS.includes(layout) ? all.filter((a) => a !== "9:16") : all;
}

/** Throws OutlineError when the brief's outline can't drive the layout. */
export function validateLayoutInput(layout: TypographicLayout, brief: Pick<Brief, "body">): void {
  if (!BODY_LAYOUTS.includes(layout)) return;
  const body = brief.body?.trim();
  if (!body) throw new OutlineError("this template needs an outline");
  if (layout === "insight-carousel") parseCarousel(body);
  if (layout === "tips-list") parseList(body);
  if (layout === "comparison") parsePairs(body);
}

export interface AspectRender {
  aspect: Aspect;
  pages: PageRender[];
}

export interface TypographicVariant {
  variant: number;
  theme: Theme;
  renders: AspectRender[];
  card: ScoreCard;
}

async function renderPages(
  layout: TypographicLayout,
  brand: Brand,
  brief: Brief,
  theme: Theme,
  aspect: Aspect,
  avatarPath: string | undefined,
): Promise<PageRender[]> {
  const font = brand.font ?? DEFAULT_FONT;
  const displayName = brand.social?.display_name ?? brand.name;
  const handle = brandHandle(brand);
  const frame: FrameInput = { aspect, theme, font, brandName: displayName, handle, logoPath: avatarPath };
  const body = brief.body ?? "";
  switch (layout) {
    case "quote-card": {
      const r = await renderQuoteCard({
        quote: brief.hook,
        attribution: brief.attribution,
        displayName,
        handle,
        avatarPath,
        font,
        theme,
        aspect,
      });
      return [{ image: r.image, width: r.width, height: r.height, fits: r.fits, note: `${r.quoteSize}px` }];
    }
    case "insight-carousel":
      return renderInsightCarousel(frame, brief.hook, parseCarousel(body), brief.cta);
    case "tips-list":
      return [await renderTipsCard(frame, brief.hook, parseList(body))];
    case "comparison":
      return [await renderComparisonCard(frame, brief.hook, parsePairs(body))];
  }
}

/** Render every aspect of one variant for a layout. */
export async function renderTypographicVariant(
  layout: TypographicLayout,
  brand: Brand,
  brief: Brief,
  variant: number,
  aspects: Aspect[],
  avatarPath: string | undefined,
): Promise<TypographicVariant> {
  const themes = quoteThemes(brand);
  const theme = themes[(variant - 1) % themes.length]!;
  const renders: AspectRender[] = [];
  for (const aspect of aspects) {
    renders.push({ aspect, pages: await renderPages(layout, brand, brief, theme, aspect, avatarPath) });
  }
  return { variant, theme, renders, card: typographicScoreCard(brief.id, variant, theme, renders) };
}

/** WCAG AA: 4.5:1 for body text; 3:1 for large/secondary text. */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_MUTED_CONTRAST = 3;

/** Deterministic score card for a typographic variant (no LLM). */
export function typographicScoreCard(
  briefId: string,
  variant: number,
  theme: Theme,
  renders: AspectRender[],
): ScoreCard {
  const fails = new Set<HardFail>();
  const reasons: string[] = [];
  const textC = contrastRatio(theme.text, theme.background);
  const mutedC = contrastRatio(theme.muted, theme.background);
  reasons.push(`${theme.name} theme · text contrast ${textC.toFixed(1)}:1, secondary ${mutedC.toFixed(1)}:1`);
  if (textC < MIN_TEXT_CONTRAST) {
    fails.add("legibility");
    reasons.push(`text contrast below ${MIN_TEXT_CONTRAST}:1`);
  }
  if (mutedC < MIN_MUTED_CONTRAST) {
    fails.add("legibility");
    reasons.push(`secondary text contrast below ${MIN_MUTED_CONTRAST}:1`);
  }
  for (const { aspect, pages } of renders) {
    pages.forEach((p, i) => {
      if (p.fits) return;
      fails.add("legibility");
      reasons.push(`${pages.length > 1 ? `page ${i + 1} ` : ""}too much text for ${aspect} — shorten it`);
    });
  }
  const pageCount = renders[0]?.pages.length ?? 0;
  if (pageCount > 1) reasons.push(`${pageCount} pages per size`);
  if (!fails.size) {
    // One note per size; for carousels the tightest page speaks for the set.
    const fit = renders.map((r) => `${r.aspect} ${r.pages.length > 1 ? tightest(r.pages) : r.pages[0]?.note ?? ""}`);
    reasons.push(`text fits at ${fit.join(", ")}`);
  }
  reasons.push("rendered locally — 0 credits");
  return {
    brief_id: briefId,
    variant,
    stage: "score-1",
    hard_fails: [...fails],
    soft: null,
    total: 0,
    rank: null,
    reasons,
  };
}

/** "scale 0.84" of the most-shrunk page (notes are "scale x.xx" for page layouts). */
function tightest(pages: PageRender[]): string {
  const scales = pages.map((p) => Number(/scale ([\d.]+)/.exec(p.note)?.[1] ?? 1));
  return `min scale ${Math.min(...scales).toFixed(2)}`;
}
