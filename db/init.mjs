// db/init.mjs
// Run once after setting DATABASE_URL:  npm run db:init
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const TENANT = process.env.DEFAULT_TENANT_ID || "00000000-0000-0000-0000-000000000001";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

const DEFAULT_SETTINGS = {
  firmName: "Your Firm",
  senderName: "Sender Name",
  senderTitle: "Director, Corporate Finance",
  senderEmail: process.env.OUTLOOK_MAILBOX || "outreach@yourfirm-capital.com",
  signature: "Sender Name\nDirector, Corporate Finance\nYour Firm",
  optOutEmail: "optout@yourfirm-capital.com",
  strategy: "Describe your origination thesis here.",
  riskWarning:
    "This communication is directed only at persons who are high-net-worth or sophisticated investors. The investments described carry risk to capital and may be illiquid; past performance is not a guide to future results. If you are in any doubt you should seek independent financial advice.",
};

const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

const c = await pool.connect();
try {
  await c.query(sql);
  await c.query(
    `INSERT INTO settings (tenant_id, data) VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [TENANT, JSON.stringify(DEFAULT_SETTINGS)]
  );
  await c.query(
    `INSERT INTO system_state (tenant_id, last_poll) VALUES ($1, now())
     ON CONFLICT (tenant_id) DO NOTHING`,
    [TENANT]
  );
  console.log("Schema applied and defaults seeded for tenant", TENANT);
} finally {
  c.release();
  await pool.end();
}
