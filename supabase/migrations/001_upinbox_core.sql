-- UpInbox Core Schema — Migration 001
-- Creates the upinbox_jmap schema with all core tables.
--
-- Schema: upinbox_jmap (isolated from other platform products)
-- RLS: enabled on all tables
-- Convention: auth_clients.id (not client_id) as the FK for org ownership

CREATE SCHEMA IF NOT EXISTS upinbox_jmap;

-- ─── Accounts ─────────────────────────────────────────────────────────────────
-- One row per connected email account (Gmail, Outlook, IMAP, @upinbox.ai).
-- credentials_enc: AES-256-GCM encrypted ProviderCredentials JSON.
-- PLATFORM_ENCRYPTION_KEY (org-managed env var) is the wrapping key.
-- UpInbox never holds this key — it lives in the self-hosted org's environment.

CREATE TABLE IF NOT EXISTS upinbox_jmap.accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES platform.auth_clients(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_type   TEXT NOT NULL CHECK (provider_type IN ('jmap', 'imap', 'exchange', 'gmail')),
  credentials_enc TEXT NOT NULL,              -- AES-256-GCM(JSON(ProviderCredentials))
  email_address   TEXT NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  health_status   TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('ok', 'error', 'unknown')),
  health_error    TEXT,
  health_checked_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON upinbox_jmap.accounts(user_id);
CREATE INDEX IF NOT EXISTS accounts_org_id_idx ON upinbox_jmap.accounts(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_email_idx ON upinbox_jmap.accounts(user_id, email_address);

ALTER TABLE upinbox_jmap.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own accounts"
  ON upinbox_jmap.accounts
  FOR ALL
  USING (user_id = auth.uid());

-- ─── Mailbox Cache ────────────────────────────────────────────────────────────
-- Cached mailbox list for fast UI rendering.
-- Invalidated on each JMAP/IMAP sync cycle (or on-demand).

CREATE TABLE IF NOT EXISTS upinbox_jmap.mailboxes (
  id              TEXT NOT NULL,              -- provider's mailbox ID
  account_id      UUID NOT NULL REFERENCES upinbox_jmap.accounts(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT,                       -- inbox | sent | drafts | trash | spam | archive
  total_emails    INTEGER NOT NULL DEFAULT 0,
  unread_emails   INTEGER NOT NULL DEFAULT 0,
  parent_id       TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, account_id)
);

ALTER TABLE upinbox_jmap.mailboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access their account mailboxes"
  ON upinbox_jmap.mailboxes
  FOR ALL
  USING (
    account_id IN (
      SELECT id FROM upinbox_jmap.accounts WHERE user_id = auth.uid()
    )
  );

-- ─── Triage Results ───────────────────────────────────────────────────────────
-- Classification results from any intelligence path (heuristic, BYOK, Intelligence API).
-- email_id is the provider's email ID (JMAP id or IMAP UID@mailbox).

CREATE TABLE IF NOT EXISTS upinbox_jmap.triage_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES upinbox_jmap.accounts(id) ON DELETE CASCADE,
  email_id        TEXT NOT NULL,
  category        TEXT NOT NULL,             -- ACTION_REQUIRED | FYI | NEWSLETTER | etc.
  confidence      NUMERIC(4,3) NOT NULL,     -- 0.000–1.000
  signals         TEXT[] NOT NULL DEFAULT '{}',
  provider        TEXT NOT NULL,             -- heuristic | byok_anthropic | intelligence_api | etc.
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, email_id)
);

CREATE INDEX IF NOT EXISTS triage_account_id_idx ON upinbox_jmap.triage_results(account_id);
CREATE INDEX IF NOT EXISTS triage_category_idx ON upinbox_jmap.triage_results(category);

ALTER TABLE upinbox_jmap.triage_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access their triage results"
  ON upinbox_jmap.triage_results
  FOR ALL
  USING (
    account_id IN (
      SELECT id FROM upinbox_jmap.accounts WHERE user_id = auth.uid()
    )
  );

-- ─── Scheduled Sends ─────────────────────────────────────────────────────────
-- Email sends scheduled for a future time.
-- Cron job polls this table every minute.

CREATE TABLE IF NOT EXISTS upinbox_jmap.scheduled_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES upinbox_jmap.accounts(id) ON DELETE CASCADE,
  draft_email_id  TEXT NOT NULL,             -- provider's draft email ID
  send_at         TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_sends_pending_idx
  ON upinbox_jmap.scheduled_sends(status, send_at)
  WHERE status = 'pending';

ALTER TABLE upinbox_jmap.scheduled_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their scheduled sends"
  ON upinbox_jmap.scheduled_sends
  FOR ALL
  USING (
    account_id IN (
      SELECT id FROM upinbox_jmap.accounts WHERE user_id = auth.uid()
    )
  );

-- ─── MCP Tokens ───────────────────────────────────────────────────────────────
-- Authentication tokens for the UpInbox MCP server.
-- Raw token is shown once at creation; only the SHA-256 hash is stored.

CREATE TABLE IF NOT EXISTS upinbox_jmap.mcp_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,      -- SHA-256(raw_token)
  scopes          TEXT[] NOT NULL DEFAULT '{"read"}',
  description     TEXT,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE upinbox_jmap.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their MCP tokens"
  ON upinbox_jmap.mcp_tokens
  FOR ALL
  USING (user_id = auth.uid());

-- ─── AI Config ────────────────────────────────────────────────────────────────
-- Per-account AI provider settings.
-- BYOK keys are NEVER stored here — they live in the user's browser (localStorage).
-- This table stores provider preferences and model choices only.

CREATE TABLE IF NOT EXISTS upinbox_jmap.ai_config (
  account_id          UUID PRIMARY KEY REFERENCES upinbox_jmap.accounts(id) ON DELETE CASCADE,
  classify_provider   TEXT NOT NULL DEFAULT 'heuristic'
                        CHECK (classify_provider IN ('heuristic', 'byok', 'uplink', 'intelligence_api')),
  summarize_provider  TEXT NOT NULL DEFAULT 'byok'
                        CHECK (summarize_provider IN ('byok', 'uplink', 'intelligence_api')),
  draft_provider      TEXT NOT NULL DEFAULT 'byok'
                        CHECK (draft_provider IN ('byok', 'uplink', 'intelligence_api')),
  byok_provider       TEXT CHECK (byok_provider IN ('anthropic', 'openai', 'gemini', 'groq', 'mistral')),
  byok_model          TEXT,                  -- e.g. 'claude-haiku-4-5-20251001'
  uplink_model        TEXT,                  -- e.g. 'phi4-mini'
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE upinbox_jmap.ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their AI config"
  ON upinbox_jmap.ai_config
  FOR ALL
  USING (
    account_id IN (
      SELECT id FROM upinbox_jmap.accounts WHERE user_id = auth.uid()
    )
  );

-- ─── USX Discovery Cache ──────────────────────────────────────────────────────
-- Cached DNS lookup results for USX protocol discovery.
-- Avoids repeated DNS queries for the same domain.

CREATE TABLE IF NOT EXISTS upinbox_jmap.usx_cache (
  domain          TEXT PRIMARY KEY,
  endpoint        TEXT,                      -- null if domain has no USX record
  fingerprint     TEXT,
  version         TEXT,
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

-- No RLS needed — this is a shared cache with no PII
