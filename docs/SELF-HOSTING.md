# Self-Hosting UpInbox

> **Version:** 1.0 — May 2026

UpInbox is designed to be self-hostable. This guide walks you through a complete production deployment on any Linux server with Docker Compose.

**Time to deploy:** ~10 minutes for a basic setup.
**What you get:** Full UpInbox client, BYOK AI, USX encryption, MCP server, optional Stalwart mail server.
**What requires a license:** Intelligence API (95% accuracy classifier), SSO/SAML, SCIM provisioning, >10 users.
**Community tier (free):** Up to 10 users, heuristic classifier, BYOK AI, full USX encryption, MCP server — forever free, no credit card.

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Quick Start (5 Commands)](#2-quick-start-5-commands)
3. [docker-compose.yml Walkthrough](#3-docker-composeyml-walkthrough)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [PLATFORM_ENCRYPTION_KEY — Deep Dive](#5-platform_encryption_key--deep-dive)
6. [License JWT and Tiers](#6-license-jwt-and-tiers)
7. [Setting Up Your Domain](#7-setting-up-your-domain)
8. [Connecting Gmail, Outlook, and IMAP Accounts](#8-connecting-gmail-outlook-and-imap-accounts)
9. [Enabling @yourdomain.com Addresses (Stalwart)](#9-enabling-yourdomaincom-addresses-stalwart)
10. [Upgrading](#10-upgrading)
11. [Backup Strategy](#11-backup-strategy)
12. [Troubleshooting Common Issues](#12-troubleshooting-common-issues)
13. [Security Checklist](#13-security-checklist)

---

## 1. System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| RAM | 2 GB | 4 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 10 GB | 40 GB |
| OS | Any Linux with Docker | Ubuntu 22.04 LTS / Debian 12 |
| Docker | 24.0+ | Latest stable |
| Docker Compose | v2.20+ | Latest stable |
| Domain | Required (for HTTPS + USX) | — |

**Note on disk:** UpInbox does not store email content locally — it fetches live from Gmail/Outlook/IMAP. The 10 GB minimum covers the Docker images, Postgres database (account metadata, classification results), and Stalwart blob storage if you host `@yourdomain.com` addresses. If using Stalwart, plan 1–2 GB per active mailbox.

### Port Requirements

| Port | Service | Public? |
|---|---|---|
| 3001 | UpInbox web app | Behind reverse proxy (expose 443) |
| 5432 | Postgres | Internal only (never public) |
| 8080 | Stalwart JMAP | Behind reverse proxy if @yourdomain.com |
| 25 | Stalwart SMTP inbound | Public (if hosting @yourdomain.com MX) |
| 465 / 587 | Stalwart SMTP submission | Public (if hosting @yourdomain.com) |

---

## 2. Quick Start (5 Commands)

```bash
git clone https://github.com/UpGPT-ai/upinbox.git
cd upinbox
cp env.example .env
# Edit .env — set at minimum: PLATFORM_ENCRYPTION_KEY, NEXTAUTH_SECRET, NEXTAUTH_URL
# and your Supabase credentials (or use --profile db for local Postgres)
docker compose pull
docker compose up -d
```

Visit `http://your-server:3001` → connect your Gmail or Outlook → done.

After the initial deploy, create the first admin user at `http://your-server:3001/setup`. This endpoint is only accessible before any users exist.

---

## 3. docker-compose.yml Walkthrough

The default `docker-compose.yml` defines three services:

```yaml
version: "3.9"

services:
  # ─── Core app ───────────────────────────────────────────────────────────────
  upinbox:
    image: ghcr.io/upgpt-ai/upinbox:latest
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── Database ───────────────────────────────────────────────────────────────
  # Only used with --profile db (local Postgres mode)
  # Recommended: use hosted Supabase instead
  postgres:
    image: postgres:16-alpine
    profiles: ["db"]
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: upinbox
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: upinbox
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U upinbox"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Mail server (optional) ──────────────────────────────────────────────────
  # Only used with --profile mail (for @yourdomain.com addresses)
  stalwart:
    image: stalwartlabs/mail-server:latest
    profiles: ["mail"]
    restart: unless-stopped
    ports:
      - "25:25"      # SMTP inbound
      - "465:465"    # SMTP submission (TLS)
      - "587:587"    # SMTP submission (STARTTLS)
      - "993:993"    # IMAP
      - "8080:8080"  # JMAP + admin API
    volumes:
      - stalwart_data:/opt/stalwart-mail
      - ./config/stalwart:/etc/stalwart:ro
    environment:
      TZ: UTC

volumes:
  postgres_data:
  stalwart_data:
```

### Profile Usage

```bash
# Default: only UpInbox app (assumes hosted Supabase)
docker compose up -d

# With local Postgres (development / air-gapped):
docker compose --profile db up -d

# With Stalwart mail server (for @yourdomain.com addresses):
docker compose --profile mail up -d

# With both local Postgres and Stalwart:
docker compose --profile db --profile mail up -d
```

---

## 4. Environment Variables Reference

Copy `env.example` to `.env` and fill in the values below.

### Required — Always

| Variable | Description | How to Generate |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | From Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe to expose in browser) | Same location |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **server-side only, never in NEXT_PUBLIC_*** | Same location |
| `PLATFORM_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM. This is YOUR key. UpInbox never sees it. | `openssl rand -hex 32` |
| `NEXTAUTH_SECRET` | Secret for signing session JWTs | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Full URL of your UpInbox instance | e.g. `https://mail.yourcompany.com` |
| `NEXT_PUBLIC_APP_URL` | Same as NEXTAUTH_URL (used in email links) | e.g. `https://mail.yourcompany.com` |
| `INSTANCE_DOMAIN` | Your instance's domain (used for USX DNS + license binding) | e.g. `yourcompany.com` |

### Licensing and Intelligence API

| Variable | Description | Default |
|---|---|---|
| `LICENSE_JWT` | Business/Enterprise license. Blank = Community tier (free, ≤10 users, heuristic + BYOK). | (blank) |
| `INTELLIGENCE_API_URL` | UpInbox Intelligence API endpoint. Change only if self-hosting the API too. | `https://api.upinbox.ai/v1/intelligence` |

### Optional — Stalwart Mail Server

| Variable | Description |
|---|---|
| `STALWART_ADMIN_SECRET` | Admin API secret — must match Stalwart config. Generate: `openssl rand -hex 32` |
| `STALWART_JMAP_URL` | Internal URL of Stalwart JMAP endpoint. Default: `http://stalwart:8080` |

### Optional — Stripe (for managing your own user billing)

These are only needed if you are building a reseller deployment where you charge end users.

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (browser-safe) |

---

## 5. PLATFORM_ENCRYPTION_KEY — Deep Dive

`PLATFORM_ENCRYPTION_KEY` is a 32-byte random value (encoded as 64 hex characters) used to encrypt IMAP credentials and OAuth tokens at rest in your database. It is your key — UpInbox servers never see it.

### What It Protects

When a user connects their Gmail or Outlook account, UpInbox receives an OAuth access token and refresh token. These are encrypted before being written to the database:

```
OAuth tokens (plaintext)
  ↓
AES-256-GCM encrypt(tokens, PLATFORM_ENCRYPTION_KEY, random_iv)
  ↓
credentials_enc + credentials_iv → stored in DB
```

Without `PLATFORM_ENCRYPTION_KEY`, the stored blobs cannot be decrypted and users cannot sync their mail.

### Generating

```bash
openssl rand -hex 32
# Example output: a3f8c2d1e4b7a9f0c3d6e8b2a1f4c7d0e3b6a9f2c5d8e1b4a7f0c3d6e9b2a5
```

### Storage Recommendations

| Environment | Recommended Storage |
|---|---|
| Development | `.env` file (never commit to git) |
| Production (small team) | `.env` file on server, in `/etc/upinbox/` with `chmod 600` |
| Production (Business) | AWS Secrets Manager, HashiCorp Vault, or GCP Secret Manager |
| Enterprise | Hardware Security Module (HSM) or cloud KMS |

To load from a secret manager instead of a file:

```bash
# Example: load from AWS Secrets Manager at container startup
PLATFORM_ENCRYPTION_KEY=$(aws secretsmanager get-secret-value \
  --secret-id upinbox/platform-encryption-key \
  --query SecretString --output text) docker compose up -d
```

### Rotation

If you need to rotate `PLATFORM_ENCRYPTION_KEY` (e.g., suspected compromise):

```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Run rotation script (decrypts all blobs with old key, re-encrypts with new key)
docker compose run --rm upinbox \
  node scripts/rotate-encryption-key.js \
  --old-key "$OLD_PLATFORM_ENCRYPTION_KEY" \
  --new-key "$NEW_KEY"

# Update .env
sed -i "s/PLATFORM_ENCRYPTION_KEY=.*/PLATFORM_ENCRYPTION_KEY=$NEW_KEY/" .env

# Restart
docker compose restart upinbox
```

Rotation takes approximately 50ms per user account. It is safe to run with the app live.

### What Happens If You Lose It

If `PLATFORM_ENCRYPTION_KEY` is lost:
- Users can still log in and create new accounts
- Existing account connections cannot be decrypted — users must re-connect their Gmail/Outlook
- USX-encrypted email content is unaffected (protected by users' own passwords, not this key)
- **Back up this key. Store it in at least two separate locations.**

---

## 6. License JWT and Tiers

### Tier Comparison

| Tier | Price | Max Users | Intelligence API | SSO / SAML | SCIM | SLA |
|---|---|---|---|---|---|---|
| Community | Free | 10 | ❌ (heuristic + BYOK) | ❌ | ❌ | — |
| Business | $499/yr | 50 | ✅ | ✅ | ❌ | 99.5% (if self-hosted) |
| Enterprise | $2,999/yr | Unlimited | ✅ | ✅ | ✅ | 99.9% + support SLA |

Community tier is fully functional for small teams and personal use. The only limitation is the 10-user cap and lack of Intelligence API access. BYOK AI and UpLink local AI work on all tiers.

### Obtaining a License

1. Visit [https://upinbox.ai/licenses](https://upinbox.ai/licenses)
2. Select Business or Enterprise
3. Pay — you'll receive a `LICENSE_JWT` by email and in your account dashboard
4. The JWT encodes: tier, expiry date, max users, and a cryptographic signature bound to your `INSTANCE_DOMAIN`

### Activating

```bash
# In .env:
LICENSE_JWT=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
INSTANCE_DOMAIN=yourcompany.com   # must match the domain in the JWT

# Restart to activate:
docker compose restart upinbox

# Verify:
curl https://mail.yourcompany.com/api/license/status
# → { "tier": "business", "users_max": 50, "expires_at": "2027-01-01", "valid": true }
```

### License Enforcement

- At 10 users (Community) or 50 users (Business), the `/api/auth/register` endpoint returns HTTP 402 and refuses new signups. Existing users are not affected.
- The license check is local (JWT validation against your `INSTANCE_DOMAIN`) — no license server call on every request.
- Expired licenses fall back to Community tier features (heuristic + BYOK). Your data and existing users are unaffected; only Intelligence API access stops.

---

## 7. Setting Up Your Domain

### Reverse Proxy (HTTPS)

Always put UpInbox behind a reverse proxy with TLS. Direct HTTP access is only suitable for local development.

**Caddy (automatic HTTPS — recommended for simplicity):**
```
mail.yourcompany.com {
    reverse_proxy localhost:3001
}
```
Caddy automatically obtains and renews Let's Encrypt certificates.

**Nginx with Certbot:**
```nginx
server {
    listen 443 ssl http2;
    server_name mail.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/mail.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.yourcompany.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; ...";

    location / {
        proxy_pass         http://localhost:3001;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name mail.yourcompany.com;
    return 301 https://$host$request_uri;
}
```

### DNS Records for USX

To enable 🔒 encrypted delivery between UpInbox users:

```bash
# Step 1: Get your TLS certificate SHA-256 fingerprint
openssl s_client -connect mail.yourcompany.com:443 -showcerts 2>/dev/null \
  | openssl x509 -fingerprint -sha256 -noout \
  | sed 's/SHA256 Fingerprint=//; s/://g' \
  | tr 'A-F' 'a-f'

# Step 2: Add TXT record at your DNS provider
# Name:  _upinbox.yourcompany.com
# Type:  TXT
# Value: "v=USX1; endpoint=https://mail.yourcompany.com/usx; fp=sha256:YOURFINGERPRINT"

# Step 3: Verify
dig TXT _upinbox.yourcompany.com +short
curl https://mail.yourcompany.com/api/usx/health
```

See [USX-PROTOCOL.md](./USX-PROTOCOL.md) for full USX setup details.

### DNS Records for @yourdomain.com Addresses (Stalwart)

If hosting your own email addresses (optional — requires `--profile mail`):

```
# MX record (mail routing)
yourcompany.com.      MX  10  mail.yourcompany.com.

# SPF (authorize your server to send for yourcompany.com)
yourcompany.com.      TXT "v=spf1 ip4:YOUR_SERVER_IP -all"

# DKIM (generated by Stalwart on first boot — check Stalwart admin for the value)
mail._domainkey.yourcompany.com.  TXT "v=DKIM1; k=rsa; p=MIIBIjAN..."

# DMARC
_dmarc.yourcompany.com.  TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourcompany.com"
```

---

## 8. Connecting Gmail, Outlook, and IMAP Accounts

After deployment, users connect their email accounts through the UpInbox onboarding wizard at `/connect`.

### Gmail

1. Click "Connect Gmail" → OAuth 2.0 flow opens in a new window
2. Sign in with your Google account and grant the requested permissions:
   - `gmail.modify` — read, compose, send, and permanently delete threads
   - `gmail.labels` — manage labels
3. UpInbox stores the OAuth token encrypted with `PLATFORM_ENCRYPTION_KEY`
4. Initial sync begins (may take 1–5 minutes for large inboxes)

**Gmail OAuth app configuration (for self-hosters):**
UpInbox includes a default OAuth client ID for the hosted version. For production self-hosting, you should register your own OAuth app:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable Gmail API
3. OAuth consent screen → Add scopes: `gmail.modify`, `gmail.labels`
4. OAuth credentials → Web application → Add redirect URI: `https://mail.yourcompany.com/api/auth/callback/google`
5. Add to `.env`: `GOOGLE_CLIENT_ID=your-client-id`, `GOOGLE_CLIENT_SECRET=your-secret`

### Outlook / Microsoft 365

1. Click "Connect Outlook" → Microsoft identity platform OAuth flow
2. Grant permissions: `Mail.ReadWrite`, `Mail.Send`, `offline_access`
3. UpInbox stores the token encrypted with `PLATFORM_ENCRYPTION_KEY`

**Outlook OAuth app configuration:**
1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations
2. New registration → Redirect URI: `https://mail.yourcompany.com/api/auth/callback/microsoft-entra-id`
3. API Permissions → Add: `Mail.ReadWrite`, `Mail.Send`, `offline_access`
4. Add to `.env`: `MICROSOFT_CLIENT_ID=your-client-id`, `MICROSOFT_CLIENT_SECRET=your-secret`

### Generic IMAP

1. Click "Connect IMAP/SMTP server"
2. Enter: IMAP host, IMAP port (993 for SSL, 143 for STARTTLS), username, password
3. UpInbox auto-detects settings for common providers (Fastmail, ProtonMail Bridge, iCloud, Yahoo)
4. SMTP settings are auto-derived or can be set manually

### Fastmail / Stalwart (JMAP)

Fastmail and Stalwart support JMAP natively (RFC 8620). UpInbox detects JMAP capability and uses it automatically:

1. Click "Connect Fastmail" (or "Connect JMAP server")
2. Enter your JMAP session URL (e.g., `https://jmap.fastmail.com/.well-known/jmap`)
3. Authenticate with username + app password

JMAP connections use push notifications instead of IMAP IDLE polling — lower latency, lower battery impact.

---

## 9. Enabling @yourdomain.com Addresses (Stalwart)

By default, UpInbox works as an intelligence layer on top of your existing Gmail/Outlook accounts. If you want to host your own email addresses (e.g., `alice@yourcompany.com`), launch Stalwart:

```bash
docker compose --profile mail up -d stalwart
```

### Initial Stalwart Configuration

On first boot, Stalwart generates a DKIM keypair and creates an admin account:

```bash
# Get the admin password from logs:
docker compose logs stalwart | grep "admin password"

# Access Stalwart admin UI:
http://your-server:8080/admin
```

From the admin UI:
1. Configure your domain (`yourcompany.com`)
2. Copy the DKIM TXT record from Settings → DKIM and add it to your DNS
3. Create initial mailboxes for your users

### Connecting Stalwart to UpInbox

In your `.env`:
```bash
STALWART_JMAP_URL=http://stalwart:8080
STALWART_ADMIN_SECRET=your-stalwart-admin-secret
```

In UpInbox, users can then click "Create @yourcompany.com address" in the connect wizard.

### Stalwart Backup

Stalwart stores blobs in `/opt/stalwart-mail` inside the container, mounted as the `stalwart_data` Docker volume. Back it up the same way as your Postgres volume.

---

## 10. Upgrading

UpInbox follows semantic versioning. Minor releases (1.x) are backward compatible. Major releases include a migration guide.

```bash
# Check current version
docker compose run --rm upinbox node -e "console.log(require('./package.json').version)"

# Pull latest images
git pull origin main
docker compose pull

# Run any new database migrations
npx supabase db push --project-ref YOUR_PROJECT_REF
# Or for local Postgres:
docker compose run --rm upinbox npx supabase db push

# Restart the app
docker compose up -d

# Verify health
curl https://mail.yourcompany.com/api/health
# → { "status": "ok", "version": "1.x.y", "db": "connected" }
```

### Rolling Updates (Zero Downtime)

For zero-downtime upgrades, run two instances behind a load balancer and upgrade one at a time. The app is stateless (all state in Postgres); multiple instances can run against the same database simultaneously.

### Checking Migration Status

```bash
# See which migrations have been applied:
docker compose run --rm upinbox npx supabase migration list
```

---

## 11. Backup Strategy

### What Needs Backing Up

| Data | Where | Criticality |
|---|---|---|
| Postgres database | `postgres_data` Docker volume | Critical |
| `PLATFORM_ENCRYPTION_KEY` | Your `.env` / secret manager | Critical |
| Stalwart blob storage | `stalwart_data` Docker volume | Important (only if using @yourdomain.com) |
| Stalwart DKIM keypair | Inside `stalwart_data` | Important |
| `.env` file | Your server | Important |

**What does NOT need backing up:** Email content from Gmail/Outlook (it's at the provider). UpInbox does not cache email bodies.

### Automated Daily Backup

```bash
#!/bin/bash
# /etc/cron.daily/upinbox-backup

DATE=$(date +%Y-%m-%d)
S3_BUCKET="your-backup-bucket"

# Backup Postgres
docker exec upinbox-postgres-1 pg_dump -U upinbox upinbox \
  | gzip \
  | aws s3 cp - "s3://${S3_BUCKET}/upinbox/postgres-${DATE}.sql.gz"

# Backup Stalwart blobs (if using mail profile)
docker run --rm \
  --volumes-from upinbox-stalwart-1 \
  -v /tmp/stalwart-backup:/backup \
  alpine tar czf /backup/stalwart.tar.gz /opt/stalwart-mail
aws s3 cp "/tmp/stalwart-backup/stalwart.tar.gz" \
  "s3://${S3_BUCKET}/upinbox/stalwart-${DATE}.tar.gz"

echo "Backup complete: ${DATE}"
```

### Restore Testing

Test your restore procedure at least monthly:

```bash
# Restore Postgres to a test environment
aws s3 cp "s3://your-backup-bucket/upinbox/postgres-YYYY-MM-DD.sql.gz" - \
  | gunzip \
  | docker exec -i test-postgres psql -U upinbox upinbox

# Verify restore
docker compose -f docker-compose.test.yml run --rm upinbox \
  node scripts/verify-restore.js
```

### Retention Policy

Recommended: keep 7 daily backups, 4 weekly backups, 12 monthly backups. Total storage for a 10-user instance is typically under 1 GB/month.

---

## 12. Troubleshooting Common Issues

### App Won't Start

```bash
# Check logs
docker compose logs upinbox --tail=50

# Common causes:
# 1. Missing required env var
grep -E "^(PLATFORM_ENCRYPTION_KEY|NEXTAUTH_SECRET|NEXTAUTH_URL)=" .env
# All three must be set and non-empty

# 2. Database unreachable
docker compose run --rm upinbox node -e "
  const { createClient } = require('@supabase/supabase-js');
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  s.from('upinbox_jmap.accounts').select('count').then(console.log).catch(console.error);
"

# 3. Port conflict
lsof -i :3001
```

### Gmail OAuth Connection Fails

Symptoms: redirect loop, "redirect_uri_mismatch" error

```
Solutions:
1. Verify redirect URI in Google Cloud Console matches exactly:
   https://mail.yourcompany.com/api/auth/callback/google
   (no trailing slash, exact protocol)

2. If using the default UpInbox OAuth client (hosted version only):
   Self-hosted deployments must register their own OAuth app.
   See Section 8 → Gmail → OAuth app configuration.

3. Check NEXTAUTH_URL matches your actual domain (not localhost).
```

### Intelligence API Returns 402

```bash
# Check your license status
curl https://mail.yourcompany.com/api/license/status

# Common causes:
# - LICENSE_JWT is expired → renew at upinbox.ai/licenses
# - INSTANCE_DOMAIN doesn't match the domain in the JWT
#   (JWT is bound to the domain you registered with)
# - Community tier (blank LICENSE_JWT) → Intelligence API not available,
#   but heuristic + BYOK still work fine
```

### Email Not Decrypting (USX)

```
Symptoms: 🔒 badge present but content shows "Could not decrypt"

Causes:
1. User changed their UpInbox password without re-wrapping their private key
   Solution: Settings → Security → Re-encrypt keys with current password

2. Private key was generated on a different device or account
   Solution: User must sign in on the device that originally generated the key,
   export it (Settings → Security → Export Key), and import it on the new device

3. Message was encrypted for a different key (sender had wrong public key)
   Solution: Ask sender to resend; verify your public key fingerprint in Settings → Security
```

### Stalwart SMTP Not Accepting Mail

```bash
# Check Stalwart logs
docker compose logs stalwart --tail=50

# Test SMTP connection
telnet your-server.com 25
> EHLO test.com
# Should see 250 responses including STARTTLS

# Common causes:
# 1. Port 25 blocked by cloud provider (common: AWS, GCP, Hetzner block outbound 25)
#    Solution: request unblocking, or use a transactional email relay for outbound
# 2. Missing DNS records (MX, SPF, DKIM) → mail rejected as spam
# 3. DKIM not configured → check Stalwart admin → Settings → DKIM
```

### High Memory Usage

UpInbox in production uses ~200–400 MB RAM for the Next.js server. If usage exceeds 1 GB:

```bash
# Check for stuck background jobs
docker stats upinbox-upinbox-1

# Restart app (zero-downtime if you have multiple replicas)
docker compose restart upinbox

# If using --profile db and Postgres is large, run VACUUM:
docker exec upinbox-postgres-1 psql -U upinbox upinbox -c "VACUUM ANALYZE;"
```

---

## 13. Security Checklist

Run through this list before going production and after any major configuration change.

### Encryption

- [ ] `PLATFORM_ENCRYPTION_KEY` is stored in a secret manager — not hardcoded in `.env` in source control
- [ ] `NEXTAUTH_SECRET` is a random 256-bit value — not a dictionary word or reused secret
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never in a `NEXT_PUBLIC_*` variable, never in browser-loaded JavaScript
- [ ] `PLATFORM_ENCRYPTION_KEY` is backed up in a second secure location

### Network

- [ ] TLS/HTTPS is enabled on all public-facing endpoints (app, Stalwart JMAP, USX endpoint)
- [ ] HTTP is redirected to HTTPS (`301`)
- [ ] HSTS header is set (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- [ ] Stalwart admin UI (port 8080) is NOT publicly accessible — only on internal network or VPN
- [ ] Postgres port (5432) is NOT publicly accessible

### Database

- [ ] RLS (Row Level Security) is enabled on all `upinbox_jmap` schema tables:
  ```sql
  SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'upinbox_jmap'
    AND rowsecurity = false;
  -- Should return 0 rows
  ```
- [ ] Supabase service role key is rotated from the project default
- [ ] Postgres `upinbox` user has minimum necessary permissions (no `SUPERUSER`)

### Rate Limiting

- [ ] Rate limiting is enabled on `/api/upinbox/accounts/test` (prevents IMAP credential stuffing)
- [ ] Rate limiting is enabled on `/api/auth/register` (prevents automated account creation)
- [ ] USX endpoint `/usx/receive` has rate limiting by sender domain

### Licensing and Access

- [ ] License JWT is set if you have more than 10 users (Community tier blocks registration at 11)
- [ ] `INSTANCE_DOMAIN` matches the domain in your License JWT exactly

### Stalwart (if using @yourdomain.com)

- [ ] DKIM is configured and DNS TXT record is live
- [ ] SPF record is published for your sending domain
- [ ] DMARC is published (policy: at least `p=quarantine`)
- [ ] Stalwart admin password is changed from default
- [ ] Stalwart is running the latest version (`docker compose pull stalwart && docker compose up -d stalwart`)

### Operational

- [ ] Automated backups are running and have been tested with a restore dry run
- [ ] Log retention is configured (Docker log rotation: `max-size: "100m", max-file: "5"`)
- [ ] Monitoring / alerting is set up for the `/api/health` endpoint
- [ ] Docker images are pinned to a specific version tag (not `latest`) in production for reproducibility

---

## Getting Help

- **GitHub Issues:** [github.com/UpGPT-ai/upinbox/issues](https://github.com/UpGPT-ai/upinbox/issues)
- **Documentation:** [upinbox.ai/docs](https://upinbox.ai/docs)
- **Community Discord:** [discord.gg/upinbox](https://discord.gg/upinbox)
- **Business/Enterprise support:** [hello@upinbox.ai](mailto:hello@upinbox.ai) — response within 1 business day
- **Security disclosures:** [security@upinbox.ai](mailto:security@upinbox.ai) — 90-day responsible disclosure policy

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Full system architecture
- [ZERO-KNOWLEDGE.md](./ZERO-KNOWLEDGE.md) — How ZK encryption works
- [AI-MODEL-FREEDOM.md](./AI-MODEL-FREEDOM.md) — BYOK and local AI setup
- [USX-PROTOCOL.md](./USX-PROTOCOL.md) — USX encrypted delivery protocol
