# Deal Origination Console

A compliance-first M&A outreach app: a Next.js front end, serverless API, a
Postgres database with row-level security, AI drafting, real sending through a
dedicated Outlook mailbox, and an automated reply-poller.

> Not legal advice. The clearance gate encodes UK GDPR / PECR / FCA FPO rules as
> guardrails. Have your compliance function approve the exemption logic and the
> risk-warning wording before any live campaign.

---

## What's in here

```
app/
  page.js                     UI (login gate, pipeline, prospect drawer, settings)
  layout.js, globals.css
  api/prospects/...           CRUD + draft / lia / reply / send
  api/suppression, settings   do-not-contact list, firm config
  api/cron/poll-replies       automation: reads the mailbox, logs replies
lib/
  compliance.js               the clearance gate (shared client + server)
  ai.js                       Anthropic calls (server-side key)
  graph.js                    Microsoft Graph: sendMail + recentMessages
  db.js                       Postgres pool + RLS tenant context
db/
  schema.sql, init.mjs        tables, RLS policies, seed
vercel.json                   the cron schedule
```

The clearance gate runs in the browser for instant feedback **and again on the
server inside `/send`** — a request that skips the UI still can't dispatch a
prospect that hasn't cleared.

---

## 1. Push to GitHub

```bash
cd mna-outreach
git init
git add .
git commit -m "Initial commit: M&A outreach console"
gh repo create mna-outreach --private --source=. --push
# (or create an empty repo on github.com and:)
# git remote add origin git@github.com:YOURNAME/mna-outreach.git
# git push -u origin main
```

## 2. Provision Postgres

Use Vercel Postgres (Neon), Supabase, or any Postgres. Copy the **pooled**
connection string into `DATABASE_URL`. Then create the schema:

```bash
cp .env.example .env       # fill in DATABASE_URL (+ DEFAULT_TENANT_ID)
npm install
npm run db:init            # applies schema.sql, enables RLS, seeds settings
```

## 3. Register the Outlook app (Microsoft Graph)

In **Microsoft Entra admin center → App registrations → New registration**:

1. Note the **Application (client) ID** and **Directory (tenant) ID**.
2. **Certificates & secrets → New client secret** → copy the value.
3. **API permissions → Add → Microsoft Graph → Application permissions** →
   add `Mail.Send` and `Mail.Read` → **Grant admin consent**.
4. Put those into `MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_CLIENT_SECRET`, and set
   `OUTLOOK_MAILBOX` to the dedicated mailbox (e.g. a shared mailbox on an
   isolated sending domain, not your primary corporate domain).

> App-only `Mail.Send` lets the service send as that one mailbox. To restrict it
> to *only* that mailbox, apply an Exchange **Application Access Policy**.

## 4. Get an Anthropic key

From the Anthropic Console. Set `ANTHROPIC_API_KEY`. For confidential deal data,
use an enterprise tier with Zero Data Retention and set `ANTHROPIC_MODEL` to the
current Sonnet string.

## 5. Deploy to Vercel

```bash
npm i -g vercel
vercel            # link the project
vercel --prod     # deploy
```

In **Vercel → Project → Settings → Environment Variables**, add every key from
`.env.example` (`DATABASE_URL`, `ANTHROPIC_*`, `MS_*`, `OUTLOOK_MAILBOX`,
`APP_PASSWORD`, `CRON_SECRET`, `FOLLOWUP_DAYS`). Redeploy so they take effect.

Open the deployment URL, enter your `APP_PASSWORD`, and you're in.

---

## The automation workflow

`vercel.json` registers a cron that calls `/api/cron/poll-replies` every 15
minutes. On each run it:

1. reads the last poll time from `system_state`;
2. pulls inbox messages received since then from the dedicated mailbox;
3. matches each sender to a prospect, appends the message to that prospect's
   thread, and moves it to **Replied** (de-duplicated by Graph message id);
4. flags any prospect **Sent** more than `FOLLOWUP_DAYS` ago with no reply as
   **needs follow-up** (shown as a badge in the pipeline);
5. advances the bookmark.

Follow-ups are **flagged, never auto-sent** — every financial promotion stays
human-reviewed, which also keeps volume low enough to preserve the Art. 28
one-off-communication argument.

Test it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://YOUR-APP.vercel.app/api/cron/poll-replies
# -> {"ok":true,"scanned":N,"repliesLogged":N,"followupsFlagged":N}
```

### Optional: real-time instead of polling
Swap the cron for a Graph **change notification subscription** (webhook) to
`/api/graph/webhook`. It's lower-latency but needs subscription renewal every
~3 days; polling every 15 min is simpler and fine to start.

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```
Leave `APP_PASSWORD` blank locally to skip the login gate.

## Swapping in Woodpecker / Instantly
To delegate deliverability (warm-up, domain rotation, bounce shield) instead of
sending directly, replace the body of `lib/graph.js` `sendMail` with a POST to
the Woodpecker `/prospects` or Instantly `/api/v2/leads/add` endpoint, mapping
the cleared draft into their custom fields. The rest of the app is unchanged.
