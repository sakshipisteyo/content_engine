/** Small media/IO helpers: base64 for vision, URL download, stream draining. */
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export function mediaTypeForPath(path: string): ImageMediaType {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

export function imageToBase64(path: string): { media_type: ImageMediaType; data: string } {
  return { media_type: mediaTypeForPath(path), data: readFileSync(path).toString("base64") };
}

/** Download a URL to a local file (used for Higgsfield result URLs). */
export async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

/** Drain a web ReadableStream / Node Readable / AsyncIterable to a Buffer. */
export async function streamToBuffer(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array,
): Promise<Buffer> {
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  const chunks: Uint8Array[] = [];
  const anyStream = stream as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> };
  if (typeof anyStream.getReader === "function") {
    const reader = anyStream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } else {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
