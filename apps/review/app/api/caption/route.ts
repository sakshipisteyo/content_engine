import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR } from "../../../lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { brief_id?: string; caption?: string }
    | null;
  if (!body?.brief_id || typeof body.caption !== "string") {
    return Response.json({ ok: false, error: "brief_id and caption required" }, { status: 400 });
  }
  const dir = join(OUT_DIR, body.brief_id);
  if (!existsSync(dir)) {
    return Response.json({ ok: false, error: "unknown brief" }, { status: 404 });
  }
  writeFileSync(join(dir, "caption.txt"), body.caption, "utf8");
  return Response.json({ ok: true });
}
