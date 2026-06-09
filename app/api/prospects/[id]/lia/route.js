// app/api/prospects/[id]/lia/route.js
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../../../lib/db.js";
import { rowToProspect } from "../../../../../lib/serialize.js";
import { authorized } from "../../../../../lib/auth.js";
import { aiLIA } from "../../../../../lib/ai.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const updated = await withTenant(async (c) => {
      const p = rowToProspect((await c.query("SELECT * FROM prospects WHERE id=$1", [params.id])).rows[0]);
      const settings = (await c.query("SELECT data FROM settings WHERE tenant_id=$1", [TENANT()])).rows[0]?.data || {};
      const r = await aiLIA(p, settings);
      const lia = { purpose: r.purpose || "", necessity: r.necessity || "", balancing: r.balancing || "" };
      const row = (await c.query(
        "UPDATE prospects SET lia=$1, updated_at=now() WHERE id=$2 RETURNING *",
        [JSON.stringify(lia), params.id]
      )).rows[0];
      return rowToProspect(row);
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
