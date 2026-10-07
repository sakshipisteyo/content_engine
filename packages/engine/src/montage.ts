/**
 * Montage renderer: video posts edited from the brand's real media plus Higgsfield shots.
 *
 *   walkthrough   real screenshots / screen recordings, step captions          (no AI needed)
 *   product-demo  product photos animated with Higgsfield DoP camera motions
 *   cinematic     AI scenes: Soul image from a description, animated by DoP
 *   presenter     a person photo speaking the script: ElevenLabs voice + Higgsfield Speak
 *
 * Every video gets a branded intro and outro card, on-brand captions and the brand's
 * music/voice when given, rendered by the local editor (video.ts) in 16:9, 9:16 and 1:1.
 *
 * Two modes. "draft" is free and local: AI shots are stood in by camera moves on the
 * source photo (or a labelled card), so the edit, captions and timing can be reviewed
 * before spending credits. "full" calls Higgsfield (and ElevenLabs for voice) within the
 * brief's credit cap. AI can't reproduce a client's real UI, so walkthroughs always use
 * the uploaded screens; Higgsfield adds cinematic shots and presenters around them.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import sharp from "sharp";
import type { Brand, Brief, Routes, ScoreCard, Template, VideoKind } from "./schemas";
import { DATA_ROOT, PATHS, loadEnv } from "./config";
import { brandAssetPath } from "./compile";
import { downloadToFile } from "./media";
import { withDisclaimer } from "./text";
import { writeCaption } from "./assemble";
import { brandHandle, quoteThemes, registerFont, DEFAULT_FONT } from "./typographic";
import {
  VIDEO_SIZE,
  ffmpeg,
  probeDuration,
  renderVideo,
  type CameraMove,
  type Segment,
  type VideoAspect,
  type VideoStyle,
} from "./video";
import { now, type Ledger } from "./ledger";

export type MontageMode = "draft" | "full";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".tif", ".tiff"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
export const isImage = (p: string) => IMAGE_EXT.has(extname(p).toLowerCase());
export const isVideo = (p: string) => VIDEO_EXT.has(extname(p).toLowerCase());

/** Friendly camera moves people pick; names are matched against Higgsfield's live preset list. */
export const CAMERA_MOVES = ["dolly in", "orbit", "zoom in", "pan right", "crane up", "dolly out", "pan left", "static"];

/** Local stand-in for a named camera move (draft mode). */
function localMove(name: string | undefined, i: number): CameraMove {
  const n = (name ?? "").toLowerCase();
  if (/out|pull/.test(n)) return "zoom-out";
  if (/left/.test(n)) return "pan-left";
  if (/right|orbit|truck/.test(n)) return "pan-right";
  if (/static|still|lock/.test(n)) return "static";
  if (n) return "zoom-in";
  return (["zoom-in", "pan-right", "zoom-out", "pan-left"] as const)[i % 4]!;
}

/* ------------------------------------------------------------------ plan */

export interface PlannedShot {
  /** media: an upload; card: a branded card; ai-*: generated in full mode. */
  type: "media" | "card" | "ai-animate" | "ai-scene" | "ai-presenter";
  src?: string;
  /** Video clip trim (seconds), for timestamped walkthrough lines. */
  start?: number;
  end?: number;
  caption?: string;
  title?: string;
  subtitle?: string;
  /** Friendly camera move for ai-animate / local stand-in. */
  move?: string;
  /** Scene description (ai-scene) or spoken text (ai-presenter). */
  prompt?: string;
  seconds: number;
  fit: "cover" | "contain";
}

export interface MontagePlan {
  kind: VideoKind;
  shots: PlannedShot[];
  aspects: VideoAspect[];
  /** Words to speak over the video (full mode, when a voice is available). */
  narration: string;
  /** Higgsfield credits a full render would spend. */
  estimate: number;
}

export class MontageError extends Error {}

const splitLines = (s: string | undefined) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentencesOf = (s: string) => s.match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? [s];

/** "0:05-0:12", "5-12", "1:02:03 - 1:02:10" -> seconds. */
export function parseRange(s: string): { start: number; end: number } | null {
  const m = /^(\d+(?::\d{1,2}){0,2}(?:\.\d+)?)\s*[-–]\s*(\d+(?::\d{1,2}){0,2}(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  const sec = (t: string) => t.split(":").reduce((a, p) => a * 60 + Number(p), 0);
  const start = sec(m[1]!);
  const end = sec(m[2]!);
  return end > start ? { start, end } : null;
}

/** "Title | detail" -> caption text. */
function captionOf(line: string): { left: string; right?: string } {
  const [left, ...rest] = line.split("|");
  const right = rest.join("|").trim();
  return { left: left!.trim(), ...(right ? { right } : {}) };
}

/** Reading time for a caption: 3.5 s minimum, ~2.8 words per second, 8 s maximum. */
const readSeconds = (caption?: string) => Math.min(8, Math.max(3.5, 1.5 + words(caption ?? "") / 2.8));

const DEFAULT_ASPECTS: Record<VideoKind, VideoAspect[]> = {
  walkthrough: ["16:9", "9:16", "1:1"],
  "product-demo": ["9:16", "1:1", "16:9"],
  cinematic: ["16:9", "9:16", "1:1"],
  presenter: ["9:16", "1:1", "16:9"],
};

/** Absolute path for a brief media path (stored relative to DATA_ROOT). */
export const dataPath = (p: string) => (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) ? p : join(DATA_ROOT, p));

export function brandImages(brand: Brand, brandKey: string): string[] {
  const rels = [
    ...Object.values(brand.products).flatMap((p) => p.images),
    ...Object.values(brand.style_anchors).flatMap((a) => a.references),
  ];
  // A logo is not a photo: as a background or AI reference it gets painted into the scene.
  const logos = new Set([brand.logo, brand.social?.avatar].filter(Boolean));
  return [...new Set(rels)]
    .filter((r) => !logos.has(r))
    .map((r) => brandAssetPath(brandKey, r))
    .filter((p) => existsSync(p) && isImage(p));
}

/**
 * Plan the edit from the brief (pure apart from probing nothing): which shots, in what
 * order, with what captions, and what a full render would cost.
 */
export function planMontage(brief: Brief, brand: Brand, brandKey: string, template: Template, routes: Routes): MontagePlan {
  const kind = template.video_kind!;
  const media = (brief.media ?? []).map(dataPath);
  const lines = splitLines(brief.body);
  const shots: PlannedShot[] = [];
  const clipLen = routes.video.duration_seconds;
  let estimate = 0;

  if (kind === "walkthrough") {
    if (!media.length) throw new MontageError("upload the screenshots or screen recording to walk through");
    const recording = media.find(isVideo);
    const queue = [...media];
    for (const line of lines) {
      const { left, right } = captionOf(line);
      const range = parseRange(left);
      if (range) {
        if (!recording) throw new MontageError(`"${left}" is a time range, but no screen recording was uploaded`);
        shots.push({ type: "media", src: recording, start: range.start, end: range.end, caption: right, seconds: range.end - range.start, fit: "contain" });
        continue;
      }
      const src = queue.shift();
      if (!src) break; // more steps than screens: extra steps are ignored
      const caption = right ? `${left} — ${right}` : left;
      shots.push({ type: "media", src, caption, seconds: isVideo(src) ? 0 : readSeconds(caption), fit: "contain" });
    }
    // Screens without a step line still show, uncaptioned (unless the recording was cut by ranges).
    for (const src of queue) {
      if (src === recording && shots.some((s) => s.src === recording)) continue;
      shots.push({ type: "media", src, seconds: isVideo(src) ? 0 : 4, fit: "contain" });
    }
  } else if (kind === "product-demo") {
    const pool = media.length ? media : brandImages(brand, brandKey);
    if (!pool.length) throw new MontageError("upload product photos (or add photos to the brand) to animate");
    const rows = lines.length ? lines : pool.map(() => "");
    rows.forEach((line, i) => {
      const { left, right } = captionOf(line);
      const src = pool[i % pool.length]!;
      if (isVideo(src)) {
        shots.push({ type: "media", src, caption: left || undefined, seconds: 0, fit: "cover" });
        return;
      }
      const move = right || CAMERA_MOVES[i % 5]!;
      shots.push({ type: "ai-animate", src, caption: left || undefined, move, seconds: clipLen, fit: "cover" });
      estimate += clipLen * routes.video.credits_per_second;
    });
  } else if (kind === "cinematic") {
    if (!lines.length) throw new MontageError('describe the scenes, one per line: "Scene description | on-screen text"');
    const pool = media.length ? media : brandImages(brand, brandKey);
    lines.forEach((line, i) => {
      const { left, right } = captionOf(line);
      shots.push({
        type: "ai-scene",
        prompt: left,
        caption: right,
        ...(pool.length ? { src: pool[i % pool.length] } : {}),
        move: CAMERA_MOVES[i % 5],
        seconds: clipLen,
        fit: "cover",
      });
      estimate += routes.image.credits_per_image + clipLen * routes.video.credits_per_second;
    });
  } else {
    const script = (brief.body ?? "").trim();
    if (!script) throw new MontageError("write the script the presenter will say");
    if (!brief.presenter) throw new MontageError("upload a photo of the presenter (a clear, front-facing portrait)");
    // Speak clips are 5, 10 or 15 s; split the script into chunks of <= ~38 words.
    const sentences = sentencesOf(script);
    const chunks: string[] = [];
    for (const s of sentences) {
      const last = chunks[chunks.length - 1];
      if (last && words(last) + words(s) <= 38) chunks[chunks.length - 1] = `${last} ${s}`;
      else chunks.push(s);
    }
    for (const c of chunks) {
      const secs = Math.max(3, words(c) / 2.6);
      const bucket = secs <= 5 ? 5 : secs <= 10 ? 10 : 15;
      shots.push({ type: "ai-presenter", src: dataPath(brief.presenter), prompt: c, caption: c, seconds: Math.min(secs, bucket), fit: "cover" });
      estimate += bucket * (routes.speak?.credits_per_second ?? 0);
    }
    for (const src of media) shots.push({ type: "media", src, seconds: isVideo(src) ? 0 : 4, fit: "cover" });
  }

  const intro: PlannedShot = {
    type: "card",
    // *stars* emphasise words on photo posts; the video card draws plain text.
    title: brief.hook.replace(/\*([^*\n]+)\*/g, "$1"),
    // A real angle (not the template-name default) is worth showing; the offer only when it
    // reads like a tagline — a long intake description looks like notes on screen.
    ...(brief.angle !== template.name
      ? { subtitle: brief.angle }
      : brand.offer && brand.offer.length <= 60
        ? { subtitle: brand.offer }
        : {}),
    seconds: 3,
    fit: "cover",
  };
  const site = brand.website?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const outro: PlannedShot = { type: "card", title: brief.cta, subtitle: site ?? brandHandle(brand), seconds: 3.5, fit: "cover" };
  const narration =
    kind === "presenter" ? "" : shots.map((s) => s.caption).filter(Boolean).join(". ").replace(/\.\./g, ".");
  return { kind, shots: [intro, ...shots, outro], aspects: DEFAULT_ASPECTS[kind], narration, estimate };
}

/* ------------------------------------------------------------------- run */

export interface MontageCtx {
  brandKey: string;
  brand: Brand;
  routes: Routes;
  ledger: Ledger;
  runId: string;
}

export interface MontageResult {
  brief_id: string;
  status: "ok" | "capped" | "failed";
  spent_credits: number;
  survivors: number;
  mode: MontageMode;
  seconds: number;
}

export function higgsfieldReady(): boolean {
  loadEnv();
  return !!process.env.HIGGSFIELD_API_KEY?.trim();
}
function voiceId(brand: Brand): string | null {
  loadEnv();
  if (!process.env.ELEVENLABS_API_KEY?.trim()) return null;
  if (brand.voice_id && !brand.voice_id.startsWith("REPLACE")) return brand.voice_id;
  return process.env.ELEVENLABS_VOICE_ID || null;
}
export const voiceReady = (brand: Brand) => !!voiceId(brand);

function videoStyle(ctx: MontageCtx): VideoStyle {
  const brand = ctx.brand;
  const themes = quoteThemes(brand);
  const theme = themes.find((t) => t.name === "brand") ?? themes[0]!;
  const ff = brand.font_files;
  if (ff && brand.font) {
    const regular = brandAssetPath(ctx.brandKey, ff.regular);
    const bold = ff.bold ? brandAssetPath(ctx.brandKey, ff.bold) : undefined;
    if (existsSync(regular)) registerFont(brand.font, { regular, bold: bold && existsSync(bold) ? bold : undefined });
  }
  const logo = brandAssetPath(ctx.brandKey, brand.social?.avatar ?? brand.logo);
  return {
    theme,
    font: brand.font && (!ff || existsSync(brandAssetPath(ctx.brandKey, ff.regular))) ? brand.font : DEFAULT_FONT,
    brandName: brand.social?.display_name ?? brand.name,
    ...(existsSync(logo) ? { logoPath: logo } : {}),
    watermark: true,
  };
}

/** Motion presets are fetched once per day and cached in data/. */
async function motionPresets(): Promise<import("./providers/higgsfield").MotionPreset[]> {
  const cache = join(PATHS.data, "higgsfield-motions.json");
  if (existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, "utf8")) as { at: number; list: import("./providers/higgsfield").MotionPreset[] };
    if (Date.now() - c.at < 86_400_000) return c.list;
  }
  const higgs = await import("./providers/higgsfield");
  const list = await higgs.listMotions();
  mkdirSync(PATHS.data, { recursive: true });
  writeFileSync(cache, JSON.stringify({ at: Date.now(), list }, null, 2));
  return list;
}

/** Narration (or a presenter line) as audio; returns the file path. */
async function synthesize(ctx: MontageCtx, text: string, out: string): Promise<string> {
  const eleven = await import("./providers/elevenlabs");
  const audio = await eleven.speak(text, voiceId(ctx.brand)!, { model: ctx.routes.voice.model, outputFormat: ctx.routes.voice.output_format });
  writeFileSync(out, audio);
  return out;
}

/**
 * Render the montage for a brief into out/<id>/v1/: final_<aspect>.mp4 (+ .jpg poster),
 * caption.txt, score.json, montage.json. Draft is free; full spends Higgsfield credits.
 */
export async function runMontage(
  ctx: MontageCtx,
  brief: Brief,
  template: Template,
  caption: { text: string; hashtags: string[] },
  mode: MontageMode,
): Promise<MontageResult> {
  const t0 = Date.now();
  const plan = planMontage(brief, ctx.brand, ctx.brandKey, template, ctx.routes);
  const dir = join(PATHS.out, brief.id, "v1");
  const work = join(dir, "work");
  mkdirSync(work, { recursive: true });
  const record = (stage: "motion" | "hero" | "voice" | "assemble", status: "ok" | "failed" | "capped", credits: number, model: string | null, error?: string) =>
    ctx.ledger.recordStage({
      run_id: ctx.runId,
      brief_id: brief.id,
      variant: 1,
      stage,
      model,
      credits,
      seconds: (Date.now() - t0) / 1000,
      status,
      error: error ?? null,
      started_at: now(),
    });

  if (mode === "full") {
    const needsAi = plan.shots.some((s) => s.type.startsWith("ai-"));
    if (needsAi && !higgsfieldReady()) throw new MontageError("add HIGGSFIELD_API_KEY to .env to render with Higgsfield");
    if (plan.shots.some((s) => s.type === "ai-presenter") && !voiceReady(ctx.brand)) {
      throw new MontageError("presenter videos need ELEVENLABS_API_KEY and a voice (brand voice_id or ELEVENLABS_VOICE_ID)");
    }
    if (plan.estimate > brief.credit_cap) {
      record("motion", "capped", 0, null, `estimate ${plan.estimate} > cap ${brief.credit_cap}`);
      throw new MontageError(`this video needs about ${plan.estimate} credits, over the post's cap of ${brief.credit_cap}`);
    }
  }

  const primary = plan.aspects[0]!;
  const { w: pw, h: ph } = VIDEO_SIZE[primary];
  const segments: Segment[] = [];
  const notes: string[] = [];
  /** Presenter speech (full mode): each Speak clip's voice and its start on the timeline. */
  const presenterVoices: { path: string; at: number }[] = [];
  let spent = 0;
  let motions: import("./providers/higgsfield").MotionPreset[] | null = null;

  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i]!;
    if (s.type === "card") {
      segments.push({ kind: "card", title: s.title, subtitle: s.subtitle, seconds: s.seconds });
      continue;
    }
    if (s.type === "media") {
      if (isVideo(s.src!)) {
        const seconds = s.end !== undefined ? s.end - (s.start ?? 0) : Math.min(90, (await probeDuration(s.src!)) - (s.start ?? 0));
        segments.push({ kind: "video", src: s.src, start: s.start, seconds, fit: s.fit, caption: s.caption });
      } else {
        segments.push({ kind: "image", src: s.src, seconds: s.seconds, fit: s.fit, caption: s.caption, move: s.fit === "contain" ? (i % 2 ? "zoom-out" : "zoom-in") : localMove(s.move, i) });
      }
      continue;
    }

    if (mode === "draft") {
      // Free stand-ins so the edit can be reviewed before spending credits.
      if (s.type === "ai-presenter") {
        // The presenter photo holds while each sentence shows as its own caption.
        sentencesOf(s.prompt!).forEach((line, j) =>
          segments.push({ kind: "image", src: s.src, seconds: Math.max(2, words(line) / 2.6), fit: "cover", caption: line, move: "static", joinPrev: j > 0 }),
        );
        continue;
      }
      if (s.type === "ai-scene" && !s.src) {
        segments.push({ kind: "card", title: s.caption || s.prompt || "", subtitle: `AI scene (draft): ${s.prompt}`, seconds: s.seconds });
      } else {
        segments.push({ kind: "image", src: s.src, seconds: Math.max(3.5, readSeconds(s.caption)), fit: "cover", caption: s.caption, move: localMove(s.move, i) });
      }
      continue;
    }

    // Full mode: Higgsfield.
    const higgs = await import("./providers/higgsfield");
    const clip = join(work, `ai${i}.mp4`);
    try {
      if (s.type === "ai-animate" || s.type === "ai-scene") {
        let imageUrl: string;
        if (s.type === "ai-scene") {
          const style = Object.values(ctx.brand.style_anchors)[0]?.description ?? "";
          const prompt = `${s.prompt}. ${style}. Brand colours ${ctx.brand.palette.join(", ")}. Cinematic, high production value, no text.`;
          const { closestResolution } = await import("./pipeline");
          const img = await higgs.generate(ctx.routes.image.endpoint, {
            prompt,
            width_and_height: closestResolution(primary),
            quality: ctx.routes.image.quality,
            batch_size: 1,
            enhance_prompt: true,
          });
          imageUrl = img.urls[0]!;
          spent += ctx.routes.image.credits_per_image;
          record("hero", "ok", ctx.routes.image.credits_per_image, ctx.routes.image.endpoint);
        } else {
          const framed = await sharp(s.src!).rotate().resize(pw, ph, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toBuffer();
          imageUrl = await higgs.uploadFile(framed, "image/jpeg");
        }
        motions ??= await motionPresets().catch(() => []);
        const preset = s.move ? higgs.pickMotion(motions, s.move) : undefined;
        if (s.move && !preset) notes.push(`no Higgsfield preset matched "${s.move}"; described in the prompt instead`);
        const url = await higgs.animate({
          endpoint: ctx.routes.video.endpoint,
          model: ctx.routes.video.model ?? "dop-turbo",
          imageUrl,
          prompt: `${s.type === "ai-scene" ? s.prompt : "Cinematic product shot"}, ${s.move ?? "smooth camera move"}, ${template.video_directive}`.trim(),
          motionId: preset?.id,
        });
        await downloadToFile(url, clip);
        const credits = ctx.routes.video.duration_seconds * ctx.routes.video.credits_per_second;
        spent += credits;
        record("motion", "ok", credits, ctx.routes.video.endpoint);
        segments.push({ kind: "video", src: clip, fit: "cover", caption: s.caption });
      } else {
        // Presenter: voice -> WAV -> upload; photo -> upload; Speak.
        const mp3 = await synthesize(ctx, s.prompt!, join(work, `vo${i}.mp3`));
        const wav = join(work, `vo${i}.wav`);
        await ffmpeg(["-y", "-i", mp3, "-ar", "44100", "-ac", "1", wav]);
        const len = await probeDuration(wav);
        const bucket = (len <= 5 ? 5 : len <= 10 ? 10 : 15) as 5 | 10 | 15;
        const face = await sharp(s.src!).rotate().resize(pw, ph, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toBuffer();
        const [imageUrl, audioUrl] = await Promise.all([higgs.uploadFile(face, "image/jpeg"), higgs.uploadFile(readFileSync(wav), "audio/wav")]);
        const url = await higgs.presenter({
          endpoint: ctx.routes.speak!.endpoint,
          imageUrl,
          audioUrl,
          prompt: `Professional, warm presenter for ${ctx.brand.name}, speaking to camera`,
          quality: ctx.routes.speak!.quality,
          duration: bucket,
        });
        await downloadToFile(url, clip);
        const credits = bucket * ctx.routes.speak!.credits_per_second;
        spent += credits;
        record("motion", "ok", credits, ctx.routes.speak!.endpoint);
        // The editor drops clip audio, so lay this voice back in where the clip starts.
        presenterVoices.push({ path: wav, at: segments.reduce((a, g) => a + (g.seconds ?? 4), 0) });
        // One clip, cut into a segment per sentence so captions follow the speech.
        const lines = sentencesOf(s.prompt!);
        const total = Math.min(len + 0.3, bucket);
        const totalWords = lines.reduce((a, l) => a + words(l), 0) || 1;
        let at = 0;
        lines.forEach((line, j) => {
          const dur = j === lines.length - 1 ? total - at : (total * words(line)) / totalWords;
          segments.push({ kind: "video", src: clip, start: at, seconds: dur, fit: "cover", caption: line, joinPrev: j > 0 });
          at += dur;
        });
      }
    } catch (e) {
      record("motion", "failed", 0, s.type === "ai-presenter" ? ctx.routes.speak?.endpoint ?? null : ctx.routes.video.endpoint, (e as Error).message);
      throw new MontageError(`Higgsfield shot ${i} failed: ${(e as Error).message}`);
    }
  }

  // Voiceover over the whole edit (full mode, voice available, not presenter videos).
  let voice: string | undefined;
  if (mode === "full" && plan.narration && voiceReady(ctx.brand)) {
    try {
      voice = await synthesize(ctx, plan.narration, join(work, "narration.mp3"));
      record("voice", "ok", 0, ctx.routes.voice.model);
      const length = await probeDuration(voice);
      const fixed = segments.filter((g) => g.kind === "video").reduce((a, g) => a + (g.seconds ?? 5), 0);
      const flexible = segments.filter((g) => g.kind !== "video");
      const flexTotal = flexible.reduce((a, g) => a + (g.seconds ?? 4), 0);
      // Stretch stills and cards so the narration fits, never shrink below the reading time.
      if (length + 1 > fixed + flexTotal && flexTotal > 0) {
        const k = (length + 1 - fixed) / flexTotal;
        for (const g of flexible) g.seconds = (g.seconds ?? 4) * k;
      }
    } catch (e) {
      record("voice", "failed", 0, ctx.routes.voice.model, (e as Error).message);
      notes.push(`voiceover skipped: ${(e as Error).message}`);
      voice = undefined;
    }
  }

  // Presenter videos: the speech is the voice track. renderVideo encodes segments without
  // their audio, so the Speak clips' sound was lost and finished videos came out silent.
  if (!voice && presenterVoices.length) {
    const track = join(work, "presenter_voice.wav");
    const inputs = presenterVoices.flatMap((v) => ["-i", v.path]);
    const delays = presenterVoices.map((v, k) => `[${k}:a]adelay=${Math.round(v.at * 1000)}|${Math.round(v.at * 1000)}[p${k}]`);
    const mix = presenterVoices.length === 1
      ? `${delays[0]!.replace(/\[p0\]$/, "[a]")}`
      : `${delays.join(";")};${presenterVoices.map((_, k) => `[p${k}]`).join("")}amix=inputs=${presenterVoices.length},volume=${presenterVoices.length}[a]`;
    await ffmpeg(["-y", ...inputs, "-filter_complex", mix, "-map", "[a]", "-ar", "44100", "-ac", "2", track]);
    voice = track;
  }

  const style = videoStyle(ctx);
  const music = brief.music ? dataPath(brief.music) : undefined;
  let seconds = 0;
  for (const aspect of plan.aspects) {
    const tag = aspect.replace(":", "x");
    const r = await renderVideo({
      segments,
      aspect,
      style,
      outPath: join(dir, `final_${tag}.mp4`),
      workDir: work,
      ...(voice ? { voice: { path: voice } } : {}),
      ...(music && existsSync(music) ? { music: { path: music } } : {}),
    });
    seconds = r.seconds;
    if (aspect === primary) await sharp(r.posterPath).png().toFile(join(dir, "hero.png"));
  }
  rmSync(work, { recursive: true, force: true });
  writeCaption(dir, withDisclaimer(caption.text, ctx.brand), caption.hashtags);

  const reasons = [
    mode === "draft"
      ? plan.shots.some((s) => s.type.startsWith("ai-"))
        ? `Draft: camera moves stand in for the ${plan.shots.filter((s) => s.type.startsWith("ai-")).length} Higgsfield shot(s) — render with Higgsfield for the real thing (about ${plan.estimate} credits)`
        : "Edited from your uploads — no AI credits needed"
      : `Rendered with Higgsfield — ${spent} credits`,
    `${seconds.toFixed(0)} s · ${plan.aspects.join(", ")}`,
    ...(seconds > 90 ? ["Longer than 90 s: fine for LinkedIn/YouTube, too long for Reels/Shorts"] : []),
    ...(voice ? ["Voiceover added"] : []),
    ...notes,
  ];
  const card: ScoreCard = {
    brief_id: brief.id,
    variant: 1,
    stage: "score-1",
    hard_fails: [],
    soft: null,
    total: 0,
    rank: 1,
    reasons,
  };
  writeFileSync(join(dir, "score.json"), JSON.stringify(card, null, 2));
  writeFileSync(
    join(PATHS.out, brief.id, "montage.json"),
    JSON.stringify(
      {
        mode,
        kind: plan.kind,
        estimate: plan.estimate,
        spent,
        seconds,
        aspects: plan.aspects,
        higgsfield_ready: higgsfieldReady(),
        voice_ready: voiceReady(ctx.brand),
        shots: plan.shots.map((s) => ({ type: s.type, caption: s.caption ?? s.title ?? null, move: s.move ?? null })),
        rendered_at: now(),
      },
      null,
      2,
    ),
  );
  record("assemble", "ok", 0, mode === "draft" ? "local:montage" : "montage");
  return { brief_id: brief.id, status: "ok", spent_credits: spent, survivors: 1, mode, seconds };
}
