/**
 * Local video editor on the bundled ffmpeg (@ffmpeg-installer, no system install): turns a
 * list of segments — still frames with a camera move, video clips (screen recordings, AI
 * shots), branded title cards — into one MP4 per aspect, with on-brand caption overlays,
 * fades, an optional voiceover and background music. Text is drawn by the typographic
 * renderer (brand font + colours), never by ffmpeg drawtext, so it renders identically on
 * any machine. Works with ffmpeg 4.1 (no xfade): segments fade through the background.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import sharp, { type OverlayOptions } from "sharp";
import { avatarImage, escapeMarkup, textImage, type Theme } from "./typographic";

export type VideoAspect = "16:9" | "9:16" | "1:1";
export const VIDEO_ASPECTS: VideoAspect[] = ["16:9", "9:16", "1:1"];
export const VIDEO_SIZE: Record<VideoAspect, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
};
const FPS = 30;

/** ffmpeg binary: FFMPEG_PATH, else the bundled @ffmpeg-installer binary, else PATH. */
export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const req = createRequire(import.meta.url);
    const p = (req("@ffmpeg-installer/ffmpeg") as { path: string }).path;
    if (p && existsSync(p)) return p;
  } catch {
    /* not installed for this platform */
  }
  return "ffmpeg";
}

export async function ffmpeg(args: string[]): Promise<string> {
  try {
    const r = await execa(ffmpegPath(), ["-hide_banner", "-loglevel", "error", ...args]);
    return r.stderr;
  } catch (e) {
    const err = e as { stderr?: string; shortMessage?: string };
    const last = (err.stderr ?? "").trim().split("\n").slice(-3).join(" | ");
    throw new Error(`ffmpeg failed: ${last || err.shortMessage || String(e)}`);
  }
}

/** Duration in seconds of a media file (from ffmpeg's input banner). */
export async function probeDuration(file: string): Promise<number> {
  let stderr = "";
  try {
    await execa(ffmpegPath(), ["-hide_banner", "-i", file]);
  } catch (e) {
    stderr = (e as { stderr?: string }).stderr ?? ""; // ffmpeg exits 1 with no output file
  }
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) throw new Error(`can't read the duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/* ------------------------------------------------------------------ model */

/** Camera move applied to a still (the local stand-in for an AI camera motion). */
export type CameraMove = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "drift" | "static";

export interface Segment {
  /** image: a still (photo, screenshot); video: a clip; card: a branded title card. */
  kind: "image" | "video" | "card";
  src?: string;
  /** Length on screen. Video defaults to the clip length (from `start`). */
  seconds?: number;
  /** Video: trim start, seconds. */
  start?: number;
  move?: CameraMove;
  /** cover = fill the frame (photos, AI shots); contain = whole picture on the brand ground (screens). */
  fit?: "cover" | "contain";
  caption?: string;
  /** Continue the previous segment without a fade between them (same shot, next caption). */
  joinPrev?: boolean;
  /** card only */
  title?: string;
  subtitle?: string;
}

export interface VideoStyle {
  theme: Theme;
  font: string;
  logoPath?: string;
  /** Brand name for the logo fallback (initial avatar is drawn by the caller if needed). */
  brandName: string;
  /** Small corner mark on non-card segments. */
  watermark?: boolean;
}

export interface AudioTrack {
  path: string;
  volume?: number;
}

/* ------------------------------------------------------------ frames (sharp) */

const solid = (w: number, h: number, color: string) =>
  sharp({ create: { width: w, height: h, channels: 4, background: color } });

/** A still composed to exactly w x h: cover-cropped, or whole on the brand ground. */
export async function composeFrame(
  src: string,
  w: number,
  h: number,
  fit: "cover" | "contain",
  ground: string,
): Promise<Buffer> {
  if (fit === "cover") {
    return sharp(src).rotate().resize(w, h, { fit: "cover", position: "attention" }).png().toBuffer();
  }
  const maxW = Math.round(w * 0.9);
  const maxH = Math.round(h * 0.78);
  const pic = await sharp(src).rotate().resize(maxW, maxH, { fit: "inside", withoutEnlargement: false }).png().toBuffer({
    resolveWithObject: true,
  });
  const r = Math.round(Math.min(w, h) * 0.018);
  const mask = Buffer.from(
    `<svg width="${pic.info.width}" height="${pic.info.height}"><rect width="100%" height="100%" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  const rounded = await sharp(pic.data).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const shadow = await solid(pic.info.width, pic.info.height, "#00000055")
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const left = Math.round((w - pic.info.width) / 2);
  const top = Math.round((h - pic.info.height) / 2 - h * 0.03);
  return solid(w, h, ground)
    .composite([
      { input: await sharp(shadow).blur(18).toBuffer(), left: left + 6, top: top + 14 },
      { input: rounded, left, top },
    ])
    .png()
    .toBuffer();
}

/** Largest text size (step 4px) whose wrapped block fits maxH. */
async function fitText(markup: string, font: string, color: string, width: number, maxSize: number, maxH: number, bold = false) {
  for (let size = maxSize; size >= 20; size -= 4) {
    const t = await textImage(markup, { font, size, color, width, bold, spacing: Math.round(size * 0.18) });
    if (t.height <= maxH) return t;
  }
  return textImage(markup, { font, size: 20, color, width, bold });
}

/** Branded title card (intro / section / outro): logo, title, accent bar, subtitle, centred vertically. */
export async function cardFrame(w: number, h: number, style: VideoStyle, title: string, subtitle?: string): Promise<Buffer> {
  const { theme, font } = style;
  const unit = Math.min(w, h);
  const pad = Math.round(unit * 0.1);
  const width = Math.round((w > h ? w * 0.7 : w) - pad * 2);
  const gap = Math.round(unit * 0.04);
  const blocks: { input: Buffer; width: number; height: number }[] = [];
  if (style.logoPath && existsSync(style.logoPath)) {
    const s = Math.round(unit * 0.13);
    blocks.push({ input: await avatarImage(style.logoPath, s, "#FFFFFF"), width: s, height: s });
  }
  const t = await fitText(escapeMarkup(title), font, theme.text, width, Math.round(unit * 0.1), Math.round(h * 0.38), true);
  blocks.push({ input: t.data, width: t.width, height: t.height });
  const barH = Math.max(6, Math.round(unit * 0.009));
  blocks.push({ input: await solid(Math.round(unit * 0.09), barH, theme.accent).png().toBuffer(), width: Math.round(unit * 0.09), height: barH });
  if (subtitle) {
    const st = await fitText(escapeMarkup(subtitle), font, theme.muted, width, Math.round(unit * 0.045), Math.round(h * 0.2));
    blocks.push({ input: st.data, width: st.width, height: st.height });
  }
  const total = blocks.reduce((a, b) => a + b.height, 0) + gap * (blocks.length - 1);
  let y = Math.round((h - total) / 2);
  const layers: OverlayOptions[] = [];
  for (const b of blocks) {
    layers.push({ input: b.input, left: pad, top: y });
    y += b.height + gap;
  }
  return solid(w, h, theme.background).composite(layers).png().toBuffer();
}

/** Transparent full-frame overlay: caption box near the bottom + optional corner logo. */
export async function overlayFrame(w: number, h: number, style: VideoStyle, caption?: string, watermark = false): Promise<Buffer> {
  const layers: OverlayOptions[] = [];
  const unit = Math.min(w, h);
  if (caption?.trim()) {
    const boxW = Math.round(w * (w > h ? 0.72 : 0.86));
    const padX = Math.round(unit * 0.035);
    const padY = Math.round(unit * 0.022);
    const t = await fitText(escapeMarkup(caption.trim()), style.font, "#FFFFFF", boxW - padX * 2, Math.round(unit * 0.046), Math.round(h * 0.16), true);
    const bw = t.width + padX * 2;
    const bh = t.height + padY * 2;
    const r = Math.round(unit * 0.02);
    const box = Buffer.from(
      `<svg width="${bw}" height="${bh}"><rect width="100%" height="100%" rx="${r}" ry="${r}" fill="#000000" fill-opacity="0.62"/><rect x="0" y="${bh - Math.max(4, Math.round(unit * 0.006))}" width="${bw}" height="${Math.max(4, Math.round(unit * 0.006))}" fill="${style.theme.accent}"/></svg>`,
    );
    // Keep clear of platform UI: 9:16 apps cover the bottom ~20%.
    const bottom = h > w ? Math.round(h * 0.22) : Math.round(h * 0.08);
    const left = Math.round((w - bw) / 2);
    const top = h - bottom - bh;
    layers.push({ input: box, left, top }, { input: t.data, left: left + padX, top: top + padY });
  }
  if (watermark && style.logoPath && existsSync(style.logoPath)) {
    const s = Math.round(unit * 0.07);
    layers.push({ input: await avatarImage(style.logoPath, s, "#FFFFFF"), left: w - s - Math.round(unit * 0.04), top: Math.round(unit * 0.04) });
  }
  return solid(w, h, "#00000000").composite(layers).png().toBuffer();
}

/* --------------------------------------------------------------- segments */

function zoompanExpr(move: CameraMove, frames: number): string {
  const n = Math.max(1, frames - 1);
  const centre = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  switch (move) {
    case "zoom-in":
      return `z='1+0.12*on/${n}':${centre}`;
    case "zoom-out":
      return `z='1.12-0.12*on/${n}':${centre}`;
    case "pan-left":
      return `z='1.12':x='(iw-iw/zoom)*(1-on/${n})':y='ih/2-(ih/zoom/2)'`;
    case "pan-right":
      return `z='1.12':x='(iw-iw/zoom)*on/${n}':y='ih/2-(ih/zoom/2)'`;
    case "drift": // gentle push-in that keeps text near the edges in frame
      return `z='1+0.035*on/${n}':${centre}`;
    default:
      return `z='1':${centre}`;
  }
}

const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS)];

function fades(seconds: number, fade: number, fadeIn = true, fadeOut = true): string {
  const f = Math.min(fade, seconds / 3);
  const parts = [
    ...(fadeIn ? [`fade=t=in:st=0:d=${f.toFixed(2)}`] : []),
    ...(fadeOut ? [`fade=t=out:st=${(seconds - f).toFixed(2)}:d=${f.toFixed(2)}`] : []),
  ];
  return parts.length ? parts.join(",") : "null";
}

/** Render one segment to a silent MP4 of exactly w x h. Returns its length in seconds. */
async function renderSegment(seg: Segment, w: number, h: number, style: VideoStyle, out: string, work: string, idx: number, fadeOut = true): Promise<number> {
  const fadeIn = !seg.joinPrev;
  const overlayPath = join(work, `ov${idx}.png`);
  writeFileSync(overlayPath, await overlayFrame(w, h, style, seg.caption, style.watermark && seg.kind !== "card"));

  if (seg.kind === "video") {
    if (!seg.src) throw new Error("video segment needs src");
    const start = seg.start ?? 0;
    const seconds = seg.seconds ?? Math.max(0.5, (await probeDuration(seg.src)) - start);
    const fit = seg.fit ?? "cover";
    const scale =
      fit === "cover"
        ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
        : `scale=${Math.round(w * 0.92)}:${Math.round(h * 0.8)}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${style.theme.background}`;
    await ffmpeg([
      "-y", "-ss", String(start), "-t", seconds.toFixed(2), "-i", seg.src, "-i", overlayPath,
      "-filter_complex",
      `[0:v]${scale},fps=${FPS},setsar=1,tpad=stop_mode=clone:stop_duration=${seconds.toFixed(2)}[b];[b][1:v]overlay=0:0,trim=duration=${seconds.toFixed(2)},${fades(seconds, 0.35, fadeIn, fadeOut)},format=yuv420p[v]`,
      "-map", "[v]", "-an", ...ENCODE, out,
    ]);
    return seconds;
  }

  const seconds = seg.seconds ?? 4;
  const framePng =
    seg.kind === "card"
      ? await cardFrame(w, h, style, seg.title ?? "", seg.subtitle)
      : await composeFrame(seg.src!, w, h, seg.fit ?? "cover", style.theme.background);
  // Upscale 2x before zoompan so the move is smooth (zoompan rounds to whole pixels).
  const framePath = join(work, `fr${idx}.png`);
  await sharp(framePng).resize(w * 2, h * 2).png().toFile(framePath);
  const frames = Math.round(seconds * FPS);
  const move = seg.move ?? (seg.kind === "card" ? "zoom-in" : "zoom-in");
  const z = seg.kind === "card" ? `z='1+0.03*on/${Math.max(1, frames - 1)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` : zoompanExpr(move, frames);
  await ffmpeg([
    "-y", "-i", framePath, "-i", overlayPath,
    "-filter_complex",
    `[0:v]zoompan=${z}:d=${frames}:s=${w}x${h}:fps=${FPS},setsar=1[b];[b][1:v]overlay=0:0,${fades(seconds, 0.35, fadeIn, fadeOut)},format=yuv420p[v]`,
    "-map", "[v]", "-frames:v", String(frames), ...ENCODE, out,
  ]);
  return seconds;
}

/* ----------------------------------------------------------------- render */

export interface RenderVideoInput {
  segments: Segment[];
  aspect: VideoAspect;
  style: VideoStyle;
  outPath: string;
  workDir: string;
  voice?: AudioTrack;
  music?: AudioTrack;
}

export interface RenderVideoResult {
  path: string;
  seconds: number;
  posterPath: string;
}

/** Render segments into one MP4 (H.264 + AAC, faststart) and a poster JPEG. */
export async function renderVideo(input: RenderVideoInput): Promise<RenderVideoResult> {
  const { w, h } = VIDEO_SIZE[input.aspect];
  const work = join(input.workDir, input.aspect.replace(":", "x"));
  mkdirSync(work, { recursive: true });
  if (!input.segments.length) throw new Error("a video needs at least one segment");

  const parts: string[] = [];
  let total = 0;
  for (let i = 0; i < input.segments.length; i++) {
    const out = join(work, `seg${String(i).padStart(2, "0")}.mp4`);
    const fadeOut = !input.segments[i + 1]?.joinPrev;
    total += await renderSegment(input.segments[i]!, w, h, input.style, out, work, i, fadeOut);
    parts.push(out);
  }
  const list = join(work, "list.txt");
  // Forward slashes: the concat list must not contain Windows backslashes (escape chars).
  writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const silent = join(work, "silent.mp4");
  await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);

  const T = total.toFixed(2);
  const args = ["-y", "-i", silent];
  const chains: string[] = [];
  const mixIn: string[] = [];
  if (input.voice) {
    args.push("-i", input.voice.path);
    chains.push(`[${args.filter((a) => a === "-i").length - 1}:a]volume=${input.voice.volume ?? 1},apad,atrim=0:${T}[vo]`);
    mixIn.push("[vo]");
  }
  if (input.music) {
    args.push("-stream_loop", "-1", "-i", input.music.path);
    const n = args.filter((a) => a === "-i").length - 1;
    const fadeOut = Math.max(0, total - 2).toFixed(2);
    chains.push(`[${n}:a]volume=${input.music.volume ?? (input.voice ? 0.15 : 0.6)},atrim=0:${T},afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2[mu]`);
    mixIn.push("[mu]");
  }
  if (mixIn.length) {
    const mix = mixIn.length === 2 ? `${chains.join(";")};[vo][mu]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]` : `${chains.join(";")};${mixIn[0]}anull[a]`;
    args.push("-filter_complex", mix, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", T);
  } else {
    // A silent AAC track: some upload tools reject videos with no audio stream at all.
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    args.push("-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "64k", "-t", T);
  }
  args.push("-movflags", "+faststart", input.outPath);
  await ffmpeg(args);

  const posterPath = input.outPath.replace(/\.mp4$/, ".jpg");
  await ffmpeg(["-y", "-ss", String(Math.min(1.2, total / 2)), "-i", input.outPath, "-frames:v", "1", "-q:v", "3", posterPath]);
  return { path: input.outPath, seconds: total, posterPath };
}

/** Still clip for one image (used for draft stand-ins of AI shots). */
export async function stillToClip(src: string, out: string, seconds: number, move: CameraMove, w: number, h: number): Promise<void> {
  const frame = join(out + ".frame.png");
  await sharp(src).rotate().resize(w * 2, h * 2, { fit: "cover", position: "attention" }).png().toFile(frame);
  const frames = Math.round(seconds * FPS);
  await ffmpeg([
    "-y", "-i", frame,
    "-filter_complex", `[0:v]zoompan=${zoompanExpr(move, frames)}:d=${frames}:s=${w}x${h}:fps=${FPS},setsar=1,format=yuv420p[v]`,
    "-map", "[v]", "-frames:v", String(frames), ...ENCODE, out,
  ]);
}
