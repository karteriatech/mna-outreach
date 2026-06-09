// app/api/prospects/[id]/route.js
import { NextResponse } from "next/server";
import { withTenant } from "../../../../lib/db.js";
import { rowToProspect, patchToColumns } from "../../../../lib/serialize.js";
import { authorized } from "../../../../lib/auth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const row = await withTenant((c) =>
    c.query("SELECT * FROM prospects WHERE id = $1", [params.id]).then((r) => r.rows[0])
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToProspect(row));
}

export async function PATCH(req, { params }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const patch = await req.json().catch(() => ({}));
  const { cols, vals } = patchToColumns(patch);
  if (cols.length === 0) return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  const set = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const row = await withTenant((c) =>
    c.query(
      `UPDATE prospects SET ${set}, updated_at = now() WHERE id = $${cols.length + 1} RETURNING *`,
      [...vals, params.id]
    ).then((r) => r.rows[0])
  );
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rowToProspect(row));
}

export async function DELETE(req, { params }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await withTenant((c) => c.query("DELETE FROM prospects WHERE id = $1", [params.id]));
  return NextResponse.json({ ok: true });
}
