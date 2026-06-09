// lib/db.js
import { Pool } from "pg";

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Most hosted Postgres (Neon, Supabase, Vercel Postgres) require SSL.
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

const TENANT = () => process.env.DEFAULT_TENANT_ID || "00000000-0000-0000-0000-000000000001";

// Run a function inside a transaction with the RLS tenant GUC set.
// Postgres policies key off current_setting('app.tenant_id'), so the engine
// itself restricts every row to the active tenant — even a buggy query can't leak.
export async function withTenant(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT()]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export { TENANT };
