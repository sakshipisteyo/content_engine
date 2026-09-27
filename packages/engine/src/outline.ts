/**
 * Plain-text outlines for the multi-part typographic layouts. The format is meant to be
 * typed by hand in the Create form (or drafted by the copy model), and stays readable in
 * the brief YAML:
 *
 *   carousel     subtitle lines, then one "## Label | Headline" block per page, with
 *                paragraph lines and "- bullet" lines under it
 *   list         one item per line ("- ", "1. " prefixes optional)
 *   pairs        "Myth: ..." / "Fact: ..." lines, alternating (any two labels)
 */

export class OutlineError extends Error {}

export interface CarouselSection {
  label: string | null;
  headline: string;
  paragraphs: string[];
  bullets: string[];
}

export interface CarouselOutline {
  subtitle: string;
  sections: CarouselSection[];
}

export const MAX_CAROUSEL_SECTIONS = 9;
export const MAX_LIST_ITEMS = 8;
export const MAX_PAIRS = 5;

const BULLET = /^(?:[-*•]|\d{1,2}[.)])\s+/;

function lines(body: string): string[] {
  return body.split(/\r?\n/).map((l) => l.trim());
}

export function parseCarousel(body: string): CarouselOutline {
  const subtitle: string[] = [];
  const sections: CarouselSection[] = [];
  for (const line of lines(body)) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      const head = line.slice(3).trim();
      const bar = head.indexOf("|");
      const label = bar >= 0 ? head.slice(0, bar).trim() || null : null;
      const headline = (bar >= 0 ? head.slice(bar + 1) : head).trim();
      if (!headline) throw new OutlineError(`section "${line}" has no headline`);
      sections.push({ label, headline, paragraphs: [], bullets: [] });
      continue;
    }
    const current = sections[sections.length - 1];
    if (!current) {
      subtitle.push(line.replace(/^#\s+/, ""));
    } else if (BULLET.test(line)) {
      current.bullets.push(line.replace(BULLET, ""));
    } else {
      current.paragraphs.push(line);
    }
  }
  if (sections.length === 0) {
    throw new OutlineError('add at least one page: a line starting "## Label | Headline"');
  }
  if (sections.length > MAX_CAROUSEL_SECTIONS) {
    throw new OutlineError(`at most ${MAX_CAROUSEL_SECTIONS} pages after the cover (got ${sections.length})`);
  }
  return { subtitle: subtitle.join(" "), sections };
}

export function parseList(body: string): string[] {
  const items = lines(body)
    .filter(Boolean)
    .map((l) => l.replace(BULLET, ""))
    .filter(Boolean);
  if (items.length < 2) throw new OutlineError("add at least 2 items, one per line");
  if (items.length > MAX_LIST_ITEMS) {
    throw new OutlineError(`at most ${MAX_LIST_ITEMS} items fit one card (got ${items.length})`);
  }
  return items;
}

export interface Pairs {
  leftLabel: string;
  rightLabel: string;
  rows: { left: string; right: string }[];
}

/** "Label: text" split on the first colon; labels are short (<= 20 chars). */
function labelled(line: string): { label: string; text: string } | null {
  const i = line.indexOf(":");
  if (i <= 0 || i > 20) return null;
  const text = line.slice(i + 1).trim();
  return text ? { label: line.slice(0, i).trim(), text } : null;
}

export function parsePairs(body: string): Pairs {
  const parsed = lines(body)
    .filter(Boolean)
    .map((l) => {
      const p = labelled(l);
      if (!p) throw new OutlineError(`"${l}" needs a label, e.g. "Myth: ..." or "Fact: ..."`);
      return p;
    });
  if (parsed.length < 2) throw new OutlineError('add at least one pair: a "Myth: ..." line then a "Fact: ..." line');
  if (parsed.length % 2) throw new OutlineError(`every "${parsed[0]!.label}" line needs a matching second line`);
  const leftLabel = parsed[0]!.label;
  const rightLabel = parsed[1]!.label;
  const rows: Pairs["rows"] = [];
  for (let i = 0; i < parsed.length; i += 2) {
    const l = parsed[i]!;
    const r = parsed[i + 1]!;
    if (l.label.toLowerCase() !== leftLabel.toLowerCase() || r.label.toLowerCase() !== rightLabel.toLowerCase()) {
      throw new OutlineError(`keep the labels alternating "${leftLabel}:" then "${rightLabel}:"`);
    }
    rows.push({ left: l.text, right: r.text });
  }
  if (rows.length > MAX_PAIRS) throw new OutlineError(`at most ${MAX_PAIRS} pairs fit one card (got ${rows.length})`);
  return { leftLabel, rightLabel, rows };
}
