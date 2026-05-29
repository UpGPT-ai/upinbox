-- Migration: 007_sprint1_snooze_sendlater
-- Adds snooze and send-later capability tables to the upinbox schema.

-- ─── snoozed_messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.snoozed_messages (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id   uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  message_id   text        NOT NULL,
  unsnooze_at  timestamptz NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (account_id, message_id)
);

ALTER TABLE upinbox.snoozed_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox'
      AND tablename  = 'snoozed_messages'
      AND policyname = 'owner'
  ) THEN
    CREATE POLICY "owner" ON upinbox.snoozed_messages
      USING (
        account_id IN (
          SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS snoozed_messages_account_id_idx
  ON upinbox.snoozed_messages (account_id);

CREATE INDEX IF NOT EXISTS snoozed_messages_unsnooze_at_idx
  ON upinbox.snoozed_messages (unsnooze_at);

-- ─── scheduled_sends ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upinbox.scheduled_sends (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  send_at     timestamptz NOT NULL,
  payload     jsonb       NOT NULL,
  status      text        DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE upinbox.scheduled_sends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox'
      AND tablename  = 'scheduled_sends'
      AND policyname = 'owner'
  ) THEN
    CREATE POLICY "owner" ON upinbox.scheduled_sends
      USING (
        account_id IN (
          SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS scheduled_sends_account_id_idx
  ON upinbox.scheduled_sends (account_id);

CREATE INDEX IF NOT EXISTS scheduled_sends_send_at_idx
  ON upinbox.scheduled_sends (send_at);
