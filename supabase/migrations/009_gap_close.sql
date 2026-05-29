-- 009_gap_close.sql
-- Closes capability gaps: push subscriptions, auto-archive rules, deep-clean undo vault

-- ---------------------------------------------------------------------------
-- 1. upinbox.push_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upinbox.push_subscriptions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription    jsonb       NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT push_subscriptions_user_id_unique UNIQUE (user_id)
);

ALTER TABLE upinbox.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'upinbox'
          AND tablename  = 'push_subscriptions'
          AND policyname = 'push_subscriptions_owner'
    ) THEN
        CREATE POLICY push_subscriptions_owner
            ON upinbox.push_subscriptions
            FOR ALL
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
    ON upinbox.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 2. upinbox.auto_archive_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upinbox.auto_archive_rules (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
    name            text        NOT NULL,
    condition_type  text        NOT NULL CHECK (condition_type IN (
                                    'older_than_days',
                                    'sender_domain',
                                    'category',
                                    'no_reply_in_days'
                                )),
    condition_value text        NOT NULL,
    enabled         boolean     NOT NULL DEFAULT true,
    last_run_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upinbox.auto_archive_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'upinbox'
          AND tablename  = 'auto_archive_rules'
          AND policyname = 'auto_archive_rules_owner'
    ) THEN
        CREATE POLICY auto_archive_rules_owner
            ON upinbox.auto_archive_rules
            FOR ALL
            USING (
                account_id IN (
                    SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
                )
            )
            WITH CHECK (
                account_id IN (
                    SELECT id FROM upinbox.accounts WHERE user_id = auth.uid()
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS auto_archive_rules_account_id_idx
    ON upinbox.auto_archive_rules (account_id);

CREATE INDEX IF NOT EXISTS auto_archive_rules_enabled_idx
    ON upinbox.auto_archive_rules (account_id, enabled)
    WHERE enabled = true;

-- ---------------------------------------------------------------------------
-- 3. upinbox.deep_clean_undo_vault
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upinbox.deep_clean_undo_vault (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id      uuid        NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
    message_id      text        NOT NULL,
    original_folder text        NOT NULL,
    action          text        NOT NULL CHECK (action IN ('archived', 'deleted')),
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE upinbox.deep_clean_undo_vault ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'upinbox'
          AND tablename  = 'deep_clean_undo_vault'
          AND policyname = 'deep_clean_undo_vault_owner'
    ) THEN
        CREATE POLICY deep_clean_undo_vault_owner
            ON upinbox.deep_clean_undo_vault
            FOR ALL
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS deep_clean_undo_vault_user_id_idx
    ON upinbox.deep_clean_undo_vault (user_id);

CREATE INDEX IF NOT EXISTS deep_clean_undo_vault_account_id_idx
    ON upinbox.deep_clean_undo_vault (account_id);

CREATE INDEX IF NOT EXISTS deep_clean_undo_vault_expires_at_idx
    ON upinbox.deep_clean_undo_vault (expires_at);
