/**
 * Auto-extract a brand palette from uploaded images (logo + product shots) with k-means
 * over sampled pixels. sharp only — no provider keys. Used by the brand onboarding wizard.
 */
import { sampleColors, type RGB } from "./score";

const FALLBACK = ["#B5471F", "#D9C3A3", "#2F5D50", "#1C1A17"];

function toHex(c: RGB): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}
function dist(a: RGB, b: RGB): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

/** Return n dominant #RRGGBB colours (by cluster size), deterministic. */
export async function extractPalette(imagePaths: string[], n = 4): Promise<string[]> {
  const pts: RGB[] = [];
  for (const p of imagePaths) {
    try {
      pts.push(...(await sampleColors(p, 24)));
    } catch {
      /* skip unreadable image */
    }
  }
  if (pts.length === 0) return FALLBACK.slice(0, n);

  // Seed centroids spread across the luminance range for a stable result.
  const sorted = [...pts].sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
  let centroids: RGB[] = [];
  for (let i = 0; i < n; i++) {
    centroids.push(sorted[Math.floor(((i + 0.5) / n) * sorted.length)] ?? sorted[0]!);
  }

  for (let iter = 0; iter < 12; iter++) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, c: 0 }));
    for (const pt of pts) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const d = dist(pt, centroids[i]!);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      const s = sums[bi]!;
      s.r += pt.r;
      s.g += pt.g;
      s.b += pt.b;
      s.c += 1;
    }
    centroids = sums.map((s, i) =>
      s.c ? { r: s.r / s.c, g: s.g / s.c, b: s.b / s.c } : centroids[i]!,
    );
  }

  // Order by cluster size, drop near-duplicates, pad to n.
  const counts = centroids.map(() => 0);
  for (const pt of pts) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const d = dist(pt, centroids[i]!);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    counts[bi]! += 1;
  }
  const ordered = centroids
    .map((c, i) => ({ hex: toHex(c), n: counts[i]! }))
    .sort((a, b) => b.n - a.n);

  const out: string[] = [];
  for (const o of ordered) if (!out.includes(o.hex)) out.push(o.hex);
  let f = 0;
  while (out.length < n) out.push(FALLBACK[f++ % FALLBACK.length]!);
  return out.slice(0, n);
}
