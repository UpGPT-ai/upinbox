-- UpInbox Migration 002: Screener, USX, and MCP extensions
-- Safe to run multiple times (IF NOT EXISTS throughout)

-- ─── Screener rules ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.screener_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  priority      integer NOT NULL DEFAULT 100,
  enabled       boolean NOT NULL DEFAULT true,
  trigger       jsonb NOT NULL,           -- ScreenerTrigger shape
  action        text NOT NULL,            -- ScreenerAction value
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS screener_rules_user_id_idx ON upinbox.screener_rules(user_id);
CREATE INDEX IF NOT EXISTS screener_rules_priority_idx ON upinbox.screener_rules(user_id, priority);

-- ─── Screener decisions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.screener_decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  email_id      text NOT NULL,
  action        text NOT NULL,
  rule_id       uuid REFERENCES upinbox.screener_rules(id) ON DELETE SET NULL,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id, email_id)
);

CREATE INDEX IF NOT EXISTS screener_decisions_user_account_idx
  ON upinbox.screener_decisions(user_id, account_id);

-- ─── USX keys ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.user_keys (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address                   text NOT NULL,
  public_key_armored              text NOT NULL,      -- plaintext PGP public key
  encrypted_private_key_armored   text NOT NULL,      -- passphrase-locked, server cannot decrypt
  fingerprint                     text NOT NULL,
  revoked                         boolean NOT NULL DEFAULT false,
  revoked_at                      timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_keys_email_idx ON upinbox.user_keys(email_address) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS user_keys_user_id_idx ON upinbox.user_keys(user_id);

-- ─── USX inbox ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.usx_inbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_email          text NOT NULL,
  to_email            text NOT NULL,
  ciphertext          text NOT NULL,    -- OpenPGP armored, server cannot decrypt
  nonce               text NOT NULL UNIQUE,
  received_at         timestamptz NOT NULL DEFAULT now(),
  fetched_at          timestamptz       -- set when client retrieves
);

CREATE INDEX IF NOT EXISTS usx_inbox_recipient_idx ON upinbox.usx_inbox(recipient_user_id);

-- ─── OAuth state tokens ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.oauth_states (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state           text NOT NULL UNIQUE,
  provider        text NOT NULL,
  redirect_after  text NOT NULL DEFAULT '/inbox',
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_states_state_idx ON upinbox.oauth_states(state);
CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON upinbox.oauth_states(expires_at);

-- ─── RLS policies ─────────────────────────────────────────────────────────────

ALTER TABLE upinbox.screener_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE upinbox.screener_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE upinbox.user_keys         ENABLE ROW LEVEL SECURITY;
ALTER TABLE upinbox.usx_inbox         ENABLE ROW LEVEL SECURITY;
ALTER TABLE upinbox.oauth_states      ENABLE ROW LEVEL SECURITY;

-- Users access only their own rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'upinbox' AND tablename = 'screener_rules' AND policyname = 'screener_rules_user_policy'
  ) THEN
    CREATE POLICY screener_rules_user_policy ON upinbox.screener_rules
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'upinbox' AND tablename = 'screener_decisions' AND policyname = 'screener_decisions_user_policy'
  ) THEN
    CREATE POLICY screener_decisions_user_policy ON upinbox.screener_decisions
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'upinbox' AND tablename = 'user_keys' AND policyname = 'user_keys_user_policy'
  ) THEN
    CREATE POLICY user_keys_user_policy ON upinbox.user_keys
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Public key lookup for external USX senders (read-only, non-revoked only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'upinbox' AND tablename = 'user_keys' AND policyname = 'user_keys_public_read'
  ) THEN
    CREATE POLICY user_keys_public_read ON upinbox.user_keys
      FOR SELECT USING (NOT revoked);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'upinbox' AND tablename = 'usx_inbox' AND policyname = 'usx_inbox_recipient_policy'
  ) THEN
    CREATE POLICY usx_inbox_recipient_policy ON upinbox.usx_inbox
      USING (recipient_user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'upinbox' AND tablename = 'oauth_states' AND policyname = 'oauth_states_user_policy'
  ) THEN
    CREATE POLICY oauth_states_user_policy ON upinbox.oauth_states
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
