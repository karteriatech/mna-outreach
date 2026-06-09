// app/api/prospects/route.js
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../lib/db.js";
import { rowToProspect } from "../../../lib/serialize.js";
import { authorized } from "../../../lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await withTenant((c) =>
    c.query("SELECT * FROM prospects ORDER BY updated_at DESC").then((r) => r.rows)
  );
  return NextResponse.json(rows.map(rowToProspect));
}

export async function POST(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const row = await withTenant(async (c) => {
    const r = await c.query(
      `INSERT INTO prospects (tenant_id, company, contact, title, email, sector, entity_type, deal_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [TENANT(), b.company || "", b.contact || "", b.title || "", b.email || "",
       b.sector || "", b.entityType || "unknown", b.dealType || "full_buyout", b.notes || ""]
    );
    return r.rows[0];
  });
  return NextResponse.json(rowToProspect(row), { status: 201 });
}
