// app/api/prospects/[id]/draft/route.js
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../../../lib/db.js";
import { rowToProspect } from "../../../../../lib/serialize.js";
import { authorized } from "../../../../../lib/auth.js";
import { aiEmail } from "../../../../../lib/ai.js";
import { DEAL } from "../../../../../lib/compliance.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const updated = await withTenant(async (c) => {
      const p = rowToProspect((await c.query("SELECT * FROM prospects WHERE id=$1", [params.id])).rows[0]);
      const settings = (await c.query("SELECT data FROM settings WHERE tenant_id=$1", [TENANT()])).rows[0]?.data || {};
      const exemptionKey = DEAL[p.dealType]?.exemption || "art62";
      const r = await aiEmail(p, settings, exemptionKey);
      const draft = { subject: r.subject || "", body: r.body || "" };
      const nextStage = ["sourced", "researched", "cleared"].includes(p.stage) ? "drafted" : p.stage;
      const row = (await c.query(
        "UPDATE prospects SET draft=$1, stage=$2, updated_at=now() WHERE id=$3 RETURNING *",
        [JSON.stringify(draft), nextStage, params.id]
      )).rows[0];
      return rowToProspect(row);
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
