#!/usr/bin/env bash
# UpInbox upgrade script — pulls latest image and restarts
# Usage: bash scripts/upgrade.sh [--dir /opt/upinbox]

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/upinbox}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

cd "${INSTALL_DIR}"

echo "Pulling latest UpInbox image..."
docker compose pull upinbox

echo "Restarting..."
docker compose up -d upinbox

echo "Upgrade complete. Running version:"
docker compose exec upinbox node -e "const p = require('./package.json'); console.log(p.version);" 2>/dev/null || echo "(version check unavailable)"
