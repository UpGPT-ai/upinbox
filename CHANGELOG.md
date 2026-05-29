# Changelog

All notable changes to UpInbox. This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- UpGPT.ai capability-based billing model (email, mcp, byok, native_mobile capabilities)
- UpLink mobile Inbox tab with paywall via UpGPT JWT
- Configurable server URL — self-hosters can connect UpLink mobile to their own server
- Self-hosting documentation (SELF-HOSTING.md, docker-compose, Dockerfile, MIT LICENSE)
- Cron tick endpoint dispatches snooze/send-later/follow-up reminders
- Web Push API + service worker registration
- Deep Clean wizard with 4-step bulk inbox cleanup
- Auto-archive rules engine
- /inbox/mcp setup guide page (Claude Desktop, Claude.ai, curl tabs)
- Inbox Health Score with shareable card
- Communication Pulse per-contact analytics
- Follow-up reminders with cancellation
- Calendar date extraction from email body
- Nested labels tree (Clients/Acme/Active style)
- Smart email bundling
- Confidence Inspector for screener corrections
- Masked email aliases
- Vitest test coverage for billing, threading, search, calendar
- GitHub Actions CI workflow
- Rate limiting on AI endpoints

### Changed
- Removed free hosted email tier (intentional — sustainable model)
- Billing portal moved to upgpt.ai (single subscription authority)
- All entitlement gates now check capabilities, not tiers

### Security
- ES256 JWT verification for UpGPT licenses
- Cron endpoint gated by Bearer CRON_SECRET
- CORS middleware for self-hosted server access
- AES-256-GCM credential encryption (unchanged from prior versions)

## Earlier Versions

Pre-release iteration. See git history for detailed changes.

---

For migration notes between versions, see [docs/migration-guide.md](./docs/migration-guide.md).
