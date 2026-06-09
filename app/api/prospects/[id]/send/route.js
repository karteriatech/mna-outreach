// app/api/prospects/[id]/send/route.js
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../../../lib/db.js";
import { rowToProspect } from "../../../../../lib/serialize.js";
import { authorized } from "../../../../../lib/auth.js";
import { evaluate, composeBody } from "../../../../../lib/compliance.js";
import { sendMail } from "../../../../../lib/graph.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await withTenant(async (c) => {
      const p = rowToProspect((await c.query("SELECT * FROM prospects WHERE id=$1", [params.id])).rows[0]);
      const settings = (await c.query("SELECT data FROM settings WHERE tenant_id=$1", [TENANT()])).rows[0]?.data || {};
      const supp = (await c.query("SELECT value, created_at FROM suppression")).rows.map((r) => ({ value: r.value, at: r.created_at }));

      // ENFORCEMENT: the gate is re-evaluated on the server. A request that
      // bypasses the UI cannot send a non-cleared prospect.
      const ev = evaluate(p, supp, settings);
      if (!ev.sendReady) {
        return { error: "Prospect is not cleared to send.", gates: ev.gates, status: 422 };
      }

      const body = composeBody(p, ev, settings);
      await sendMail({ to: p.email, subject: p.draft.subject, body, contactName: p.contact });

      const thread = [...(p.thread || []), { id: Math.random().toString(36).slice(2, 10), dir: "out", subject: p.draft.subject, body, at: Date.now() }];
      const stage = ["drafted", "cleared"].includes(p.stage) ? "sent" : p.stage;
      const row = (await c.query(
        "UPDATE prospects SET thread=$1, stage=$2, last_sent_at=now(), needs_followup=false, updated_at=now() WHERE id=$3 RETURNING *",
        [JSON.stringify(thread), stage, params.id]
      )).rows[0];
      return { prospect: rowToProspect(row) };
    });

    if (result.error) return NextResponse.json(result, { status: result.status || 422 });
    return NextResponse.json(result.prospect);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
