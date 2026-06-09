-- db/schema.sql
-- Centralised, RLS-isolated store that replaces the spreadsheet.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---- prospects --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prospects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  company             TEXT NOT NULL DEFAULT '',
  contact             TEXT NOT NULL DEFAULT '',
  title               TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  sector              TEXT NOT NULL DEFAULT '',
  entity_type         TEXT NOT NULL DEFAULT 'unknown',
  deal_type           TEXT NOT NULL DEFAULT 'full_buyout',
  notes               TEXT NOT NULL DEFAULT '',
  stage               TEXT NOT NULL DEFAULT 'sourced',
  suppressed          BOOLEAN NOT NULL DEFAULT FALSE,
  certified_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  linkage_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  lia                 JSONB NOT NULL DEFAULT '{"purpose":"","necessity":"","balancing":""}',
  draft               JSONB NOT NULL DEFAULT '{"subject":"","body":""}',
  thread              JSONB NOT NULL DEFAULT '[]',
  needs_followup      BOOLEAN NOT NULL DEFAULT FALSE,
  last_sent_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospects_tenant_idx ON prospects (tenant_id);
CREATE INDEX IF NOT EXISTS prospects_email_idx  ON prospects (tenant_id, lower(email));

-- ---- suppression list -------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppression (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, value)
);

-- ---- settings (one row per tenant) ------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  tenant_id UUID PRIMARY KEY,
  data      JSONB NOT NULL DEFAULT '{}'
);

-- ---- system state (cron bookmarks) ------------------------------------------
CREATE TABLE IF NOT EXISTS system_state (
  tenant_id UUID PRIMARY KEY,
  last_poll TIMESTAMPTZ
);

-- ---- Row-Level Security -----------------------------------------------------
-- Every read/write is restricted to current_setting('app.tenant_id') at the
-- database kernel, regardless of what the application query asks for.
ALTER TABLE prospects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='prospects' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON prospects
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='suppression' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON suppression
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON settings
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='system_state' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON system_state
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
