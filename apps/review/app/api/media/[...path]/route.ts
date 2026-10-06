import { existsSync, statSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { OUT_DIR } from "../../../../lib/repo";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".pdf": "application/pdf",
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const base = resolve(OUT_DIR);
  const abs = resolve(base, ...path);
  // Path-traversal guard: never serve outside out/.
  if (abs !== base && !abs.startsWith(base + sep)) {
    return new Response("forbidden", { status: 403 });
  }
  if (!existsSync(abs)) return new Response("not found", { status: 404 });
  const type = TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream";

  // Byte ranges, so browsers can seek in videos (Safari won't play mp4 without them).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const size = statSync(abs).size;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2] || 0));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    const fh = await open(abs, "r");
    try {
      const buf = Buffer.alloc(end - start + 1);
      await fh.read(buf, 0, buf.length, start);
      return new Response(new Uint8Array(buf), {
        status: 206,
        headers: {
          "content-type": type,
          "content-length": String(buf.length),
          "content-range": `bytes ${start}-${end}/${size}`,
          "accept-ranges": "bytes",
          "cache-control": "no-store",
        },
      });
    } finally {
      await fh.close();
    }
  }
  const data = await readFile(abs);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": type,
      "content-length": String(data.length),
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    },
  });
}
