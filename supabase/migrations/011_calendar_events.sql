-- Migration: calendar_events table for UpInbox
-- Caches ICS-sourced calendar events from all connected email accounts.

CREATE TABLE IF NOT EXISTS upinbox.calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  source_email_id TEXT NOT NULL,
  uid             TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  description     TEXT,
  location        TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  all_day         BOOLEAN NOT NULL DEFAULT false,
  organizer_email TEXT,
  organizer_name  TEXT,
  status          TEXT CHECK (status IN ('confirmed','tentative','cancelled')) DEFAULT 'confirmed',
  recurrence_rule TEXT,
  raw_ics         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id, uid)
);

CREATE INDEX IF NOT EXISTS calendar_events_user_range
  ON upinbox.calendar_events (user_id, start_at, end_at);

ALTER TABLE upinbox.calendar_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='upinbox'
    AND tablename='calendar_events' AND policyname='calendar_events_owner'
  ) THEN
    CREATE POLICY calendar_events_owner ON upinbox.calendar_events
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.calendar_events TO authenticated;
GRANT USAGE ON SCHEMA upinbox TO authenticated;
