# r/selfhosted Reddit Post — UpInbox

---

**Subreddit:** r/selfhosted
**Flair:** Release / Self-Promotion (per sub rules — disclosed below)
**Note for mods:** UpInbox is MIT-licensed. The repo and docker-compose stack contain **no affiliate links, no tracking, no telemetry, no upsell prompts**. There is a separately-sold hosted tier (UpGPT) which I mention only in the "what's not in OSS" section for honesty. Happy to remove that section if it crosses the self-promo line — just say the word.

---

## Title

**UpInbox — MIT-licensed email client with BYOK AI, MCP server, and Docker compose**

---

## Body

Hey r/selfhosted,

I got tired of every "AI email" tool either (a) shipping my inbox to someone else's GPU, (b) locking the useful bits behind a $30/mo SaaS, or (c) being a Chrome extension that breaks every Gmail redesign. So I built **UpInbox** and open-sourced the whole client + sync engine under **MIT**.

This post is a release/feedback ask, not a sales pitch. Repo is the first link below; everything in this post is reproducible from `docker compose up`.

### What it does

- **IMAP/JMAP email client** — connect Gmail, Fastmail, your own Dovecot, Migadu, whatever speaks IMAP. Standard OAuth for Gmail, app passwords for everyone else.
- **Local-first storage** — messages live in your own Postgres (or SQLite for the single-user mode). Full-text search via `pg_trgm`. Nothing leaves the box unless you tell it to.
- **BYOK AI** — drop in your own Anthropic, OpenAI, OpenRouter, or local Ollama endpoint. Triage, summarization, reply drafts, label suggestions. The model you pick is the model that sees your email; we don't proxy.
- **MCP server** — exposes your inbox to any MCP-compatible client (Claude Desktop, Cline, Zed, etc.) as tools: `search_messages`, `get_thread`, `draft_reply`, `apply_label`, `mark_done`. Read-only mode by default; mutations require an explicit env flag.
- **Rules engine** — YAML rules, hot-reloaded. Sieve-style filtering plus optional "ask the LLM" predicates for fuzzy ones ("is this a recruiter cold-pitch?").
- **Zero-knowledge optional** — if you turn on E2E mode, the server stores ciphertext only and the key lives in your client. Means search is client-side and AI runs locally, but it's there if you want it.

### Self-hosting story

```bash
git clone https://github.com/upgpt/upinbox
cd upinbox
cp .env.example .env   # set IMAP creds, AI provider key, JWT secret
docker compose up -d
```

That gives you:

- `upinbox-web` — Next.js client on `:3000`
- `upinbox-sync` — IMAP/JMAP sync worker (idle-push, falls back to 60s poll)
- `upinbox-mcp` — MCP server on `:8765` (stdio or SSE)
- `postgres` — 16-alpine, healthcheck'd
- `caddy` — optional reverse proxy with automatic LE certs

Resource footprint on my N100 mini-PC syncing ~80k messages: 280MB RAM, <2% CPU steady-state. Initial backfill of a 12-year Gmail account took 4h20m and pegged one core during indexing.

Backups are just `pg_dump` plus the attachment volume. No proprietary blob store, no S3 requirement (though it'll use S3-compatible if you want — Minio, R2, Backblaze).

### Architecture

```
   ┌────────────┐    IMAP IDLE / JMAP push
   │  IMAP/JMAP │◄────────────────────────┐
   │  providers │                         │
   └────────────┘                         │
                                  ┌───────┴────────┐
                                  │  sync worker   │  Rust, async
                                  │  (idempotent)  │
                                  └───────┬────────┘
                                          │ writes
                                  ┌───────▼────────┐
   ┌────────────┐  SQL + LISTEN   │   Postgres     │
   │  web app   │◄────────────────┤  + pg_trgm     │
   │  (Next.js) │                 └───────┬────────┘
   └─────┬──────┘                         │
         │                                │ read/write tools
         │ BYOK provider call             │
         ▼                         ┌──────▼──────────┐
   ┌────────────┐                  │   MCP server    │◄──── Claude Desktop,
   │ your LLM   │                  │  (stdio + SSE)  │      Cline, Zed, etc.
   │  endpoint  │                  └─────────────────┘
   └────────────┘
```

- Sync worker is **idempotent on `Message-ID`** so you can crash, restart, switch DBs, and not double-import.
- AI calls are **per-request, never batched server-side** — your provider sees one message at a time so you can audit billing.
- MCP server reads from the same Postgres the web app uses, so anything you can do in the UI you can do from your agent.

### What needs the paid (UpGPT) subscription

Being upfront because mods asked and I respect the sub:

The OSS repo is the **full client, sync, rules, BYOK AI, and MCP server**. That is the product for self-hosters. Forever, MIT.

What is **not** in OSS and lives behind UpGPT:

- **Hosted instance** at upinbox.ai (we run the infra, you don't)
- **Native iOS / Android apps** with push notifications (Apple/Google dev accounts + push infra)
- **Managed sending pool** (warmed SMTP for cold outreach — different product surface)
- **Cross-device sync of E2E keys** via our key-rotation service

If you're self-hosting, you don't need any of those. The web client is a PWA and works fine on mobile, just without native push.

### Why I built this (and what I evaluated first)

I tried to make existing things work for ~3 months before writing a line of code. Honest notes:

- **Mailcow** — excellent full mail stack, but it's a *server* (postfix/dovecot/rspamd). I already have email accounts I like; I needed a *client* with AI hooks. Different layer.
- **Mailu** — same story as Mailcow. Great if you're hosting your own MX, not what I needed.
- **Mimestream** — gorgeous native macOS client, but Gmail-only, closed source, no AI, no MCP, no Linux. Disqualified on three of those.
- **Snappymail / Roundcube** — solid webmail, but the AI/agent story is bolt-on at best, and the UX is from a different era. I use Snappymail on my own domain still.
- **Thunderbird + extensions** — tried the AI extensions. They're either OpenAI-only, send full thread content to a third party, or both. Also extension API churn is brutal.
- **Notmuch + afew + a CLI** — what I actually used for 6 months. Genuinely good. But I wanted my non-technical co-founder to use it too, and "learn mutt" was not going to fly.

So the gap I was solving for: **a real client UX, local-first, with first-class BYOK AI and MCP, that you can `docker compose up` and own forever**. If something already does this, please tell me and I'll go use it instead of maintaining a project.

### Repo

- GitHub: https://github.com/upgpt/upinbox
- Docs: https://github.com/upgpt/upinbox/tree/main/docs
- Docker compose: https://github.com/upgpt/upinbox/blob/main/docker-compose.yml
- MCP server spec: https://github.com/upgpt/upinbox/blob/main/docs/mcp.md
- License: MIT (`LICENSE` in repo root)

### What I'd love feedback on

1. **Sync worker correctness.** It's the part I'm most paranoid about. If you have a weird IMAP server (Courier, Cyrus, old Exchange via IMAP), I want to know what breaks.
2. **The MCP surface.** Are the tool names sensible? What's missing? I deliberately kept it small for v1.
3. **The BYOK abstraction.** Right now it's a simple provider interface. Would you rather see LiteLLM under the hood, or is the thin direct-call layer better?
4. **What I should *not* add.** Scope creep is the killer. Tell me where to stop.

Thanks for reading. Happy to answer anything in comments — I'll be around for the next few hours.

— Greg

---

**Self-promo disclosure (per sub rule 1):** I'm the author. UpInbox is MIT. I also sell a hosted version of it; that is mentioned in one clearly-labeled section above and nowhere else in the post or repo. No affiliate links anywhere in this post or in the repo README.
