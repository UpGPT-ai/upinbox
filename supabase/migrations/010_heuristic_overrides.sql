-- Migration 010: heuristic overrides for screener learning loop
-- Stores per-sender manual corrections so the classifier can auto-apply them next time.

CREATE TABLE IF NOT EXISTS upinbox.heuristic_overrides (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  sender_email text       NOT NULL,
  pattern_type text       NOT NULL DEFAULT 'sender',
  category    text        NOT NULL,
  source      text        NOT NULL DEFAULT 'manual',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT heuristic_overrides_account_sender_uq UNIQUE (account_id, sender_email)
);

-- RLS: each row is owned by the account that created it
ALTER TABLE upinbox.heuristic_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox'
      AND tablename  = 'heuristic_overrides'
      AND policyname = 'heuristic_overrides_account_owner'
  ) THEN
    CREATE POLICY heuristic_overrides_account_owner
      ON upinbox.heuristic_overrides
      FOR ALL
      USING (
        account_id IN (
          SELECT id FROM upinbox.accounts WHERE auth_user_id = auth.uid()
        )
      )
      WITH CHECK (
        account_id IN (
          SELECT id FROM upinbox.accounts WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Efficient lookup: given an account + sender, find the override in O(log n)
CREATE INDEX IF NOT EXISTS heuristic_overrides_account_sender_idx
  ON upinbox.heuristic_overrides (account_id, sender_email);
