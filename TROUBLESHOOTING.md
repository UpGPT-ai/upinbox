# Troubleshooting UpInbox

Common issues and fixes. If yours isn't here, open a GitHub Discussion.

## Setup Issues

### "Cannot connect to Supabase"
- Verify NEXT_PUBLIC_SUPABASE_URL is your project URL (not localhost)
- Verify SUPABASE_SERVICE_ROLE_KEY is the service_role key (not anon)
- Check Supabase project is not paused (free tier auto-pauses after 7 days of inactivity)

### "Migration failed: relation already exists"
The migration ran partially. Apply just the missing parts:
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='upinbox' AND table_name='your_table') THEN
    CREATE TABLE upinbox.your_table (...);
  END IF;
END $$;
```
Or use the safer schema.sql in supabase/migrations/.

### "npm run build fails with TS errors"
- Run `npx tsc --noEmit` to see all errors
- Verify Node 20+: `node --version`
- Clear .next: `rm -rf .next && npm run build`

## Auth Issues

### "Stuck on login screen"
- Check browser cookies for upinbox-sprint1 domain
- Verify your Supabase project has Email + Password enabled
- Check NEXT_PUBLIC_SUPABASE_URL matches the URL where Supabase is hosting auth

### "Account connection wizard shows 'UpInbox requires UpLink Pro'"
You don't have the 'email' capability in your UpGPT subscription. Either:
1. Subscribe at upgpt.ai/account/subscribe?product=upinbox
2. Self-host UpInbox locally (PWA works for free)
3. Set UPGPT_LICENSE_DEV_MODE=true in .env.local for local dev (DO NOT do this in production)

## Email Provider Issues

### "Gmail OAuth keeps failing"
- Enable IMAP in Gmail Settings → Forwarding and POP/IMAP
- For Google Workspace: admin must enable IMAP for the org
- App password may be required for accounts with 2FA but no OAuth

### "Outlook IMAP connection refused"
- Microsoft requires OAuth for personal accounts. App passwords no longer work for Microsoft 365.
- Generate an app password at account.microsoft.com → Security → App passwords

### "Fastmail / Migadu / mailbox.org connection drops"
- IMAP IDLE may not be supported. Set polling fallback in account config.
- Verify port 993 + TLS, not port 143

## AI Issues

### "AI draft button shows 'Configure AI in Settings'"
You have not set up BYOK. Go to Settings → AI & Draft, choose provider, paste key.

### "AI test connection fails"
- Verify the key works in the provider's official console
- Check the model name matches exactly (e.g. `claude-sonnet-4-6` not `claude-3.5-sonnet`)
- For Ollama: verify the local server is running at the configured endpoint

### "Rate limit exceeded"
30 AI draft requests per hour, 10 test calls per hour. Wait 1 hour or upgrade if heavy use.

## Performance Issues

### "Inbox feels slow"
- Health endpoint shows DB latency over 5s? Tune Supabase connection pooling.
- Check browser DevTools network tab — are emails loading slowly because of HTML rendering?
- Tracker stripper proxies images; large emails with many images take longer to render

### "Cron not firing snoozes / send-later"
- Verify cron is registered: `crontab -l | grep upinbox`
- Check logs: `tail -f /var/log/upinbox-cron.log`
- Verify CRON_SECRET matches what the cron script uses
- Hit endpoint manually: `curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" http://[::1]:3011/api/upinbox/cron/tick`

## Self-Hosting Issues

### "Docker container exits immediately"
- Check logs: `docker compose logs upinbox`
- Verify all env vars set: `./scripts/check-deploy.sh`
- Common: missing ENCRYPTION_KEY (generate with `openssl rand -hex 32`)

### "PWA won't install on iOS"
- iOS only allows PWA install from Safari (not other browsers)
- HTTPS required (not http)
- Verify /manifest.json returns 200 and has icons

### "Service worker not registering"
- Check browser console for SW errors
- Verify /sw.js returns 200 with content-type text/javascript
- Hard reload (Cmd+Shift+R) to bypass cached SW

## Mobile (UpLink) Issues

### "Inbox tab shows paywall but I have UpGPT subscription"
- Force-refresh subscription in UpLink Settings
- Verify UPGPT_PUBLIC_KEY in your self-hosted .env.local matches what UpGPT issued
- Check JWT expiration — sign out and back in to refresh

### "Cannot connect to self-hosted server"
- Verify server URL starts with https:// (http will fail)
- Check CORS — UpInbox middleware.ts adds CORS for /api/upinbox/* paths
- Test from a desktop browser first: `curl YOUR_SERVER/api/upinbox/health`

## Getting More Help

- GitHub Discussions: github.com/UpGPT-ai/upinbox/discussions
- For paid users: support@upgpt.ai
- Status page: status.upgpt.ai (if you operate UpGPT services)

Include verbose logs when reporting issues. `DEBUG=* npm run dev` enables full debug output.
