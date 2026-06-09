// app/api/suppression/route.js
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../lib/db.js";
import { authorized } from "../../../lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await withTenant((c) =>
    c.query("SELECT value, created_at FROM suppression ORDER BY created_at DESC").then((r) => r.rows)
  );
  return NextResponse.json(rows.map((r) => ({ value: r.value, at: r.created_at })));
}

export async function POST(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { value } = await req.json().catch(() => ({}));
  const v = (value || "").trim().toLowerCase();
  if (!v) return NextResponse.json({ error: "empty" }, { status: 400 });
  await withTenant((c) =>
    c.query(
      "INSERT INTO suppression (tenant_id, value) VALUES ($1,$2) ON CONFLICT (tenant_id, value) DO NOTHING",
      [TENANT(), v]
    )
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { value } = await req.json().catch(() => ({}));
  await withTenant((c) => c.query("DELETE FROM suppression WHERE value=$1", [(value || "").toLowerCase()]));
  return NextResponse.json({ ok: true });
}
