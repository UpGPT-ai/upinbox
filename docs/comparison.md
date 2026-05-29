# UpInbox vs Other Email Clients

Honest comparison. We've evaluated all of these. Updated 2026-05-29.

## TL;DR

| | UpInbox | Gmail | Hey | Mimestream | Superhuman | Spark |
|---|---|---|---|---|---|---|
| Price | $X/mo via UpGPT | Free with ads | $99/yr | $5/mo | $30/mo | Free / $7.99 |
| BYOK AI | Yes | No | No | No | No (uses theirs) | No |
| MCP Server | Yes | No | No | No | No | No |
| Tracker stripping | Yes | Limited | Yes | No | No | No |
| Self-hostable | Yes (MIT) | No | No | No | No | No |
| Native macOS | No (PWA) | No (web) | Yes | Yes | Yes | Yes |
| Native iOS / Android | Yes via UpLink | Yes | Yes | No | Yes | Yes |
| Source available | Yes | No | No | No | No | No |
| Privacy-first | Yes | No | Yes | Partial | No | Mixed |
| Works with Gmail | Yes (IMAP) | N/A | No (separate) | Yes (Gmail only) | Yes | Yes |

## Detailed Comparison

### vs Gmail
Gmail is free and ubiquitous but it's an ad-supported, data-mined service. Google scans your email content to train models and serve ads (despite some marketing claims). UpInbox connects to Gmail via IMAP — you keep using Gmail as your provider, UpInbox is just a better client.

**Choose UpInbox if:** You want a better client without leaving Gmail. Privacy matters. You want AI features that don't share your email with a third party.
**Choose Gmail if:** You don't care about privacy and want zero setup.

### vs Hey ($99/year)
Hey was the wake-up call for email design. They have a strong privacy posture, beautiful UI, and innovative features (Screener for first contact, Imbox vs Feed vs Paper Trail). But Hey makes you change email addresses (they want to own your inbox), has no native AI, and isn't open source.

**Choose UpInbox if:** You want to keep your email addresses, want BYOK AI, value open source.
**Choose Hey if:** You want a polished managed inbox and don't mind the email address change.

### vs Mimestream ($5/mo)
Mimestream is the best native macOS Gmail client. It's polished, fast, and beautifully designed. But it's Gmail-only, native-only (no web/mobile), no AI, no MCP.

**Choose UpInbox if:** You want AI/MCP, want web access, want mobile (PWA or UpLink), want non-Gmail providers.
**Choose Mimestream if:** You're a Gmail-only, macOS-only, native-app person who prioritizes UI polish over features.

### vs Superhuman ($30/mo)
Superhuman is the speed-and-keyboard-shortcut champion. Their Split Inbox and AI summary features are genuinely useful. But $30/mo is steep, they use their own AI (your email goes through their servers), and there's no self-host or source available.

**Choose UpInbox if:** You want BYOK AI (your keys, your inference), want MCP integration, value open source, want lower cost.
**Choose Superhuman if:** You want the most polished mobile experience and $30/mo is reasonable for you.

### vs Spark (Free / $7.99 Pro)
Spark has many features and is genuinely cross-platform. Recently added AI but it's not BYOK. Acquired by Readdle which has had some user trust concerns over the years.

**Choose UpInbox if:** You want BYOK AI, self-hostable, MCP integration.
**Choose Spark if:** You want a polished freemium experience and trust Readdle's data handling.

### vs Self-Hosted (Mailcow + Snappymail / Roundcube)
The self-hosted email stack is solid but lacks modern AI features. Mailcow runs your SMTP/IMAP, Snappymail or Roundcube provides webmail. Neither has BYOK AI integration or MCP server.

**Use UpInbox WITH self-hosted email:** UpInbox is an IMAP CLIENT. Run Mailcow for your SMTP/IMAP, point UpInbox at it. Best of both worlds.

### vs Stalwart Mail Server
Stalwart is a modern self-hosted mail server with built-in webmail. UpInbox doesn't replace the mail server — it replaces the client. You could run Stalwart for SMTP/IMAP/JMAP and UpInbox as the client.

## Feature Comparison Detail

### AI

**Gmail** — Google Workspace adds Gemini features. Your email content is processed by Google.
**Hey** — No AI features.
**Superhuman** — Has Auto Summarize, Instant Reply. Uses their own AI. Your email goes through their servers.
**Mimestream** — No AI.
**Spark** — Has Smart 1, Smart 2 features. Uses Spark's AI. Limited BYOK.
**UpInbox** — BYOK only. Your API key lives in your browser sessionStorage. Server never sees the key. We don't run an AI service.

### Inbox Triage

**Gmail** — Tabs (Primary, Social, Promotions, Updates, Forums). Heuristic, not learning.
**Hey** — Screener for first contact (manual approval per sender). The Feed for newsletters. Paper Trail for receipts.
**Superhuman** — Split Inbox by category.
**UpInbox** — AI Screener with confidence scoring (Action Needed / Focus / Newsletter / etc.). Click any badge to correct routing. Learns from your corrections via heuristic_overrides table.

### Privacy

**Gmail** — Email content used to train models, target ads.
**Hey** — Strong privacy posture. Content not used for training.
**Superhuman** — Email goes through their servers for AI features.
**UpInbox** — Email lives in your underlying IMAP server (which you control). Our database stores connection metadata + UI state. AI uses YOUR API key directly to YOUR chosen provider — we don't proxy AI requests.

### Pricing

**Gmail** — Free with ads, Workspace from $6/user/mo
**Hey** — $99/yr
**Mimestream** — $5/mo
**Superhuman** — $30/mo
**Spark** — Free or $7.99/mo Pro
**UpInbox** — Part of UpGPT subscription. Self-host free.

## When NOT to Use UpInbox

- You want a fully managed mail provider (use Hey, Fastmail, or Gmail)
- You only use macOS Gmail and want maximum native polish (use Mimestream)
- You value brand prestige in inbox shortcuts (use Superhuman)
- You hate the idea of self-hosting and don't want to pay for AI (use Gmail)

## When TO Use UpInbox

- You want AI features with your own API keys
- You want Claude or other AI assistants to manage your inbox via MCP
- You want a privacy-first email client without giving up Gmail
- You self-host and want a modern web/mobile client
- You evaluate software based on whether it's open source

We don't claim to be the best email client for everyone. We're the best for privacy-and-AI-conscious power users who can self-host or pay for a fair-priced hosted service.
