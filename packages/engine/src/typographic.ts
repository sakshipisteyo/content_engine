/**
 * Typographic renderer: text-first post layouts drawn locally with
 * sharp + Pango (quote card here; carousel/tips/comparison in slides.ts, dispatch in
 * layouts.ts). No provider calls and no credits — the words come from the brief, the
 * colours and identity from the brand file. Each layout is rendered natively per aspect
 * (never cropped), and deterministic checks (contrast, text fit) produce the ScoreCard.
 *
 * Identity rule: a quote card always shows the brand's OWN name/handle/avatar. There is
 * no verified badge and no view/like counts — the card must not pass as someone else's
 * post or claim engagement it never had. Quoting another person goes in `attribution`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import type { Aspect, Brand } from "./schemas";
import { hexToRgb, type RGB } from "./score";
import { PATHS } from "./config";

/**
 * Default family: DejaVu Sans, bundled in assets/fonts (free licence) and loaded by file,
 * so text renders the same on hosts with no system fonts (Vercel functions).
 */
export const DEFAULT_FONT = "DejaVu Sans";

function bundledFontFile(bold: boolean): string | undefined {
  const file = join(PATHS.root, "assets", "fonts", bold ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf");
  return existsSync(file) ? file : undefined;
}

/* ---------------------------------------------------------------- colours */

/** WCAG relative luminance of an sRGB colour. */
export function luminance({ r, g, b }: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two #RRGGBB colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Linear blend of two hex colours (t = 0 -> a, t = 1 -> b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(x.r + (y.r - x.r) * t)}${h(x.g + (y.g - x.g) * t)}${h(x.b + (y.b - x.b) * t)}`.toUpperCase();
}

export interface Theme {
  name: string;
  background: string;
  text: string;
  muted: string;
  accent: string;
}

/** Most saturated palette colour that stays visible (>= 3:1) on the background. */
function pickAccent(palette: string[], background: string, fallback: string): string {
  const usable = palette
    .filter((c) => contrastRatio(c, background) >= 3)
    .sort((a, b) => saturation(hexToRgb(b)) - saturation(hexToRgb(a)));
  return usable[0] ?? fallback;
}

/** The colour themes a quote card cycles through across variants. */
export function quoteThemes(brand: Brand): Theme[] {
  const palette = brand.palette;
  const dark = { background: "#000000", text: "#E7E9EA", muted: "#8B9095" };
  const light = { background: "#FFFFFF", text: "#0F1419", muted: "#536471" };

  // Brand theme: darkest palette colour as the ground, whichever of white/ink reads best.
  const ground = [...palette].sort(
    (a, b) => luminance(hexToRgb(a)) - luminance(hexToRgb(b)),
  )[0]!;
  const text = contrastRatio("#FFFFFF", ground) >= contrastRatio("#111111", ground) ? "#FFFFFF" : "#111111";

  return [
    { name: "dark", ...dark, accent: pickAccent(palette, dark.background, dark.text) },
    { name: "light", ...light, accent: pickAccent(palette, light.background, light.text) },
    {
      name: "brand",
      background: ground,
      text,
      muted: mix(text, ground, 0.35),
      accent: pickAccent(palette.filter((c) => c !== ground), ground, text),
    },
  ];
}

/* ------------------------------------------------------------------- text */

/** Escape text for Pango markup. */
export function escapeMarkup(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Brand handle for the card: explicit social.handle, else derived from the name. */
export function brandHandle(brand: Brand): string {
  const h = brand.social?.handle ?? brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return h.startsWith("@") ? h : `@${h}`;
}

export interface TextImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface TextOpts {
  font: string;
  size: number;
  color: string;
  width: number;
  bold?: boolean;
  /** Extra line spacing, px. */
  spacing?: number;
  /** Tracking, px (for small uppercase labels). */
  letterSpacing?: number;
}

/** Render wrapped text (Pango) to a transparent PNG. Sizes are px (dpi 72). */
export async function textImage(markup: string, opts: TextOpts): Promise<TextImage> {
  const weight = opts.bold ? ' weight="bold"' : "";
  // Pango letter_spacing is in 1/1024 pt; at dpi 72 a pt is a px.
  const tracking = opts.letterSpacing ? ` letter_spacing="${Math.round(opts.letterSpacing * 1024)}"` : "";
  const fontfile = opts.font === DEFAULT_FONT ? bundledFontFile(!!opts.bold) : undefined;
  const { data, info } = await sharp({
    text: {
      ...(fontfile ? { fontfile } : {}),
      text: `<span foreground="${opts.color}"${weight}${tracking}>${markup}</span>`,
      font: `${opts.font} ${opts.size}`,
      width: Math.round(opts.width),
      dpi: 72,
      rgba: true,
      wrap: "word",
      spacing: Math.round(opts.spacing ?? 0),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Circle-cropped square avatar PNG; transparent logos sit on a `ground`-filled circle. */
export async function avatarImage(path: string, size: number, ground: string): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  const face = await sharp(path)
    .resize(size, size, { fit: "cover" })
    .flatten({ background: ground })
    .png()
    .toBuffer();
  return sharp(face)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/* ----------------------------------------------------------------- layout */

export const CANVAS: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "16:9": { w: 1920, h: 1080 },
};

export interface QuoteCardInput {
  quote: string;
  attribution?: string;
  displayName: string;
  handle: string;
  /** Absolute path to the avatar image; omitted -> initial on an accent circle. */
  avatarPath?: string;
  font: string;
  theme: Theme;
  aspect: Aspect;
}

export interface RenderResult {
  image: Buffer;
  width: number;
  height: number;
  /** Quote font size actually used (px). */
  quoteSize: number;
  /** False when the quote did not fit even at the minimum size (it is clipped). */
  fits: boolean;
}

const MIN_QUOTE_PX = 34;

/** Render one quote card at one aspect. */
export async function renderQuoteCard(input: QuoteCardInput): Promise<RenderResult> {
  const { w, h } = CANVAS[input.aspect];
  const { theme, font } = input;
  const margin = Math.round(w * 0.085);
  const contentW = w - margin * 2;

  // Header: avatar + name / handle.
  const avatarSize = Math.round(w * 0.11);
  const avatar = input.avatarPath && existsSync(input.avatarPath)
    ? await avatarImage(input.avatarPath, avatarSize, mix(theme.text, theme.background, 0.88))
    : await initialAvatar(input.displayName, avatarSize, theme);
  const nameX = avatarSize + Math.round(w * 0.026);
  const name = await textImage(escapeMarkup(input.displayName), {
    font, size: Math.round(w * 0.037), color: theme.text, width: contentW - nameX, bold: true,
  });
  const handle = await textImage(escapeMarkup(input.handle), {
    font, size: Math.round(w * 0.031), color: theme.muted, width: contentW - nameX,
  });
  const nameGap = Math.round(w * 0.008);
  const headerH = Math.max(avatarSize, name.height + nameGap + handle.height);

  const attribution = input.attribution?.trim()
    ? await textImage(escapeMarkup(`— ${input.attribution.trim()}`), {
        font, size: Math.round(w * 0.031), color: theme.muted, width: contentW,
      })
    : null;

  const gapHeaderQuote = Math.round(w * 0.05);
  const gapQuoteAttr = Math.round(w * 0.035);
  const accentH = Math.max(6, Math.round(w * 0.006));
  const gapAccent = Math.round(w * 0.05);
  const fixedH =
    headerH + gapHeaderQuote + (attribution ? gapQuoteAttr + attribution.height : 0) + gapAccent + accentH;
  const maxQuoteH = h - margin * 2 - fixedH;

  // Auto-fit: the largest size (capped, so one-liners stay tasteful) whose wrapped height
  // fills at most ~70% of the free space — short statements go big, long ones step down.
  const maxPx = Math.round(w * 0.088);
  const targetH = maxQuoteH * 0.7;
  // Binary search on the size (wrapped height grows with size): ~6 renders, not ~30.
  let size = maxPx;
  let quote = await quoteImage(input.quote, font, size, theme.text, contentW);
  if (quote.height > targetH) {
    let lo = MIN_QUOTE_PX;
    let hi = maxPx - 1;
    let best = await quoteImage(input.quote, font, lo, theme.text, contentW);
    size = lo;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const img = await quoteImage(input.quote, font, mid, theme.text, contentW);
      if (img.height <= targetH) {
        lo = mid;
        best = img;
        size = mid;
      } else {
        hi = mid - 1;
      }
    }
    quote = best;
  }
  const fits = quote.height <= maxQuoteH;
  const quoteH = Math.min(quote.height, Math.max(0, maxQuoteH));
  const quoteInput = fits
    ? quote.data
    : await sharp(quote.data).extract({ left: 0, top: 0, width: quote.width, height: quoteH }).png().toBuffer();

  // Vertically centre the whole block.
  const blockH = fixedH + quoteH;
  let y = Math.round((h - blockH) / 2);
  const layers: OverlayOptions[] = [];
  layers.push({ input: avatar, left: margin, top: y + Math.round((headerH - avatarSize) / 2) });
  const nameBlockH = name.height + nameGap + handle.height;
  const nameTop = y + Math.round((headerH - nameBlockH) / 2);
  layers.push({ input: name.data, left: margin + nameX, top: nameTop });
  layers.push({ input: handle.data, left: margin + nameX, top: nameTop + name.height + nameGap });
  y += headerH + gapHeaderQuote;
  layers.push({ input: quoteInput, left: margin, top: y });
  y += quoteH;
  if (attribution) {
    y += gapQuoteAttr;
    layers.push({ input: attribution.data, left: margin, top: y });
    y += attribution.height;
  }
  y += gapAccent;
  const accentW = Math.round(w * 0.09);
  layers.push({
    input: Buffer.from(
      `<svg width="${accentW}" height="${accentH}"><rect width="${accentW}" height="${accentH}" rx="${accentH / 2}" fill="${theme.accent}"/></svg>`,
    ),
    left: margin,
    top: y,
  });

  const image = await sharp({ create: { width: w, height: h, channels: 4, background: theme.background } })
    .composite(layers)
    .png()
    .toBuffer();
  return { image, width: w, height: h, quoteSize: size, fits };
}

function quoteImage(quote: string, font: string, size: number, color: string, width: number) {
  return textImage(escapeMarkup(quote.trim()), { font, size, color, width, spacing: size * 0.32 });
}

/** Fallback avatar: brand initial on an accent circle. */
export async function initialAvatar(name: string, size: number, theme: Theme): Promise<Buffer> {
  const initial = escapeMarkup((name.trim()[0] ?? "?").toUpperCase());
  const fg = contrastRatio("#FFFFFF", theme.accent) >= contrastRatio("#111111", theme.accent) ? "#FFFFFF" : "#111111";
  const letter = await textImage(initial, { font: DEFAULT_FONT, size: Math.round(size * 0.45), color: fg, width: size, bold: true });
  const circle = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${theme.accent}"/></svg>`,
  );
  return sharp(circle)
    .composite([{
      input: letter.data,
      left: Math.max(0, Math.round((size - letter.width) / 2)),
      top: Math.max(0, Math.round((size - letter.height) / 2)),
    }])
    .png()
    .toBuffer();
}

