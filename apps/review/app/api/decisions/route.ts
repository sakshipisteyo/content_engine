import { addDecision } from "../../../lib/ledger";
import type { Decision } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<Decision> | null;
  if (!body || !body.brief_id || !body.action) {
    return Response.json({ ok: false, error: "brief_id and action required" }, { status: 400 });
  }
  if (!["approve", "reject", "edit"].includes(body.action)) {
    return Response.json({ ok: false, error: "bad action" }, { status: 400 });
  }
  addDecision({
    brief_id: body.brief_id,
    variant: body.variant ?? null,
    action: body.action,
    note: body.note ?? null,
    rating: body.rating ?? null,
    decided_at: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}
