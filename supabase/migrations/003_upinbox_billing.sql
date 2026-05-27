-- UpInbox Billing: Subscriptions + License issuance audit log
-- Migration 003 — billing layer

-- ─── subscriptions ────────────────────────────────────────────────────────────
-- Tracks hosted (SaaS) subscriptions. Self-hosted instances do not use this table.
-- The application verifies license JWTs locally for self-hosted tiers.

CREATE TABLE IF NOT EXISTS upinbox.subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tier: free | plus | business
  tier                 text NOT NULL DEFAULT 'free'
                         CHECK (tier IN ('free', 'plus', 'business')),
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),

  -- Stripe identifiers
  stripe_customer_id   text,
  stripe_subscription_id text,
  stripe_price_id      text,

  -- Billing period
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,

  -- Audit
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id)
);

ALTER TABLE upinbox.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "users_read_own_subscription"
  ON upinbox.subscriptions
  FOR SELECT
  USING (user_id = auth.uid());

-- Only service role can write (Stripe webhook handler uses service role)
CREATE POLICY "service_role_write_subscriptions"
  ON upinbox.subscriptions
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON upinbox.subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON upinbox.subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─── issued_licenses ──────────────────────────────────────────────────────────
-- Audit log for self-hosted license JWTs issued.
-- Does NOT store the JWT itself — just metadata for tracking and support.

CREATE TABLE IF NOT EXISTS upinbox.issued_licenses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and where
  tier                 text NOT NULL CHECK (tier IN ('community', 'business', 'enterprise')),
  max_users            integer NOT NULL DEFAULT 999999,
  instance_domain      text NOT NULL,
  org_name             text,
  contact_email        text,

  -- Payment reference for audit trail
  stripe_payment_id    text,

  -- Validity window
  issued_at            timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,

  -- Internal tracking
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upinbox.issued_licenses ENABLE ROW LEVEL SECURITY;

-- Service role only — license issuance is an admin operation
CREATE POLICY "service_role_manage_licenses"
  ON upinbox.issued_licenses
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_issued_licenses_domain
  ON upinbox.issued_licenses (instance_domain);

CREATE INDEX IF NOT EXISTS idx_issued_licenses_expires
  ON upinbox.issued_licenses (expires_at);

-- ─── mcp_tokens: add revoked_at column if missing ─────────────────────────────
-- mcp_tokens was created in migration 001 without revoked_at.
-- Add it now for soft-delete support.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'upinbox'
      AND table_name   = 'mcp_tokens'
      AND column_name  = 'revoked_at'
  ) THEN
    ALTER TABLE upinbox.mcp_tokens ADD COLUMN revoked_at timestamptz;
  END IF;
END $$;

-- ─── updated_at trigger for subscriptions ────────────────────────────────────

CREATE OR REPLACE FUNCTION upinbox.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'subscriptions_updated_at'
      AND tgrelid = 'upinbox.subscriptions'::regclass
  ) THEN
    CREATE TRIGGER subscriptions_updated_at
      BEFORE UPDATE ON upinbox.subscriptions
      FOR EACH ROW EXECUTE FUNCTION upinbox.touch_updated_at();
  END IF;
END $$;
