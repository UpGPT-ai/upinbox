#!/usr/bin/env bash
#
# backup-supabase.sh
#
# Logical backup of the `upinbox` schema via the Supabase Management API.
# - Dumps schema + data as SQL using `pg_dump`-style export endpoint
# - Gzips the output
# - Optionally uploads to S3 when BACKUP_S3_BUCKET is set and `aws` is on PATH
#
# Required environment variables:
#   SUPABASE_TOKEN   Personal access token for the Supabase Management API
#   PROJECT_REF      Supabase project ref (e.g. abcdefghijklmnop)
#
# Optional environment variables:
#   BACKUP_DIR        Local output directory (default: ./backups)
#   BACKUP_SCHEMA     Schema to back up (default: upinbox)
#   BACKUP_S3_BUCKET  If set, upload the gzipped dump to s3://$BACKUP_S3_BUCKET/...
#   BACKUP_S3_PREFIX  S3 key prefix (default: supabase-backups)
#
# Exit codes:
#   0  success
#   1  missing required env var
#   2  API error
#   3  upload error
#
set -euo pipefail

# ---------- config ----------
SCHEMA="${BACKUP_SCHEMA:-upinbox}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
S3_PREFIX="${BACKUP_S3_PREFIX:-supabase-backups}"

# ---------- helpers ----------
log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

die() {
  local code="$1"; shift
  log "ERROR: $*"
  exit "$code"
}

# ---------- preflight ----------
: "${SUPABASE_TOKEN:?SUPABASE_TOKEN env var is required}"
: "${PROJECT_REF:?PROJECT_REF env var is required}"

for bin in curl gzip jq; do
  command -v "$bin" >/dev/null 2>&1 || die 1 "required binary '$bin' not found on PATH"
done

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
BASENAME="supabase-${PROJECT_REF}-${SCHEMA}-${TIMESTAMP}.sql"
OUT_SQL="${BACKUP_DIR}/${BASENAME}"
OUT_GZ="${OUT_SQL}.gz"

log "starting backup: project=${PROJECT_REF} schema=${SCHEMA} out=${OUT_GZ}"

# ---------- dump ----------
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

# We synthesize a logical dump by:
#   1) emitting CREATE SCHEMA + table DDL via information_schema introspection
#   2) emitting COPY statements for each table's data
# The Management API only exposes raw SQL execution, so we use it as our query engine.
#
# Strategy: ask Postgres to build the dump for us with `pg_get_tabledef`-style queries
# via a single SQL statement that returns a JSON array of {table, ddl, copy_sql} rows,
# then assemble the .sql file client-side.

# Step 1: list tables in the schema
TABLES_JSON="$(mktemp -t backup-tables.XXXXXX)"
trap 'rm -f "$TABLES_JSON"' EXIT

HTTP_CODE="$(curl -sS -o "$TABLES_JSON" -w '%{http_code}' \
  -X POST "$API" \
  -H "Authorization: Bearer ${SUPABASE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg schema "$SCHEMA" '{
        query: "SELECT tablename FROM pg_tables WHERE schemaname = \($schema | tojson | fromjson | tostring | @json) ORDER BY tablename"
      }' | jq --arg s "$SCHEMA" \
        '{query: ("SELECT tablename FROM pg_tables WHERE schemaname = " + ($s | @json) + " ORDER BY tablename")}')" \
)" || die 2 "curl failed listing tables"

if [ "$HTTP_CODE" != "200" ]; then
  log "response body:"
  cat "$TABLES_JSON" >&2 || true
  die 2 "Management API returned HTTP $HTTP_CODE while listing tables"
fi

TABLES=()
while IFS= read -r t; do
  [ -n "$t" ] && TABLES+=("$t")
done < <(jq -r '.[].tablename // empty' "$TABLES_JSON")

log "found ${#TABLES[@]} table(s) in schema '${SCHEMA}'"

# Step 2: emit dump header
{
  echo "-- Supabase logical backup"
  echo "-- project_ref: ${PROJECT_REF}"
  echo "-- schema:      ${SCHEMA}"
  echo "-- generated:   $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "--"
  echo "SET statement_timeout = 0;"
  echo "SET client_encoding = 'UTF8';"
  echo "SET standard_conforming_strings = on;"
  echo "CREATE SCHEMA IF NOT EXISTS \"${SCHEMA}\";"
  echo ""
} > "$OUT_SQL"

# Step 3: per-table DDL + data
run_query() {
  # $1 = SQL string ; prints jq-parsed JSON array to stdout
  local sql="$1"
  local body
  body="$(jq -n --arg q "$sql" '{query: $q}')"
  local resp
  local code
  local tmp
  tmp="$(mktemp -t backup-q.XXXXXX)"
  code="$(curl -sS -o "$tmp" -w '%{http_code}' \
    -X POST "$API" \
    -H "Authorization: Bearer ${SUPABASE_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body")" || { rm -f "$tmp"; die 2 "curl failed for query"; }
  if [ "$code" != "200" ]; then
    log "query failed: $sql"
    cat "$tmp" >&2 || true
    rm -f "$tmp"
    die 2 "Management API returned HTTP $code"
  fi
  cat "$tmp"
  rm -f "$tmp"
}

emit_table() {
  local table="$1"
  log "dumping ${SCHEMA}.${table}"

  # DDL via pg_get_* helpers — Supabase exposes these via SQL
  local ddl_sql
  ddl_sql=$(cat <<SQL
SELECT
  'CREATE TABLE IF NOT EXISTS "${SCHEMA}"."${table}" (' || E'\n' ||
  string_agg(
    '  "' || column_name || '" ' || data_type ||
    CASE WHEN character_maximum_length IS NOT NULL
         THEN '(' || character_maximum_length || ')' ELSE '' END ||
    CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
    E',\n' ORDER BY ordinal_position
  ) || E'\n);' AS ddl
FROM information_schema.columns
WHERE table_schema = '${SCHEMA}' AND table_name = '${table}'
SQL
)
  local ddl
  ddl="$(run_query "$ddl_sql" | jq -r '.[0].ddl // empty')"
  if [ -n "$ddl" ]; then
    {
      echo "-- ----- table: ${SCHEMA}.${table} -----"
      echo "$ddl"
      echo ""
    } >> "$OUT_SQL"
  fi

  # Data as INSERTs (json_agg of row arrays); for large tables this is fine for logical backup
  local data_sql="SELECT coalesce(json_agg(t), '[]'::json) AS rows FROM \"${SCHEMA}\".\"${table}\" t"
  local rows_file
  rows_file="$(mktemp -t backup-rows.XXXXXX)"
  run_query "$data_sql" > "$rows_file"

  local row_count
  row_count="$(jq -r '.[0].rows | length' "$rows_file")"
  log "  rows: ${row_count}"

  if [ "$row_count" -gt 0 ]; then
    # Emit one INSERT per row, columns inferred from first row
    jq -r --arg schema "$SCHEMA" --arg table "$table" '
      .[0].rows as $rows
      | ($rows[0] | keys_unsorted) as $cols
      | $rows
      | map(
          . as $r
          | "INSERT INTO \"" + $schema + "\".\"" + $table + "\" (" +
            ($cols | map("\"" + . + "\"") | join(", ")) +
            ") VALUES (" +
            ($cols | map(
              ($r[.]) as $v
              | if $v == null then "NULL"
                elif ($v|type) == "string" then "'\''" + ($v|gsub("'\''"; "'\'''\''")) + "'\''"
                elif ($v|type) == "boolean" then ($v|tostring)
                elif ($v|type) == "number" then ($v|tostring)
                else "'\''" + ($v|tojson|gsub("'\''"; "'\'''\''")) + "'\''"
                end
            ) | join(", ")) +
            ");"
        )
      | .[]
    ' "$rows_file" >> "$OUT_SQL"
    echo "" >> "$OUT_SQL"
  fi

  rm -f "$rows_file"
}

for t in "${TABLES[@]}"; do
  emit_table "$t"
done

# ---------- gzip ----------
log "gzipping ${OUT_SQL}"
gzip -f "$OUT_SQL"
[ -f "$OUT_GZ" ] || die 2 "expected gzipped output ${OUT_GZ} not found"

SIZE_BYTES="$(wc -c < "$OUT_GZ" | tr -d ' ')"
log "backup complete: ${OUT_GZ} (${SIZE_BYTES} bytes)"

# ---------- optional S3 upload ----------
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    die 3 "BACKUP_S3_BUCKET set but 'aws' CLI not found on PATH"
  fi
  DATE_PREFIX="$(date -u +'%Y/%m/%d')"
  S3_KEY="${S3_PREFIX}/${PROJECT_REF}/${DATE_PREFIX}/${BASENAME}.gz"
  S3_URI="s3://${BACKUP_S3_BUCKET}/${S3_KEY}"
  log "uploading to ${S3_URI}"
  if ! aws s3 cp "$OUT_GZ" "$S3_URI" --only-show-errors; then
    die 3 "aws s3 cp failed"
  fi
  log "uploaded ${S3_URI}"
else
  log "BACKUP_S3_BUCKET not set; skipping S3 upload"
fi

log "done"
exit 0
