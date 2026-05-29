-- Migration 012: Calendar Sprint 1 & 2
-- Adds attendees/RSVP/source tracking to calendar_events
-- Adds google_calendar_tokens table for two-way Google Calendar sync

-- ── Extend calendar_events ──────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='upinbox' AND table_name='calendar_events' AND column_name='attendees') THEN
    ALTER TABLE upinbox.calendar_events ADD COLUMN attendees JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='upinbox' AND table_name='calendar_events' AND column_name='rsvp_status') THEN
    ALTER TABLE upinbox.calendar_events ADD COLUMN rsvp_status TEXT DEFAULT 'needs-action'
      CHECK (rsvp_status IN ('accepted','declined','tentative','needs-action'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='upinbox' AND table_name='calendar_events' AND column_name='source') THEN
    ALTER TABLE upinbox.calendar_events ADD COLUMN source TEXT NOT NULL DEFAULT 'ics_email'
      CHECK (source IN ('ics_email','google','manual'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='upinbox' AND table_name='calendar_events' AND column_name='google_event_id') THEN
    ALTER TABLE upinbox.calendar_events ADD COLUMN google_event_id TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='upinbox' AND table_name='calendar_events' AND column_name='video_url') THEN
    ALTER TABLE upinbox.calendar_events ADD COLUMN video_url TEXT;
  END IF;
END $$;

-- ── google_calendar_tokens ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.google_calendar_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alias                 TEXT NOT NULL DEFAULT 'primary',
  encrypted_access_token  TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expiry          TIMESTAMPTZ,
  calendar_ids          TEXT[] NOT NULL DEFAULT ARRAY['primary'],
  last_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, alias)
);

ALTER TABLE upinbox.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='upinbox'
    AND tablename='google_calendar_tokens' AND policyname='google_calendar_tokens_owner'
  ) THEN
    CREATE POLICY google_calendar_tokens_owner ON upinbox.google_calendar_tokens
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.google_calendar_tokens TO authenticated;
