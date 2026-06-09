// app/api/prospects/[id]/reply/route.js
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../../../lib/db.js";
import { rowToProspect } from "../../../../../lib/serialize.js";
import { authorized } from "../../../../../lib/auth.js";
import { aiReply } from "../../../../../lib/ai.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { inbound = "", logInbound = false } = await req.json().catch(() => ({}));
  try {
    const updated = await withTenant(async (c) => {
      const p = rowToProspect((await c.query("SELECT * FROM prospects WHERE id=$1", [params.id])).rows[0]);
      const settings = (await c.query("SELECT data FROM settings WHERE tenant_id=$1", [TENANT()])).rows[0]?.data || {};

      let thread = p.thread || [];
      if (logInbound && inbound.trim()) {
        thread = [...thread, { id: Math.random().toString(36).slice(2, 10), dir: "in", subject: "", body: inbound.trim(), at: Date.now() }];
      }
      const r = await aiReply({ ...p, thread }, settings, inbound);
      const draft = { subject: r.subject || p.draft?.subject || "", body: r.body || "" };
      const row = (await c.query(
        "UPDATE prospects SET draft=$1, thread=$2, stage='replied', updated_at=now() WHERE id=$3 RETURNING *",
        [JSON.stringify(draft), JSON.stringify(thread), params.id]
      )).rows[0];
      return rowToProspect(row);
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
