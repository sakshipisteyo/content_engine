import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

export async function GET(
  _req: Request,
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
  const data = await readFile(abs);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream",
      "content-length": String(data.length),
      "cache-control": "no-store",
    },
  });
}
