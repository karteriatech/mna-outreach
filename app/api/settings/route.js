// app/api/settings/route.js
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../lib/db.js";
import { authorized } from "../../../lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await withTenant((c) =>
    c.query("SELECT data FROM settings WHERE tenant_id=$1", [TENANT()]).then((r) => r.rows[0]?.data || {})
  );
  return NextResponse.json(data);
}

export async function PUT(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  await withTenant((c) =>
    c.query(
      `INSERT INTO settings (tenant_id, data) VALUES ($1,$2)
       ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data`,
      [TENANT(), JSON.stringify(data)]
    )
  );
  return NextResponse.json({ ok: true });
}
