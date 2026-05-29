#!/usr/bin/env bash
#
# cleanup-undo-vault.sh
#
# Daily cleanup job for UpInbox housekeeping tables.
#   1. Deletes expired rows from upinbox.deep_clean_undo_vault
#      (rows where expires_at <= now()).
#   2. Deletes terminal follow_up_reminders rows older than 30 days
#      (status IN ('fired','cancelled') AND updated_at < now() - 30 days).
#
# Runs against the Supabase Management API using SUPABASE_TOKEN and
# PROJECT_REF environment variables. Shell only — no node/python deps.
#
# Required env vars:
#   SUPABASE_TOKEN   Supabase Management API personal access token
#   PROJECT_REF      Supabase project ref (e.g. pnwgbggngbscwvuowhyh)
#
# Exit codes:
#   0  success
#   1  missing required env var
#   2  API call failed
#

set -euo pipefail

# ---------- env validation ----------
: "${SUPABASE_TOKEN:?SUPABASE_TOKEN is required}"
: "${PROJECT_REF:?PROJECT_REF is required}"

API="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

# ---------- helper ----------
run_sql() {
  local label="$1"
  local sql="$2"

  # Build JSON body safely (escape embedded quotes/newlines via python? — keep shell-only)
  # SQL here has no embedded double quotes or backslashes, so a simple heredoc is fine.
  local body
  body=$(printf '{"query": %s}' "$(printf '%s' "$sql" | awk 'BEGIN{printf "\""} {gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); printf "%s\\n", $0} END{printf "\""}')")

  local response http_code
  response=$(curl -sS -w "\n%{http_code}" "$API" \
    -H "Authorization: Bearer ${SUPABASE_TOKEN}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d "$body")

  http_code=$(printf '%s' "$response" | tail -n1)
  body_out=$(printf '%s' "$response" | sed '$d')

  if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
    echo "[cleanup-undo-vault] ${label} FAILED (HTTP ${http_code}): ${body_out}" >&2
    exit 2
  fi

  echo "[cleanup-undo-vault] ${label} OK: ${body_out}"
}

# ---------- 1. Expired undo-vault rows ----------
run_sql "deep_clean_undo_vault expired purge" "
WITH deleted AS (
  DELETE FROM upinbox.deep_clean_undo_vault
  WHERE expires_at <= now()
  RETURNING 1
)
SELECT count(*) AS deleted_undo_vault_rows FROM deleted;
"

# ---------- 2. Old terminal follow-up reminders ----------
run_sql "follow_up_reminders terminal purge" "
WITH deleted AS (
  DELETE FROM upinbox.follow_up_reminders
  WHERE status IN ('fired','cancelled')
    AND updated_at < now() - interval '30 days'
  RETURNING 1
)
SELECT count(*) AS deleted_reminder_rows FROM deleted;
"

echo "[cleanup-undo-vault] done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
