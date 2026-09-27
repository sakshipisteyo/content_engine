import { addScheduleEntry, getSchedule, updateScheduleStatus, reschedule } from "../../../lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSchedule());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    brief_id?: string;
    variant?: number | null;
    platform?: string;
    scheduled_at?: string;
  } | null;

  if (!body?.brief_id || !body.scheduled_at || !body.platform) {
    return Response.json({ error: "brief_id, platform, and scheduled_at required" }, { status: 400 });
  }

  await addScheduleEntry({
    brief_id: body.brief_id,
    variant: body.variant ?? null,
    platform: body.platform,
    scheduled_at: body.scheduled_at,
    status: "scheduled",
    created_at: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    brief_id?: string;
    action?: "reschedule" | "cancel";
    scheduled_at?: string;
  } | null;

  if (!body?.brief_id || !body.action) {
    return Response.json({ error: "brief_id and action required" }, { status: 400 });
  }

  if (body.action === "cancel") {
    await updateScheduleStatus(body.brief_id, "cancelled");
  } else if (body.action === "reschedule" && body.scheduled_at) {
    await reschedule(body.brief_id, body.scheduled_at);
  } else {
    return Response.json({ error: "reschedule needs scheduled_at" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
