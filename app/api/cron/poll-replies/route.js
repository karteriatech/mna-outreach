// app/api/cron/poll-replies/route.js
// Runs on the Vercel Cron schedule in vercel.json (every 15 min).
// 1) Pulls new inbox messages from the dedicated mailbox.
// 2) Matches each sender to a prospect and logs the reply, advancing to "replied".
// 3) Flags prospects sent >5 days ago with no reply as needing a follow-up.
import { NextResponse } from "next/server";
import { withTenant, TENANT } from "../../../../lib/db.js";
import { recentMessages } from "../../../../lib/graph.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FOLLOWUP_DAYS = Number(process.env.FOLLOWUP_DAYS || 5);

export async function GET(req) {
  // Vercel sends Authorization: Bearer $CRON_SECRET when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await withTenant(async (c) => {
      const stateRow = (await c.query("SELECT last_poll FROM system_state WHERE tenant_id=$1", [TENANT()])).rows[0];
      const since = stateRow?.last_poll ? new Date(stateRow.last_poll).toISOString()
        : new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const messages = await recentMessages(since);

      let matched = 0;
      for (const m of messages) {
        const from = m.from?.emailAddress?.address?.toLowerCase();
        if (!from) continue;
        const pRow = (await c.query(
          "SELECT * FROM prospects WHERE lower(email)=$1 LIMIT 1",
          [from]
        )).rows[0];
        if (!pRow) continue;

        const thread = pRow.thread || [];
        // Skip if we already logged a message with this Graph id.
        if (thread.some((t) => t.graphId === m.id)) continue;

        thread.push({
          id: Math.random().toString(36).slice(2, 10),
          graphId: m.id,
          dir: "in",
          subject: m.subject || "",
          body: m.bodyPreview || "",
          at: new Date(m.receivedDateTime).getTime(),
        });
        await c.query(
          "UPDATE prospects SET thread=$1, stage='replied', needs_followup=false, updated_at=now() WHERE id=$2",
          [JSON.stringify(thread), pRow.id]
        );
        matched++;
      }

      // Flag stale sends for a human-reviewed follow-up (never auto-sent).
      const flagged = (await c.query(
        `UPDATE prospects SET needs_followup=true, updated_at=now()
         WHERE stage='sent' AND needs_followup=false
           AND last_sent_at < now() - ($1 || ' days')::interval
         RETURNING id`,
        [String(FOLLOWUP_DAYS)]
      )).rowCount;

      await c.query(
        "UPDATE system_state SET last_poll=now() WHERE tenant_id=$1",
        [TENANT()]
      );

      return { scanned: messages.length, repliesLogged: matched, followupsFlagged: flagged };
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
