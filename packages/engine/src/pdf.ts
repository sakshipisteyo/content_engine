/**
 * Minimal PDF writer: one full-bleed JPEG per page (DCTDecode, no re-encoding). Enough
 * for LinkedIn "document" carousels; avoids a PDF library dependency.
 */

export interface PdfPage {
  jpeg: Buffer;
  width: number;
  height: number;
}

/** px -> pt at 96 dpi, so a 1080 px page is 810 pt wide. */
const PT_PER_PX = 0.75;

export function jpegsToPdf(pages: PdfPage[]): Buffer {
  if (pages.length === 0) throw new Error("jpegsToPdf: no pages");
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    chunks.push(buf);
    length += buf.length;
  };
  const object = (id: number, body: (Buffer | string)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const part of body) push(part);
    push("\nendobj\n");
  };

  // Objects: 1 catalog, 2 pages, then per page: page, contents, image.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`]);
  pages.forEach((p, i) => {
    const [pageId, contentId, imageId] = [pageIds[i]!, pageIds[i]! + 1, pageIds[i]! + 2];
    const w = +(p.width * PT_PER_PX).toFixed(2);
    const h = +(p.height * PT_PER_PX).toFixed(2);
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    object(contentId, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
    object(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      "\nendstream",
    ]);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
