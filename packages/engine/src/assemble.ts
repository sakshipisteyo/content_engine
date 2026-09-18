/**
 * Assemble stage: turn a hero image (image posts) or a clip + VO (video posts) into
 * final, cropped, ready-to-post files plus caption.txt. sharp does image crops;
 * ffmpeg (on PATH, via execa) does video crop/caption/logo/audio mux.
 * Fully exercised at A3 (image) and A4 (video).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import sharp from "sharp";
import type { Aspect } from "./schemas";

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

/** Is ffmpeg reachable on PATH? */
export async function hasFfmpeg(): Promise<boolean> {
  try {
    await execa("ffmpeg", ["-version"]);
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

/** Escape text for ffmpeg drawtext. */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%");
}

const WIN_FONT = "C\\:/Windows/Fonts/arial.ttf";

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

  // A short burned caption line (first ~60 chars of the caption).
  const line = escapeDrawtext(caption.slice(0, 60));
  const drawtext =
    `drawtext=fontfile=${WIN_FONT}:text='${line}':` +
    `fontcolor=white:fontsize=42:box=1:boxcolor=black@0.45:boxborderw=16:` +
    `x=(w-text_w)/2:y=h-text_h-80`;

  for (const aspect of aspects) {
    const { w, h } = CROP_SIZE[aspect];
    const dest = join(outDir, cropFileName(aspect, "mp4"));

    // Scale to cover then crop to the target, burn caption, overlay logo.
    let filter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${drawtext}`;
    const inputs = ["-i", clipPath];
    if (logoPath) {
      inputs.push("-i", logoPath);
      const logoW = Math.round(w * 0.18);
      filter =
        `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${drawtext}[v];` +
        `[1:v]scale=${logoW}:-1[lg];[v][lg]overlay=W-w-40:40[vout]`;
    }
    if (voPath) inputs.push("-i", voPath);

    const args: string[] = ["-y", ...inputs];
    if (logoPath) {
      args.push("-filter_complex", filter, "-map", "[vout]");
    } else {
      args.push("-vf", filter, "-map", "0:v");
    }
    if (voPath) {
      const audioIndex = logoPath ? 2 : 1;
      args.push("-map", `${audioIndex}:a`, "-shortest", "-c:a", "aac");
    }
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dest);

    await execa("ffmpeg", args);
    written.push(dest);
  }
  return written;
}
