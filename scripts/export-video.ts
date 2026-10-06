/**
 * Turn a finished text post (quote card, tips, myth vs fact, insight carousel) into short
 * videos: carousel pages play as a slideshow, single cards get a gentle push-in. Free and
 * local (bundled ffmpeg). Writes v<n>/video_9x16.mp4 and v<n>/video_1x1.mp4 (+ posters).
 *   tsx scripts/export-video.ts --id <brief-id> --variant <n> [--music path]
 * Prints: exported <id> v<n> <seconds>s
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  PATHS,
  DEFAULT_FONT,
  renderVideo,
  dataPath,
  type Segment,
  type VideoAspect,
  type VideoStyle,
} from "../packages/engine/src/index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const id = arg("id") ?? die("--id required");
const variant = Number(arg("variant") ?? "1");
const dir = join(PATHS.out, id, `v${variant}`);
if (!existsSync(dir)) die(`no variant ${variant} for ${id}`);
const music = arg("music") ? dataPath(arg("music")!) : undefined;

/** Pages for a size: carousel pages_<tag>/NN.jpg, else the single final_<tag>.jpg. */
function pagesFor(tag: string): string[] {
  const pagesDir = join(dir, `pages_${tag}`);
  if (existsSync(pagesDir)) return readdirSync(pagesDir).filter((f) => f.endsWith(".jpg")).sort().map((f) => join(pagesDir, f));
  const single = join(dir, `final_${tag}.jpg`);
  return existsSync(single) ? [single] : [];
}

// The cards already carry the brand; the video adds motion only (no captions, no watermark).
const style: VideoStyle = {
  theme: { name: "plain", background: "#000000", text: "#FFFFFF", muted: "#AAAAAA", accent: "#FFFFFF" },
  font: DEFAULT_FONT,
  brandName: "",
};

let seconds = 0;
const targets: { aspect: VideoAspect; tags: string[] }[] = [
  { aspect: "9:16", tags: ["9x16", "4x5"] }, // carousels skip 9:16: their 4:5 pages sit on the card colour
  { aspect: "1:1", tags: ["1x1"] },
];
const work = join(dir, "work-video");
for (const t of targets) {
  const tag = t.tags.find((x) => pagesFor(x).length);
  if (!tag) continue;
  const pages = pagesFor(tag);
  const fit = tag === t.aspect.replace(":", "x") ? "cover" : "contain";
  // A page shown smaller than the frame sits on its own background colour (corner pixel).
  const { data } = await sharp(pages[0]!).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const ground = `#${[data[0], data[1], data[2]].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
  const segments: Segment[] = pages.map((src, i) => ({
    kind: "image",
    src,
    fit,
    move: "drift",
    seconds: pages.length === 1 ? 7 : i === 0 ? 3 : 4.5,
  }));
  const r = await renderVideo({
    segments,
    aspect: t.aspect,
    style: { ...style, theme: { ...style.theme, background: ground } },
    outPath: join(dir, `video_${t.aspect.replace(":", "x")}.mp4`),
    workDir: work,
    ...(music && existsSync(music) ? { music: { path: music } } : {}),
  });
  seconds = r.seconds;
}
rmSync(work, { recursive: true, force: true });
if (!seconds) die("this post has no rendered pages to turn into a video");
console.log(`exported ${id} v${variant} ${seconds.toFixed(1)}s`);
