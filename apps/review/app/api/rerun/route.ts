import { generatingSince, hasKeys, startRun } from "../../../lib/generate";

export const dynamic = "force-dynamic";

const STAGES = ["compile", "hero", "score-1", "motion", "copy", "voice", "assemble", "score-2"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { brief_id?: string; from?: string; note?: string }
    | null;
  if (!body?.brief_id || !body.from || !STAGES.includes(body.from)) {
    return Response.json({ started: false, reason: "brief_id and valid from-stage required" }, { status: 400 });
  }

  if (!hasKeys()) {
    return Response.json({
      started: false,
      reason: "no API keys in .env (edit recorded; real re-run needs keys)",
    });
  }

  // Two runs of one post race on its output folder and the ledger (one crashed doing it).
  const since = generatingSince(body.brief_id);
  if (since) {
    const mins = Math.max(1, Math.round((Date.now() - since) / 60000));
    return Response.json({
      started: false,
      reason: `already generating (started ${mins} min ago) — refresh in a bit`,
    });
  }

  const extra = ["--from", body.from];
  if (body.note) extra.push("--note", body.note);
  try {
    startRun(body.brief_id, extra);
    return Response.json({ started: true });
  } catch (e) {
    return Response.json({ started: false, reason: (e as Error).message }, { status: 500 });
  }
}
