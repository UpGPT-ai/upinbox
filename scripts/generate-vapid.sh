#!/bin/bash
# Generate VAPID keys for Web Push notifications.
# Usage: ./scripts/generate-vapid.sh
#
# Outputs: VAPID_PUBLIC_KEY=, VAPID_PRIVATE_KEY=, VAPID_SUBJECT=
# Append these to your .env.local

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx not found. Install Node.js first."
  exit 1
fi

npx --yes web-push generate-vapid-keys --json | jq -r '
  "VAPID_PUBLIC_KEY=" + .publicKey,
  "VAPID_PRIVATE_KEY=" + .privateKey,
  "VAPID_SUBJECT=mailto:admin@example.com"
'

echo "" >&2
echo "Append the above 3 lines to your .env.local file." >&2
echo "Replace mailto:admin@example.com with your actual contact email." >&2
