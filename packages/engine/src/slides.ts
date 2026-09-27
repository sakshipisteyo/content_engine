/**
 * Multi-part typographic layouts: insight carousel (cover + section pages + CTA),
 * tips list and comparison (myth vs fact) cards. Shares the quote card's colour themes
 * and Pango text helpers; every page is built as a vertical stack of pieces that is
 * scaled down together (binary search) until it fits the content area.
 */
import { existsSync } from "node:fs";
import sharp, { type OverlayOptions } from "sharp";
import type { Aspect } from "./schemas";
import {
  CANVAS,
  contrastRatio,
  escapeMarkup,
  mix,
  textImage,
  type TextOpts,
  type Theme,
} from "./typographic";
import type { CarouselOutline, Pairs } from "./outline";

export interface PageRender {
  image: Buffer;
  width: number;
  height: number;
  /** False when the content did not fit even at the minimum scale (it is clipped). */
  fits: boolean;
  /** Human note for the score card, e.g. "scale 0.84". */
  note: string;
}

export interface FrameInput {
  aspect: Aspect;
  theme: Theme;
  font: string;
  brandName: string;
  handle: string;
  /** Absolute path to the logo (top-right); omitted -> none. */
  logoPath?: string;
}

/* ------------------------------------------------------------ primitives */

interface Layer {
  input: Buffer;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A horizontal band of the stack: its layers are positioned relative to the band. */
interface Piece {
  layers: Layer[];
  height: number;
  /** Space above this piece (ignored for the first). */
  gap: number;
}

async function text(markup: string, opts: TextOpts, left = 0): Promise<Layer> {
  const t = await textImage(markup, opts);
  return { input: t.data, left, top: 0, width: t.width, height: t.height };
}

function piece(layers: Layer[], gap: number): Piece {
  return { layers, gap, height: Math.max(0, ...layers.map((l) => l.top + l.height)) };
}

function rect(width: number, height: number, fill: string, radius = 0): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="${fill}"/></svg>`,
  );
}

function stackHeight(pieces: Piece[]): number {
  return pieces.reduce((sum, p, i) => sum + p.height + (i ? p.gap : 0), 0);
}

/**
 * Largest scale in [minScale, maxScale] whose stack fits availH. Pieces are rebuilt per scale
 * because wrapping changes with font size.
 */
async function fitStack(
  build: (s: number) => Promise<Piece[]>,
  availH: number,
  maxScale = 1,
  minScale = 0.55,
): Promise<{ pieces: Piece[]; scale: number; fits: boolean }> {
  let pieces = await build(maxScale);
  if (stackHeight(pieces) <= availH) return { pieces, scale: maxScale, fits: true };
  let lo = minScale;
  let hi = maxScale;
  let best = await build(lo);
  if (stackHeight(best) > availH) return { pieces: best, scale: lo, fits: false };
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    pieces = await build(mid);
    if (stackHeight(pieces) <= availH) {
      lo = mid;
      best = pieces;
    } else {
      hi = mid;
    }
  }
  return { pieces: best, scale: lo, fits: true };
}

/** Place a stack centred in [top, bottom]; pieces past `bottom` are cropped or dropped. */
async function placeStack(pieces: Piece[], left: number, top: number, bottom: number): Promise<OverlayOptions[]> {
  const out: OverlayOptions[] = [];
  let y = top + Math.max(0, Math.round((bottom - top - stackHeight(pieces)) / 2));
  for (const [i, p] of pieces.entries()) {
    if (i) y += p.gap;
    for (const l of p.layers) {
      const t = y + l.top;
      const room = bottom - t;
      if (room <= 0) continue;
      const input = l.height <= room
        ? l.input
        : await sharp(l.input).extract({ left: 0, top: 0, width: l.width, height: room }).png().toBuffer();
      out.push({ input, left: left + l.left, top: t });
    }
    y += p.height;
  }
  return out;
}

/** Body text colour: the theme text pulled slightly toward the ground. */
function bodyColor(theme: Theme): string {
  return mix(theme.text, theme.background, 0.16);
}

/** Readable text colour on the accent (for the CTA pill). */
function onAccent(theme: Theme): string {
  return contrastRatio("#FFFFFF", theme.accent) >= contrastRatio("#111111", theme.accent) ? "#FFFFFF" : "#111111";
}

/* ------------------------------------------------------------------ frame */

interface Frame {
  w: number;
  h: number;
  margin: number;
  contentW: number;
  contentTop: number;
  contentBottom: number;
  layers: OverlayOptions[];
}

/** Header (brand name + accent bar, logo top-right), footer (counter / swipe), bottom strip. */
async function frame(
  f: FrameInput,
  footer: { left?: string; swipe?: boolean },
): Promise<Frame> {
  const { w, h } = CANVAS[f.aspect];
  const { theme, font } = f;
  const margin = Math.round(w * 0.08);
  const contentW = w - margin * 2;
  const layers: OverlayOptions[] = [];

  const small = Math.round(w * 0.026);
  const name = await textImage(escapeMarkup(f.brandName), { font, size: Math.round(w * 0.03), color: theme.text, width: contentW * 0.6, bold: true });
  layers.push({ input: name.data, left: margin, top: margin });
  const barW = Math.round(w * 0.06);
  const barH = Math.max(5, Math.round(w * 0.005));
  const barTop = margin + name.height + Math.round(w * 0.012);
  layers.push({ input: rect(barW, barH, theme.accent, barH / 2), left: margin, top: barTop });
  let headerBottom = barTop + barH;

  if (f.logoPath && existsSync(f.logoPath)) {
    const logoH = Math.round(w * 0.055);
    const logo = await sharp(f.logoPath)
      .resize({ height: logoH, width: Math.round(w * 0.25), fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });
    layers.push({ input: logo.data, left: w - margin - logo.info.width, top: margin });
    headerBottom = Math.max(headerBottom, margin + logo.info.height);
  }

  const stripH = Math.max(8, Math.round(w * 0.008));
  let footerTop = h - margin;
  if (footer.left) {
    const t = await textImage(escapeMarkup(footer.left), { font, size: small, color: theme.muted, width: contentW / 2 });
    footerTop = Math.min(footerTop, h - margin - t.height);
    layers.push({ input: t.data, left: margin, top: h - margin - t.height });
  }
  if (footer.swipe) {
    const t = await textImage("SWIPE →", { font, size: small, color: theme.accent, width: contentW / 2, bold: true, letterSpacing: 2 });
    footerTop = Math.min(footerTop, h - margin - t.height);
    layers.push({ input: t.data, left: w - margin - t.width, top: h - margin - t.height });
  }
  layers.push({ input: rect(w, stripH, theme.accent), left: 0, top: h - stripH });

  const gap = Math.round(w * 0.05);
  return {
    w, h, margin, contentW, layers,
    contentTop: headerBottom + gap,
    contentBottom: footerTop - gap,
  };
}

async function compose(fr: Frame, theme: Theme, content: OverlayOptions[]): Promise<Buffer> {
  return sharp({ create: { width: fr.w, height: fr.h, channels: 4, background: theme.background } })
    .composite([...fr.layers, ...content])
    .png()
    .toBuffer();
}

async function page(
  f: FrameInput,
  footer: { left?: string; swipe?: boolean },
  build: (s: number, fr: Frame) => Promise<Piece[]>,
): Promise<PageRender> {
  const fr = await frame(f, footer);
  // Tall canvases (9:16) have room to set type larger than the 4:5 baseline.
  const maxScale = fr.h / fr.w > 1.5 ? 1.3 : 1;
  const fit = await fitStack((s) => build(s, fr), fr.contentBottom - fr.contentTop, maxScale);
  const content = await placeStack(fit.pieces, fr.margin, fr.contentTop, fr.contentBottom);
  return {
    image: await compose(fr, f.theme, content),
    width: fr.w,
    height: fr.h,
    fits: fit.fits,
    note: `scale ${fit.scale.toFixed(2)}`,
  };
}

/* --------------------------------------------------------------- carousel */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Cover + one page per section; the last page carries the CTA button. */
export async function renderInsightCarousel(
  f: FrameInput,
  title: string,
  outline: CarouselOutline,
  cta: string,
): Promise<PageRender[]> {
  const { theme, font } = f;
  const total = outline.sections.length + 1;
  const pages: PageRender[] = [];

  pages.push(
    await page(f, { left: `01 / ${pad2(total)}`, swipe: true }, async (s, fr) => {
      const out: Piece[] = [
        piece([{ input: rect(Math.round(fr.w * 0.08), Math.round(fr.w * 0.008), theme.accent, 4), left: 0, top: 0, width: Math.round(fr.w * 0.08), height: Math.round(fr.w * 0.008) }], 0),
      ];
      const size = Math.round(fr.w * 0.095 * s);
      out.push(piece([await text(escapeMarkup(title), { font, size, color: theme.text, width: fr.contentW, bold: true, spacing: size * 0.12 })], Math.round(fr.w * 0.04 * s)));
      if (outline.subtitle) {
        const sub = Math.round(fr.w * 0.045 * s);
        out.push(piece([await text(escapeMarkup(outline.subtitle), { font, size: sub, color: bodyColor(theme), width: fr.contentW, spacing: sub * 0.35 })], Math.round(fr.w * 0.03 * s)));
      }
      return out;
    }),
  );

  for (const [i, sec] of outline.sections.entries()) {
    const n = i + 2;
    const last = n === total;
    pages.push(
      await page(f, { left: `${pad2(n)} / ${pad2(total)}`, swipe: !last }, async (s, fr) => {
        const out: Piece[] = [];
        if (sec.label) {
          const ls = Math.round(fr.w * 0.03 * Math.max(s, 0.8));
          out.push(piece([await text(escapeMarkup(`${pad2(n)} — ${sec.label.toUpperCase()}`), { font, size: ls, color: theme.accent, width: fr.contentW, bold: true, letterSpacing: 2 })], 0));
        }
        const hs = Math.round(fr.w * 0.076 * s);
        out.push(piece([await text(escapeMarkup(sec.headline), { font, size: hs, color: theme.text, width: fr.contentW, bold: true, spacing: hs * 0.12 })], Math.round(fr.w * 0.03 * s)));
        const bs = Math.round(fr.w * 0.042 * s);
        for (const [pi, para] of sec.paragraphs.entries()) {
          out.push(piece([await text(escapeMarkup(para), { font, size: bs, color: bodyColor(theme), width: fr.contentW, spacing: bs * 0.35 })], Math.round(fr.w * (pi ? 0.025 : 0.045) * s)));
        }
        for (const [bi, b] of sec.bullets.entries()) {
          const marker = Math.round(bs * 0.42);
          const indent = Math.round(bs * 1.15);
          const t = await text(escapeMarkup(b), { font, size: bs, color: theme.text, width: fr.contentW - indent, spacing: bs * 0.3 }, indent);
          out.push(piece([
            { input: rect(marker, marker, theme.accent, marker * 0.2), left: 0, top: Math.round(bs * 0.42), width: marker, height: marker },
            t,
          ], Math.round(fr.w * (bi ? 0.022 : 0.04) * s)));
        }
        if (last && cta.trim()) {
          const cs = Math.round(fr.w * 0.034 * s);
          const label = await textImage(escapeMarkup(`${cta.trim()} →`), { font, size: cs, color: onAccent(theme), width: fr.contentW * 0.8, bold: true });
          const px = Math.round(cs * 1.4);
          const py = Math.round(cs * 0.8);
          const pw = label.width + px * 2;
          const ph = label.height + py * 2;
          out.push(piece([
            { input: rect(pw, ph, theme.accent, ph / 2), left: 0, top: 0, width: pw, height: ph },
            { input: label.data, left: px, top: py, width: label.width, height: label.height },
          ], Math.round(fr.w * 0.05 * s)));
        }
        return out;
      }),
    );
  }
  return pages;
}

/* ------------------------------------------------------------------ tips */

export async function renderTipsCard(f: FrameInput, title: string, items: string[]): Promise<PageRender> {
  const { theme, font } = f;
  return page(f, { left: f.handle }, async (s, fr) => {
    const ts = Math.round(fr.w * 0.068 * s);
    const out: Piece[] = [
      piece([await text(escapeMarkup(title), { font, size: ts, color: theme.text, width: fr.contentW, bold: true, spacing: ts * 0.12 })], 0),
    ];
    const is = Math.round(fr.w * 0.042 * s);
    const numW = Math.round(is * 2.1);
    for (const [i, item] of items.entries()) {
      const num = await text(pad2(i + 1), { font, size: Math.round(is * 1.05), color: theme.accent, width: numW, bold: true });
      const body = await text(escapeMarkup(item), { font, size: is, color: theme.text, width: fr.contentW - numW, spacing: is * 0.3 }, numW);
      out.push(piece([num, body], Math.round(fr.w * (i ? 0.03 : 0.05) * s)));
    }
    return out;
  });
}

/* ------------------------------------------------------------ comparison */

export async function renderComparisonCard(f: FrameInput, title: string, pairs: Pairs): Promise<PageRender> {
  const { theme, font } = f;
  return page(f, { left: f.handle }, async (s, fr) => {
    const gutter = Math.round(fr.w * 0.05);
    const colW = Math.round((fr.contentW - gutter) / 2);
    const rightX = colW + gutter;
    const ts = Math.round(fr.w * 0.062 * s);
    const out: Piece[] = [
      piece([await text(escapeMarkup(title), { font, size: ts, color: theme.text, width: fr.contentW, bold: true, spacing: ts * 0.12 })], 0),
    ];

    const hs = Math.round(fr.w * 0.03 * Math.max(s, 0.8));
    const hl = await text(escapeMarkup(pairs.leftLabel.toUpperCase()), { font, size: hs, color: theme.muted, width: colW, bold: true, letterSpacing: 2 });
    const hr = await text(escapeMarkup(pairs.rightLabel.toUpperCase()), { font, size: hs, color: theme.accent, width: colW, bold: true, letterSpacing: 2 }, rightX);
    out.push(piece([hl, hr], Math.round(fr.w * 0.05 * s)));

    const rs = Math.round(fr.w * 0.037 * s);
    const rule = mix(theme.text, theme.background, 0.82);
    const ruleH = Math.max(2, Math.round(fr.w * 0.002));
    const rowGap = Math.round(fr.w * 0.026 * s);
    for (const row of pairs.rows) {
      const l = await text(escapeMarkup(row.left), { font, size: rs, color: theme.muted, width: colW, spacing: rs * 0.3 });
      const r = await text(escapeMarkup(row.right), { font, size: rs, color: theme.text, width: colW, spacing: rs * 0.3 }, rightX);
      l.top = r.top = ruleH + rowGap;
      out.push(piece([
        { input: rect(fr.contentW, ruleH, rule), left: 0, top: 0, width: fr.contentW, height: ruleH },
        l,
        r,
      ], rowGap));
    }
    return out;
  });
}
