-- Migration 006: Add mailbox_order column to upinbox.accounts
-- Stores a JSON array of mailbox IDs in the user's preferred order.
-- Empty/null means default sort order applies.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'upinbox'
      AND table_name = 'accounts'
      AND column_name = 'mailbox_order'
  ) THEN
    ALTER TABLE upinbox.accounts
      ADD COLUMN mailbox_order jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
