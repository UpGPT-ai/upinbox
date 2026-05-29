-- ============================================================
-- 008_sprint234.sql
-- Sprint 2/3/4 tables: signatures, saved_searches,
-- follow_up_reminders, health_score_history,
-- contact_pulses, draft_profiles
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. upinbox.signatures
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upinbox.signatures (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL DEFAULT 'Default',
  html       text        NOT NULL DEFAULT '',
  is_default boolean     NOT NULL DEFAULT false,
  use_on_reply boolean   NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upinbox.signatures ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_signatures_account_id ON upinbox.signatures(account_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox' AND tablename = 'signatures' AND policyname = 'signatures_owner'
  ) THEN
    CREATE POLICY signatures_owner ON upinbox.signatures
      USING (
        account_id IN (
          SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. upinbox.saved_searches
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upinbox.saved_searches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  query      jsonb       NOT NULL,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upinbox.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON upinbox.saved_searches(user_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox' AND tablename = 'saved_searches' AND policyname = 'saved_searches_owner'
  ) THEN
    CREATE POLICY saved_searches_owner ON upinbox.saved_searches
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. upinbox.follow_up_reminders
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upinbox.follow_up_reminders (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  message_id     text        NOT NULL,
  thread_subject text,
  remind_at      timestamptz NOT NULL,
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'fired', 'cancelled', 'replied')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upinbox.follow_up_reminders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_account_id ON upinbox.follow_up_reminders(account_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_remind_at  ON upinbox.follow_up_reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_status     ON upinbox.follow_up_reminders(status);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox' AND tablename = 'follow_up_reminders' AND policyname = 'follow_up_reminders_owner'
  ) THEN
    CREATE POLICY follow_up_reminders_owner ON upinbox.follow_up_reminders
      USING (
        account_id IN (
          SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. upinbox.health_score_history
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upinbox.health_score_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score        numeric(4,1) NOT NULL,
  unread_count int         NOT NULL DEFAULT 0,
  inbox_count  int         NOT NULL DEFAULT 0,
  computed_at  date        NOT NULL DEFAULT current_date,
  UNIQUE (user_id, computed_at)
);

ALTER TABLE upinbox.health_score_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_health_score_history_user_id     ON upinbox.health_score_history(user_id);
CREATE INDEX IF NOT EXISTS idx_health_score_history_computed_at ON upinbox.health_score_history(computed_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox' AND tablename = 'health_score_history' AND policyname = 'health_score_history_owner'
  ) THEN
    CREATE POLICY health_score_history_owner ON upinbox.health_score_history
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. upinbox.contact_pulses
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upinbox.contact_pulses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  contact_email    text        NOT NULL,
  contact_name     text,
  sent_count       int         NOT NULL DEFAULT 0,
  received_count   int         NOT NULL DEFAULT 0,
  last_contact_at  timestamptz,
  first_contact_at timestamptz,
  avg_response_hrs numeric(6,1),
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'prospect', 'dormant', 'vip')),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, contact_email)
);

ALTER TABLE upinbox.contact_pulses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_contact_pulses_account_id     ON upinbox.contact_pulses(account_id);
CREATE INDEX IF NOT EXISTS idx_contact_pulses_contact_email  ON upinbox.contact_pulses(contact_email);
CREATE INDEX IF NOT EXISTS idx_contact_pulses_last_contact_at ON upinbox.contact_pulses(last_contact_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_pulses_status         ON upinbox.contact_pulses(status);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox' AND tablename = 'contact_pulses' AND policyname = 'contact_pulses_owner'
  ) THEN
    CREATE POLICY contact_pulses_owner ON upinbox.contact_pulses
      USING (
        account_id IN (
          SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. upinbox.draft_profiles
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upinbox.draft_profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name     text,
  role          text,
  company       text,
  tone          text        NOT NULL DEFAULT 'professional',
  extra_context text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upinbox.draft_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_draft_profiles_user_id ON upinbox.draft_profiles(user_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'upinbox' AND tablename = 'draft_profiles' AND policyname = 'draft_profiles_owner'
  ) THEN
    CREATE POLICY draft_profiles_owner ON upinbox.draft_profiles
      USING (user_id = auth.uid());
  END IF;
END $$;
