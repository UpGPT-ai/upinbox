# UpInbox Roadmap

Public roadmap. Subject to change. Last updated 2026-05-29.

## Now (Shipped)

✅ Smart Screener with AI confidence scoring
✅ BYOK AI configuration (Anthropic, OpenAI, Google, Ollama)
✅ MCP server (8 tools, Claude Desktop ready)
✅ Tracker stripper + image proxy
✅ Snooze, Send Later, Follow-ups
✅ Per-account signatures
✅ Inbox Health Score + Communication Pulse
✅ Auto-archive rules
✅ Deep Clean wizard with undo vault
✅ Conversation threading
✅ Saved searches
✅ Smart reply chips
✅ Subscriptions manager
✅ Web Push notifications + Service Worker
✅ Capability-based billing via UpGPT.ai
✅ MIT-licensed self-hosting
✅ Docker compose deployment

## Next 30 Days

🔜 Native UpLink mobile build + App Store / Play Store submission
🔜 Calendar pane: parse dates from email → propose meeting → Google Calendar OAuth
🔜 Real read-receipt tracking (currently placeholders)
🔜 Email_classifications table for screener persistence across sessions
🔜 Drag-and-drop nested label nesting UI
🔜 Hosted UpInbox waitlist → opening for UpGPT subscribers
🔜 Masked email aliases (catch-all integration)

## Next 90 Days

🔮 iOS share extension for "Save to UpInbox"
🔮 Android share intent
🔮 Webhooks (incoming email → user-defined URL)
🔮 OAuth provider integrations (Gmail OAuth replacing IMAP for new accounts)
🔮 Encrypted at rest local cache for offline reading
🔮 Real-time collaborative inbox views (team plan)
🔮 Inbox Wrapped shareable yearly summary
🔮 ChatGPT plugin equivalent (OpenAI Custom GPT integration)

## Backlog (Wanted, No Date)

- Hardware key support for compose (Yubikey signing)
- PGP encryption send/receive
- Notion / Linear / Slack integrations  
- Quick-add to-do from email
- Reply scheduling based on response patterns
- AI-suggested filters
- Inbox analytics export (CSV)
- Stripe webhook → auto-archive receipts
- Plain text mode toggle
- Per-thread mute
- Bulk reply to N selected emails

## Won't Build

- Built-in calendar (use Google Calendar / Apple Calendar / Cal.com)
- Built-in tasks / kanban (use Linear / Notion)
- Built-in chat (use Slack)
- Free hosted email accounts (sustainability)
- Email marketing send (we're an inbox, not Mailchimp)

## How to Influence the Roadmap

- Vote on GitHub issues
- Open feature requests with use case clearly stated
- Sponsor a feature: contact us
- PRs accepted! See CONTRIBUTING.md

## Versioning

- Major bumps signal breaking changes (rare)
- Minor bumps add features (every 1-2 weeks during active development)
- Patch bumps fix bugs (as needed)

## Stability Guarantees

- API: stable, breaking changes announced 30 days in advance
- MCP tool signatures: stable within major version
- Database schema: append-only migrations, no destructive changes
- Self-hosting upgrade path: maintained between minor versions, scripts in scripts/upgrade.sh
