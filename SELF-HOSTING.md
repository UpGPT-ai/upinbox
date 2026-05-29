# Self-Hosting UpInbox

UpInbox is free software under the MIT License. You can run your own instance — fully featured, no telemetry to upgpt.ai, your data stays with you.

## The Pricing Model

Everything UpInbox is billed through **UpGPT.ai** — the single platform that manages subscriptions for all UpGPT products (UpInbox, UpLink mobile features, the UpGPT agent platform).

| What | How |
|---|---|
| Self-hosted UpInbox (web + PWA) | **Free forever** — MIT license, run it yourself |
| Hosted UpInbox (mail.upinbox.ai) | Requires UpGPT subscription with email capability |
| UpLink mobile app (download) | **Free** — App Store and Google Play |
| UpLink mobile Inbox tab | Requires UpGPT subscription (paywall in app binary) |

**Why this split?** Web and PWA are zero marginal cost to ship — open them up, let people self-host, drive adoption. Native mobile has real ongoing costs (App Store fees, native dev, OS update churn, APNs/FCM). The native binary is where the paywall lives.

## Self-Hosters Get These Free

- Full UpInbox web application on your domain
- Installable PWA (modern browsers support this on iOS and Android home screens)
- All features: Smart Screener, BYOK AI, MCP server, tracker stripper, snooze, send later, signatures, follow-ups, health score, communication pulse
- Your data stays on your infra. No telemetry to upgpt.ai.

## What Requires UpGPT Subscription

- Hosted email at mail.upinbox.ai
- UpLink mobile Inbox tab (even when pointing at YOUR self-hosted server)

The mobile paywall is cryptographic — UpLink mobile verifies a JWT signed by UpGPT.ai's license server. Self-hosters can run any backend, but the mobile binary checks the UpGPT subscription independently.

## Prerequisites

- Supabase project (free tier works)
- Node.js 20+
- A domain with SSL (Caddy, Nginx, Cloudflare)

## Quick Start

```bash
git clone https://github.com/UpGPT-ai/upinbox
cd upinbox
cp .env.example .env.local
# Fill in Supabase URL, anon key, service role key, encryption key
npm install
npm run build
npx supabase db push
npm start
```

Or use Docker:
```bash
docker compose up -d
```

## Connecting UpLink Mobile to Your Server

1. Open UpLink → Settings → UpInbox Server
2. Choose "Self-hosted"
3. Enter your URL (e.g. https://mail.yourcompany.com)
4. Test connection → Save

Your UpGPT subscription (managed at upgpt.ai) validates the mobile app — the server URL is independent.

## Updates

Watch the repo for releases. Pull, rebuild, restart. Migrations apply automatically.

## Why Not Free Hosted?

We don't want to be Gmail. Free hosted email is a race to the bottom — Google spends $100M+/year on it. Email infrastructure has real ongoing costs, and "free for everyone" means everyone subsidizes nobody. The model is:

- Want it for free? Self-host. Full features, your infra.
- Want convenience? Pay UpGPT.ai for hosted.

This keeps incentives aligned and stops UpInbox from becoming a money pit.

## License

MIT. See LICENSE.

## Support

Self-hosting is community-supported via GitHub Discussions. For paid support, contact upgpt.ai.
