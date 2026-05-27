# Self-Hosting UpInbox

UpInbox is designed to be self-hostable. This guide walks you through a complete
production deployment on any Linux server with Docker.

**Time to deploy:** ~10 minutes for a basic setup.
**What you get:** Full UpInbox client, BYOK AI, USX encryption, MCP server.
**What requires a license:** Intelligence API (95% accuracy classifier), SSO, SCIM, >10 users.

---

## Requirements

- A server with Docker and Docker Compose v2 installed
- A domain name (e.g. `mail.yourcompany.com`)
- A Supabase project (free tier works) — or use the optional local Postgres profile
- 2GB RAM minimum (4GB recommended)
- Ports 3001 (web app) — or 80/443 if behind a reverse proxy

---

## Quick Start (5 commands)

```bash
git clone https://github.com/UpGPT-ai/upinbox.git
cd upinbox
cp env.example .env
# Edit .env — see Environment Variables below
docker compose pull
docker compose up -d
```

Visit `http://your-server:3001` → connect your Gmail or Outlook → done.

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `PLATFORM_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM credential encryption. **This is YOUR key. UpInbox never sees it.** Generate: `openssl rand -hex 32` |
| `NEXTAUTH_SECRET` | Random secret for session tokens. Generate: `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Full URL of your UpInbox instance, e.g. `https://mail.yourcompany.com` |

### Intelligence & Licensing

| Variable | Description | Default |
|----------|-------------|---------|
| `LICENSE_JWT` | Your Business/Enterprise license JWT. Get at [upinbox.ai/licenses](https://upinbox.ai/licenses). Blank = Community tier (free, ≤10 users). | (blank) |
| `INTELLIGENCE_API_URL` | UpInbox intelligence API endpoint. Leave as-is. | `https://api.upinbox.ai/v1/intelligence` |
| `INSTANCE_DOMAIN` | Your instance's domain. Used for USX and license JWT domain binding. | `localhost` |

### Optional — Stalwart (for @yourdomain.com addresses)

| Variable | Description |
|----------|-------------|
| `STALWART_ADMIN_SECRET` | Admin API secret for Stalwart mail server |
| `STALWART_JMAP_URL` | Internal URL of Stalwart JMAP endpoint |

### Optional — Stripe (if you manage your own license billing)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | For self-managed license key generation |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

---

## About PLATFORM_ENCRYPTION_KEY

This key encrypts your users' IMAP credentials (Gmail app passwords, OAuth tokens)
at rest in your database. It is never transmitted to UpInbox's servers.

**Security recommendations:**
- Generate a fresh key: `openssl rand -hex 32`
- Store it in your secret manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Never commit it to git
- Back it up — if lost, users will need to re-authenticate their email accounts

For high-security environments, you can rotate this key using the included rotation script
(see `scripts/rotate-encryption-key.sh`). All existing credential blobs are re-encrypted.

---

## Database Setup

### Option A: Hosted Supabase (Recommended)

1. Create a free project at [supabase.com](https://supabase.com)
2. Run migrations: `npx supabase db push --project-ref YOUR_PROJECT_REF`
3. Set `NEXT_PUBLIC_SUPABASE_URL` and keys from your project settings

### Option B: Self-Hosted Supabase

Follow [Supabase self-hosting docs](https://supabase.com/docs/guides/self-hosting).
Then run: `npx supabase db push`

### Option C: Local Postgres (development only)

```bash
docker compose --profile db up -d postgres
# Update your .env: NEXT_PUBLIC_SUPABASE_URL=http://localhost:5432/upinbox
```

---

## Setting Up Your Domain

### Web App

Put UpInbox behind a reverse proxy (Nginx, Caddy, Traefik):

**Caddy (simplest):**
```
mail.yourcompany.com {
    reverse_proxy localhost:3001
}
```

**Nginx:**
```nginx
server {
    listen 443 ssl;
    server_name mail.yourcompany.com;
    ssl_certificate     /etc/letsencrypt/live/mail.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.yourcompany.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### USX Protocol (Optional)

Add a DNS TXT record to enable encrypted delivery between UpInbox users:

```
_upinbox.yourcompany.com  TXT  "v=USX1; endpoint=https://jmap.yourcompany.com/usx; fp=sha256:CERT_FINGERPRINT"
```

Get your fingerprint: `openssl s_client -connect jmap.yourcompany.com:443 </dev/null 2>/dev/null | openssl x509 -fingerprint -sha256 -noout`

---

## Enabling @yourcompany.com Email (Optional)

By default, UpInbox connects to your existing Gmail/Outlook accounts — no mail server needed.

If you want `@yourcompany.com` addresses hosted on UpInbox:

```bash
docker compose --profile mail up -d stalwart
```

Then configure Stalwart (see `config/stalwart/README.md`) and add DNS records:
- MX: `mail.yourcompany.com` → your server IP
- SPF: `v=spf1 ip4:YOUR_IP -all`
- DKIM: generated by Stalwart on first boot

---

## Connecting Gmail or Outlook

Once the app is running, visit `https://mail.yourcompany.com/connect`:

1. Choose your provider (Gmail, Outlook, or Other IMAP)
2. For Gmail/Outlook: OAuth flow (60 seconds)
3. For generic IMAP: enter your server details (auto-detected for common providers)
4. For `@yourcompany.com` with Stalwart: click "Create @yourcompany.com address"

---

## License Tiers

| Tier | Price | Users | Intelligence API | SSO | SCIM |
|------|-------|-------|-----------------|-----|------|
| Community | Free | ≤10 | ❌ (heuristic + BYOK) | ❌ | ❌ |
| Business | $499/yr | ≤50 | ✅ | ✅ | ❌ |
| Enterprise | $2,999/yr | Unlimited | ✅ | ✅ | ✅ |

Buy a license at [upinbox.ai/licenses](https://upinbox.ai/licenses). You'll receive a `LICENSE_JWT`
tied to your `INSTANCE_DOMAIN`. Set it in your `.env` and restart:

```bash
docker compose restart upinbox
```

---

## Upgrading

```bash
git pull origin main
docker compose pull
docker compose up -d
npx supabase db push  # if there are new migrations
```

We follow semver. Breaking changes (rare) are documented in [CHANGELOG.md](../CHANGELOG.md).

---

## Backup

### What to back up

1. **Postgres database** — all user data, account connections, triage results
2. **Stalwart blob storage** — email content (only if using @yourcompany.com addresses)
3. **Your `.env` file** — especially `PLATFORM_ENCRYPTION_KEY`

### Automated backup example

```bash
# Daily Postgres backup to S3
0 2 * * * docker exec upinbox-postgres pg_dump -U upinbox upinbox | \
  gzip | aws s3 cp - s3://your-backup-bucket/upinbox/$(date +%Y-%m-%d).sql.gz
```

---

## Security Checklist

Before going production:

- [ ] `PLATFORM_ENCRYPTION_KEY` is in a secret manager, not in the `.env` file in the repo
- [ ] TLS/HTTPS enabled on all public endpoints
- [ ] Supabase RLS is enabled (verify: `SELECT count(*) FROM pg_tables WHERE rowsecurity=false AND schemaname='upinbox_jmap'` should return 0)
- [ ] Stalwart admin API is not exposed to the public internet (use internal Docker network only)
- [ ] Rate limiting on `/api/upinbox/accounts/test` (prevents credential stuffing via IMAP test endpoint)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never in `NEXT_PUBLIC_*` vars
- [ ] License JWT is set if you have >10 users (user creation will block at 10 otherwise)
- [ ] Backups are tested (restore dry run at least once)

---

## Troubleshooting

**App won't start:**
```bash
docker compose logs upinbox
# Common: missing required env vars — check that PLATFORM_ENCRYPTION_KEY is set
```

**Can't connect Gmail:**
- Gmail requires an App Password if using password auth (OAuth recommended)
- Check: Settings → Google Account → Security → App Passwords
- Or use the OAuth flow in the connect wizard (preferred)

**Intelligence API returns 402:**
- Your `LICENSE_JWT` is expired or invalid, or `INSTANCE_DOMAIN` doesn't match the JWT
- Buy/renew at [upinbox.ai/licenses](https://upinbox.ai/licenses)
- Community tier still gets heuristic + BYOK — only Intelligence API is blocked

**Email not decrypting:**
- The user's private key was encrypted with their password
- If the password was changed without re-encrypting the key, decryption fails
- Solution: user must re-enter their original password in Settings → Security → Re-encrypt keys

---

## Getting Help

- GitHub Issues: [github.com/UpGPT-ai/upinbox/issues](https://github.com/UpGPT-ai/upinbox/issues)
- Docs: [upinbox.ai/docs](https://upinbox.ai/docs)
- Business/Enterprise support: [hello@upinbox.ai](mailto:hello@upinbox.ai)
