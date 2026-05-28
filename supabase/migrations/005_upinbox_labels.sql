-- UpInbox: Labels system
-- Labels are stored per-account, applied to emails via IMAP keywords + DB join

CREATE TABLE IF NOT EXISTS upinbox.labels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6366f1', -- hex color
  is_system   boolean NOT NULL DEFAULT false,  -- system labels can't be deleted
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS labels_account_name_idx ON upinbox.labels(account_id, name);

-- Email ↔ label junction (mirrors IMAP keyword $upinbox_label_{id})
CREATE TABLE IF NOT EXISTS upinbox.email_labels (
  email_imap_uid  text NOT NULL,   -- IMAP UID (string form)
  account_id      uuid NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  label_id        uuid NOT NULL REFERENCES upinbox.labels(id) ON DELETE CASCADE,
  applied_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_imap_uid, account_id, label_id)
);

-- RLS
ALTER TABLE upinbox.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE upinbox.email_labels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'labels' AND schemaname = 'upinbox' AND policyname = 'labels_owner') THEN
    CREATE POLICY labels_owner ON upinbox.labels
      USING (account_id IN (
        SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_labels' AND schemaname = 'upinbox' AND policyname = 'email_labels_owner') THEN
    CREATE POLICY email_labels_owner ON upinbox.email_labels
      USING (account_id IN (
        SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.labels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.email_labels TO authenticated;
