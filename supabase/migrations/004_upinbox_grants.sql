-- UpInbox Grants — Migration 004
-- Grants SELECT/INSERT/UPDATE/DELETE on all upinbox app tables
-- to the authenticated and service_role roles.
-- RLS policies on each table enforce per-user row isolation.
-- Schema USAGE already granted via Supabase PostgREST config.

GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.accounts         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.mailboxes        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.mcp_tokens       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.screener_rules   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.screener_decisions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.triage_results   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.oauth_states     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.issued_licenses  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.usx_cache        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.usx_inbox        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.org_inbox_skills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.org_members      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.user_inbox_skills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.user_keys        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON upinbox.subscriptions    TO authenticated, service_role;
