#!/bin/bash
# Verify your UpInbox self-hosted instance is ready to deploy
# Usage: ./scripts/check-deploy.sh

EXIT_CODE=0
echo "🔍 Checking UpInbox deploy readiness..."

# Check env file
if [ ! -f .env.local ]; then
  echo "❌ .env.local not found. Copy from .env.example."
  EXIT_CODE=1
else
  echo "✓ .env.local exists"

  # Check required vars
  for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY ENCRYPTION_KEY CRON_SECRET; do
    if grep -q "^${var}=." .env.local 2>/dev/null; then
      echo "✓ ${var} is set"
    else
      echo "❌ ${var} not set in .env.local"
      EXIT_CODE=1
    fi
  done
fi

# Check Node version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ "${NODE_VERSION:-0}" -lt 20 ]; then
  echo "❌ Node.js 20+ required (found: $(node -v 2>/dev/null))"
  EXIT_CODE=1
else
  echo "✓ Node.js $(node -v)"
fi

# Check package install
if [ ! -d node_modules ]; then
  echo "❌ node_modules not found. Run: npm install"
  EXIT_CODE=1
else
  echo "✓ node_modules present"
fi

# Check build artifacts
if [ ! -d .next ]; then
  echo "⚠️  .next not found. Run: npm run build"
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Ready to deploy"
else
  echo "❌ Issues found. Fix above before deploying."
fi
exit $EXIT_CODE
