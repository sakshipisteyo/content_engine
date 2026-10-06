/**
 * Assemble stage: turn a hero image (image posts) or a clip + VO (video posts) into
 * final, cropped, ready-to-post files plus caption.txt. sharp does image crops;
 * the bundled ffmpeg (video.ts ffmpegPath) does video crop/caption/logo/audio mux.
 * Fully exercised at A3 (image) and A4 (video).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import sharp from "sharp";
import type { Aspect } from "./schemas";
import { ffmpegPath, overlayFrame } from "./video";
import { DEFAULT_FONT } from "./typographic";

/** Target pixel size per crop (width x height), 1080-wide baseline. */
const CROP_SIZE: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "16:9": { w: 1920, h: 1080 },
};

function cropFileName(aspect: Aspect, ext: string): string {
  return `final_${aspect.replace(":", "x")}.${ext}`;
}

/** Is ffmpeg available (bundled binary, FFMPEG_PATH or PATH)? */
export async function hasFfmpeg(): Promise<boolean> {
  try {
    await execa(ffmpegPath(), ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export function writeCaption(outDir: string, caption: string, hashtags: string[]): string {
  const dest = join(outDir, "caption.txt");
  const body = hashtags.length ? `${caption}\n\n${hashtags.join(" ")}` : caption;
  writeFileSync(dest, body, "utf8");
  return dest;
}

/** Image post: crop the hero to each aspect, optionally compositing the logo. */
export async function assembleImage(
  heroPath: string,
  outDir: string,
  aspects: Aspect[],
  logoPath?: string,
): Promise<string[]> {
  const written: string[] = [];
  for (const aspect of aspects) {
    const { w, h } = CROP_SIZE[aspect];
    const dest = join(outDir, cropFileName(aspect, "jpg"));
    let img = sharp(heroPath).resize(w, h, { fit: "cover", position: "attention" });
    if (logoPath) {
      const logo = await sharp(logoPath)
        .resize(Math.round(w * 0.18))
        .png()
        .toBuffer();
      img = sharp(await img.jpeg({ quality: 90 }).toBuffer()).composite([
        { input: logo, gravity: "southeast" },
      ]);
    }
    await img.jpeg({ quality: 90 }).toFile(dest);
    written.push(dest);
  }
  return written;
}

/**
 * Video post: from a 9:16 clip, produce final_9x16.mp4 (captions burned, logo
 * composited, VO muxed) and cropped final_1x1.mp4 / final_4x5.mp4.
 * Returns the list of written files. Throws on ffmpeg non-zero exit (caller logs).
 */
export async function assembleVideo(opts: {
  clipPath: string;
  voPath?: string;
  logoPath?: string;
  caption: string;
  outDir: string;
  aspects: Aspect[];
}): Promise<string[]> {
  const { clipPath, voPath, logoPath, caption, outDir, aspects } = opts;
  const written: string[] = [];

  // A short burned caption line (first ~60 chars), drawn as a PNG overlay in the default
  // font so it renders the same on every OS (no system font needed).
  const line = caption.slice(0, 60);
  const work = mkdtempSync(join(tmpdir(), "assemble-"));
  const style = {
    theme: { name: "dark", background: "#000000", text: "#FFFFFF", muted: "#BBBBBB", accent: "#FFFFFF" },
    font: DEFAULT_FONT,
    brandName: "",
  };

  for (const aspect of aspects) {
    const { w, h } = CROP_SIZE[aspect];
    const dest = join(outDir, cropFileName(aspect, "mp4"));

    // Scale to cover then crop to the target, burn caption, overlay logo.
    const capPath = join(work, `cap-${aspect.replace(":", "x")}.png`);
    writeFileSync(capPath, await overlayFrame(w, h, style, line));
    const inputs = ["-i", clipPath, "-i", capPath];
    let filter = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[s];[s][1:v]overlay=0:0[v]`;
    if (logoPath) {
      inputs.push("-i", logoPath);
      const logoW = Math.round(w * 0.18);
      filter += `;[2:v]scale=${logoW}:-1[lg];[v][lg]overlay=W-w-40:40[vout]`;
    }
    if (voPath) inputs.push("-i", voPath);

    const args: string[] = ["-y", ...inputs, "-filter_complex", filter, "-map", logoPath ? "[vout]" : "[v]"];
    if (voPath) {
      const audioIndex = logoPath ? 3 : 2;
      args.push("-map", `${audioIndex}:a`, "-shortest", "-c:a", "aac");
    }
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dest);

    await execa(ffmpegPath(), args);
    written.push(dest);
  }
  rmSync(work, { recursive: true, force: true });
  return written;
}
