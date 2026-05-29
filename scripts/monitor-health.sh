#!/usr/bin/env bash
# monitor-health.sh — UpInbox health monitor
#
# Curls a small set of critical endpoints, logs results with ISO 8601 timestamps,
# and posts a webhook alert when any check fails. Designed to be run on a cron
# every 5–15 minutes.
#
# Configuration (env vars):
#   BASE_URL            — Base URL to probe (default: https://upinbox.ai)
#   MONITOR_WEBHOOK_URL — Webhook to POST JSON alerts on failure (optional)
#   MONITOR_LOG_FILE    — Log file path (default: ./monitor.log relative to script dir)
#   MONITOR_TIMEOUT     — Per-request timeout in seconds (default: 10)
#   MONITOR_EXPECT_2XX  — If "1", only 2xx counts as healthy (default: 2xx or 3xx ok)
#
# Suggested crontab (every 5 minutes):
#   */5 * * * * BASE_URL=https://upinbox.ai MONITOR_WEBHOOK_URL=https://hooks.example.com/xyz /Users/gregorybibas/upinbox-sprint1/scripts/monitor-health.sh >/dev/null 2>&1
#
# Or every 15 minutes:
#   */15 * * * * BASE_URL=https://upinbox.ai MONITOR_WEBHOOK_URL=https://hooks.example.com/xyz /Users/gregorybibas/upinbox-sprint1/scripts/monitor-health.sh >/dev/null 2>&1

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-https://upinbox.ai}"
LOG_FILE="${MONITOR_LOG_FILE:-${SCRIPT_DIR}/monitor.log}"
TIMEOUT="${MONITOR_TIMEOUT:-10}"
EXPECT_2XX="${MONITOR_EXPECT_2XX:-0}"

# Endpoints to probe (path:label)
ENDPOINTS=(
  "/api/upinbox/health:health"
  "/:home"
  "/inbox:inbox"
)

iso_now() {
  # ISO 8601 with timezone offset, portable across BSD/GNU date
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  local ts
  ts="$(iso_now)"
  printf '%s %s\n' "$ts" "$*" >> "$LOG_FILE"
}

is_healthy_status() {
  local code="$1"
  case "$code" in
    2[0-9][0-9]) return 0 ;;
    3[0-9][0-9])
      if [ "$EXPECT_2XX" = "1" ]; then
        return 1
      fi
      return 0
      ;;
    *) return 1 ;;
  esac
}

probe() {
  # Echoes: "<http_code> <time_total_seconds>"
  local url="$1"
  curl -sS -o /dev/null \
    -L \
    --max-time "$TIMEOUT" \
    -w '%{http_code} %{time_total}' \
    -H 'User-Agent: upinbox-monitor/1.0' \
    "$url" 2>/dev/null || echo "000 0"
}

send_alert() {
  local summary="$1"
  local details="$2"
  if [ -z "${MONITOR_WEBHOOK_URL:-}" ]; then
    return 0
  fi
  local ts
  ts="$(iso_now)"
  local host
  host="$(hostname 2>/dev/null || echo unknown)"
  # Best-effort JSON escaping of details
  local esc_details
  esc_details="$(printf '%s' "$details" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g')"
  local esc_summary
  esc_summary="$(printf '%s' "$summary" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  local payload
  payload=$(printf '{"service":"upinbox","host":"%s","timestamp":"%s","status":"unhealthy","summary":"%s","details":"%s","base_url":"%s","text":"[upinbox-monitor] %s — %s"}' \
    "$host" "$ts" "$esc_summary" "$esc_details" "$BASE_URL" "$esc_summary" "$ts")
  curl -sS -o /dev/null \
    --max-time "$TIMEOUT" \
    -H 'Content-Type: application/json' \
    -X POST \
    --data "$payload" \
    "$MONITOR_WEBHOOK_URL" >/dev/null 2>&1 || \
    log "WARN webhook_post_failed url=$MONITOR_WEBHOOK_URL"
}

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
: >> "$LOG_FILE" || {
  echo "monitor-health: cannot write to log file: $LOG_FILE" >&2
  exit 2
}

run_id="$(iso_now)"
log "INFO run_start id=$run_id base_url=$BASE_URL timeout=${TIMEOUT}s"

failures=()
results=()

for entry in "${ENDPOINTS[@]}"; do
  path="${entry%%:*}"
  label="${entry##*:}"
  url="${BASE_URL%/}${path}"

  read -r code dur <<<"$(probe "$url")"
  code="${code:-000}"
  dur="${dur:-0}"

  if is_healthy_status "$code"; then
    log "OK endpoint=$label url=$url status=$code time=${dur}s"
    results+=("OK $label $code ${dur}s")
  else
    log "FAIL endpoint=$label url=$url status=$code time=${dur}s"
    results+=("FAIL $label $code ${dur}s")
    failures+=("$label ($url) status=$code time=${dur}s")
  fi
done

if [ "${#failures[@]}" -gt 0 ]; then
  summary="${#failures[@]} endpoint(s) unhealthy on ${BASE_URL}"
  details=""
  for f in "${failures[@]}"; do
    details="${details}- ${f}"$'\n'
  done
  log "ALERT $summary"
  send_alert "$summary" "$details"
  log "INFO run_end id=$run_id result=unhealthy failures=${#failures[@]}"
  exit 1
fi

log "INFO run_end id=$run_id result=healthy checks=${#ENDPOINTS[@]}"
exit 0
