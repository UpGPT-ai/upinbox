# UpInbox Architecture

> **Version:** 1.0 — May 2026
> **License:** MIT (client, adapters, USX, encryption layer) | UAL-1.0 (`@upgpt/email-classifier`)

This document describes the full system architecture of UpInbox: how mail flows in, how intelligence is applied, how encryption works, and how the self-hosted and SaaS deployment models differ.

---

## Table of Contents

1. [High-Level System Diagram](#1-high-level-system-diagram)
2. [Mail Provider Abstraction](#2-mail-provider-abstraction)
3. [Intelligence Routing Stack](#3-intelligence-routing-stack)
4. [Zero-Knowledge Encryption Layer](#4-zero-knowledge-encryption-layer)
5. [USX Protocol](#5-usx-protocol)
6. [MCP Server](#6-mcp-server)
7. [Database Schema Overview](#7-database-schema-overview)
8. [Deployment Models](#8-deployment-models)
9. [IP Protection Model](#9-ip-protection-model)

---

## 1. High-Level System Diagram

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  MAIL PROVIDERS                                                              ║
║                                                                              ║
║   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ ║
║   │   Gmail     │  │   Outlook    │  │   Fastmail   │  │  Any IMAP/JMAP  │ ║
║   │  OAuth 2.0  │  │  OAuth 2.0   │  │     JMAP     │  │   (Stalwart,    │ ║
║   │  IMAP/REST  │  │  Graph API   │  │   RFC 8620   │  │  ProtonBridge,  │ ║
║   └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  │  Dovecot, …)   │ ║
║          │                │                  │           └────────┬────────┘ ║
╚══════════╪════════════════╪══════════════════╪════════════════════╪══════════╝
           │                │                  │                    │
           └────────────────┴──────────────────┴────────────────────┘
                                         │
                            ┌────────────▼────────────┐
                            │   MailProvider Interface  │
                            │  (src/lib/mail/provider)  │
                            │                           │
                            │  .listThreads()           │
                            │  .getThread()             │
                            │  .sendMessage()           │
                            │  .archiveThread()         │
                            │  .labelThread()           │
                            │  .searchMessages()        │
                            └────────────┬──────────────┘
                                         │
           ┌─────────────────────────────┼──────────────────────────┐
           │                             │                          │
           ▼                             ▼                          ▼
┌──────────────────┐        ┌────────────────────┐      ┌──────────────────────┐
│  JMAP Adapter    │        │   IMAP Adapter     │      │  USX Relay Adapter   │
│  (Stalwart /     │        │  (Gmail, Outlook,  │      │  (USX → SMTP bridge  │
│   Fastmail)      │        │   generic IMAP)    │      │   for legacy clients)│
│                  │        │                    │      └──────────────────────┘
│  RFC 8620        │        │  node-imap +       │
│  native push     │        │  IDLE long-poll    │
└──────────────────┘        └────────────────────┘
                                         │
                            ┌────────────▼────────────┐
                            │     App Layer (Next.js)   │
                            │                           │
                            │  ┌───────────────────┐   │
                            │  │  Smart Feed        │   │
                            │  │  (classified view) │   │
                            │  └───────────────────┘   │
                            │  ┌───────────────────┐   │
                            │  │  Thread View       │   │
                            │  │  (encrypted aware) │   │
                            │  └───────────────────┘   │
                            │  ┌───────────────────┐   │
                            │  │  Compose Window    │   │
                            │  │  (ZK encrypt path) │   │
                            │  └───────────────────┘   │
                            └────────────┬──────────────┘
                                         │
                   ┌─────────────────────┼──────────────────────┐
                   │                     │                      │
                   ▼                     ▼                      ▼
         ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │  Intelligence   │  │   ZK Encryption   │  │   MCP Server     │
         │  Routing Stack  │  │   Layer           │  │   (20+ tools)    │
         │  (4 paths)      │  │   (OpenPGP.js)    │  │                  │
         └─────────────────┘  └──────────────────┘  └──────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
   ┌────────────┐   ┌───────────────────────────────────────────────────┐
   │ PostgreSQL │   │  External Intelligence (user-controlled)           │
   │ (upinbox   │   │                                                   │
   │  schema)   │   │  • api.anthropic.com  (BYOK Claude)               │
   └────────────┘   │  • api.openai.com     (BYOK GPT)                  │
                    │  • generativelanguage.googleapis.com (BYOK Gemini) │
                    │  • localhost:11435    (UpLink → Ollama, offline)   │
                    │  • api.upinbox.ai    (Intelligence API, Biz/Ent)  │
                    └───────────────────────────────────────────────────┘
```

---

## 2. Mail Provider Abstraction

All mail sources implement the `MailProvider` interface. This means UpInbox never talks to Gmail directly in business logic — it always talks to the abstraction.

### Interface (TypeScript)

```typescript
// src/lib/mail/provider/types.ts

export interface MailProvider {
  // Thread operations
  listThreads(options: ListThreadsOptions): Promise<Thread[]>;
  getThread(threadId: string): Promise<Thread>;
  searchMessages(query: string): Promise<Thread[]>;

  // Message operations
  sendMessage(draft: OutboundMessage): Promise<SentMessage>;
  replyToThread(threadId: string, draft: OutboundMessage): Promise<SentMessage>;
  createDraft(draft: OutboundMessage): Promise<Draft>;

  // Folder / label operations
  archiveThread(threadId: string): Promise<void>;
  labelThread(threadId: string, labels: string[]): Promise<void>;
  moveToFolder(threadId: string, folderId: string): Promise<void>;

  // Real-time
  subscribe(callback: (event: MailEvent) => void): Unsubscribe;
}
```

### Provider Implementations

| Provider | Protocol | Auth | Notes |
|---|---|---|---|
| `GmailProvider` | IMAP + Gmail REST | OAuth 2.0 | Uses `gmail.modify` scope |
| `OutlookProvider` | Graph API | OAuth 2.0 | Microsoft identity platform |
| `JmapProvider` | JMAP (RFC 8620) | Bearer | Stalwart, Fastmail, Cyrus |
| `ImapProvider` | IMAP4rev1 | Password / OAUTH2 | Generic fallback |
| `UsxRelayProvider` | USX over SMTP | Bearer | Relay for legacy clients |

### JMAP vs IMAP: Why Both

**JMAP** (RFC 8620) is the modern replacement for IMAP. UpInbox uses JMAP natively when the server supports it (Stalwart, Fastmail). Benefits:
- Push notifications instead of polling (lower battery, lower latency)
- Atomic multi-operation transactions
- First-class blob handling (attachments)
- JSON-native (no IMAP string-parsing complexity)

**IMAP** is kept for Gmail and Outlook, which either don't expose JMAP or require it through third-party bridges. The IMAP adapter uses `node-imap` with IDLE command for pseudo-push.

---

## 3. Intelligence Routing Stack

Every incoming message is scored by one of four intelligence paths. The router (`src/lib/intelligence/router.ts`) selects the path based on user configuration and license tier.

```
Incoming message
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  Intelligence Router                                         │
│                                                             │
│  1. BYOK AI configured?          ──YES──► Path B (BYOK)    │
│     (user has API key in session)                           │
│                                                             │
│  2. UpLink Desktop running?      ──YES──► Path C (Local)   │
│     (localhost:11435 responds)                              │
│                                                             │
│  3. License JWT valid for API?   ──YES──► Path D (API)     │
│     (Business or Enterprise tier)                           │
│                                                             │
│  4. Fallback                          ──► Path A (Heuristic)│
└─────────────────────────────────────────────────────────────┘
```

### Path A — Heuristic (`@upgpt/email-classifier`)

- **Package:** `@upgpt/email-classifier` (npm, UAL-1.0, ships in Docker)
- **Accuracy:** ~70% (rule-based + n-gram features, no model weights)
- **Latency:** <5ms (synchronous, in-process)
- **Privacy:** 100% — runs inside your Docker container, zero network calls
- **Available:** Community tier and above

```typescript
import { classify } from '@upgpt/email-classifier';
const label = classify({ subject, snippet, senderDomain, headers });
// Returns: 'newsletter' | 'transactional' | 'personal' | 'work' | 'spam' | 'unknown'
```

### Path B — BYOK AI (Browser-Direct)

- **Providers:** Claude (Anthropic), GPT-4o (OpenAI), Gemini 1.5 Pro (Google)
- **Accuracy:** ~95% (LLM reasoning over full email content)
- **Call path:** `User Browser → Provider API` — UpInbox servers are NOT in this path
- **API key storage:** Session only (sessionStorage in browser, cleared on close). Never sent to our servers.
- **Available:** All tiers (user pays their own provider bill)

```
Browser                     Provider API
  │                               │
  │── POST /v1/messages ─────────►│  (Claude API, direct)
  │◄─ classification result ──────│
  │
  │  (UpInbox server never sees this traffic)
```

### Path C — UpLink Local AI (100% Offline)

- **Runtime:** UpLink Desktop daemon → Ollama (any model)
- **Endpoint:** `localhost:11435` (UpLink exposes this port when running)
- **Accuracy:** Model-dependent; Llama 3.1 8B ≈ 88%, Mistral 7B ≈ 85%
- **Privacy:** Absolute — no network calls, model runs on your hardware
- **Available:** All tiers, requires UpLink Desktop installed

```
Browser extension (UpInbox)
  │
  │── fetch('http://localhost:11435/api/classify')
  │
UpLink Desktop daemon
  │
  │── Ollama API (local model)
  │
  └── result returned to browser
```

### Path D — Intelligence API (`api.upinbox.ai`)

- **Accuracy:** ~95% (same model as BYOK, but hosted)
- **What is sent:** Metadata features only — subject tokens, sender domain reputation score, header fingerprint, content-length bucket. **Email content is never sent.**
- **Auth:** License JWT (issued at upinbox.ai/licenses)
- **Available:** Business tier (≤50 users) and Enterprise (unlimited)
- **Latency:** ~80ms p50 from EU/US regions

The Intelligence API receives a feature vector, not email content:

```json
{
  "features": {
    "subject_tokens": ["invoice", "attached", "payment"],
    "sender_domain_reputation": 0.82,
    "has_unsubscribe_header": false,
    "thread_depth": 1,
    "content_length_bucket": "medium",
    "attachment_count": 1
  }
}
```

---

## 4. Zero-Knowledge Encryption Layer

Full details in [ZERO-KNOWLEDGE.md](./ZERO-KNOWLEDGE.md). Summary:

- **Keypair:** Ed25519, generated in browser via `openpgp.js`
- **Private key wrapping:** `Argon2id(password, salt)` → AES-256-GCM wrapping key → encrypted private key blob
- **Server stores:** Encrypted blob only. Never the raw private key, never the password.
- **Content encryption:** AES-256-GCM, key exchange via Ed25519 ECDH
- **For non-PGP recipients:** Time-limited password link (PBKDF2 + AES-256-GCM)

---

## 5. USX Protocol

Full details in [USX-PROTOCOL.md](./USX-PROTOCOL.md). Summary:

- DNS-based discovery: `_upinbox.example.com TXT "v=USX1; endpoint=...; fp=sha256:..."`
- End-to-end encrypted delivery between UpInbox users
- 🔒 trust indicator in UI when both parties have USX records
- Falls back to standard SMTP for non-USX recipients

---

## 6. MCP Server

UpInbox ships an MCP (Model Context Protocol) server that exposes your inbox to any MCP-compatible AI assistant (Claude Desktop, UpLink, Cursor, etc.).

### Endpoint

```
http://localhost:3001/api/mcp   (self-hosted)
https://api.upinbox.ai/mcp     (SaaS, Business/Enterprise)
```

### Auth

Bearer token generated in Settings → Developer → MCP Token. Tokens are scoped:

| Scope | Grants |
|---|---|
| `read` | List threads, get messages, search |
| `write` | Send messages, archive, label, move |
| `ai` | Trigger intelligence classification, generate drafts |

### Available Tools (20+)

**Read scope:**
- `list_threads` — list inbox/folder threads with pagination
- `get_thread` — full thread with all messages
- `search_messages` — full-text + header search
- `get_contacts` — address book lookup
- `list_folders` — folder/label tree
- `get_account_info` — connected account metadata

**Write scope:**
- `send_message` — compose and send
- `reply_to_thread` — reply inline
- `archive_thread` — archive
- `label_thread` — apply/remove labels
- `move_to_folder` — move thread
- `create_draft` — save draft
- `delete_draft` — discard draft
- `mark_read` / `mark_unread`
- `snooze_thread` — snooze until datetime
- `block_sender` — add to blocklist

**AI scope:**
- `classify_thread` — run intelligence routing on a thread
- `generate_draft` — AI-assisted draft (uses user's configured intelligence path)
- `summarize_thread` — thread summary
- `extract_action_items` — pull tasks from thread
- `compose_reply` — suggest reply

### MCP Config Example (Claude Desktop)

```json
{
  "mcpServers": {
    "upinbox": {
      "command": "npx",
      "args": ["-y", "@upgpt/upinbox-mcp"],
      "env": {
        "UPINBOX_URL": "http://localhost:3001",
        "UPINBOX_MCP_TOKEN": "your-mcp-token-here"
      }
    }
  }
}
```

---

## 7. Database Schema Overview

UpInbox uses PostgreSQL with the `upinbox_jmap` schema. All tables use row-level security (RLS) enforced via `auth_user_id = auth.uid()`.

### Core Tables

```sql
-- Connected email accounts
CREATE TABLE upinbox_jmap.accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  provider_type     TEXT NOT NULL CHECK (provider_type IN ('gmail','outlook','jmap','imap')),
  email_address     TEXT NOT NULL,
  display_name      TEXT,

  -- Encrypted credential blob (AES-256-GCM, PLATFORM_ENCRYPTION_KEY)
  -- Contains: OAuth tokens or IMAP password, refresh token, scopes
  credentials_enc   BYTEA NOT NULL,
  credentials_iv    BYTEA NOT NULL,  -- 12-byte GCM nonce

  -- JMAP-specific
  jmap_session_url  TEXT,
  jmap_account_id   TEXT,

  -- Status
  sync_state        TEXT DEFAULT 'idle',   -- idle | syncing | error
  last_synced_at    TIMESTAMPTZ,
  error_message     TEXT,

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- User encryption keypairs (ZK layer)
CREATE TABLE upinbox_jmap.user_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  public_key_armored TEXT NOT NULL,         -- Ed25519 public key (OpenPGP armored)
  private_key_enc   BYTEA NOT NULL,         -- Argon2id(password) → AES-256-GCM encrypted private key
  private_key_salt  BYTEA NOT NULL,         -- 32-byte Argon2id salt
  private_key_iv    BYTEA NOT NULL,         -- 12-byte GCM nonce
  fingerprint       TEXT NOT NULL,          -- 40-char hex fingerprint
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Cached thread metadata (not content — content stays at provider)
CREATE TABLE upinbox_jmap.threads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES upinbox_jmap.accounts(id),
  provider_thread_id TEXT NOT NULL,
  subject_enc       BYTEA,                  -- NULL if not USX-encrypted
  subject_iv        BYTEA,
  subject_plain     TEXT,                   -- NULL if USX-encrypted
  snippet           TEXT,
  from_address      TEXT NOT NULL,
  has_unread        BOOLEAN DEFAULT false,
  message_count     INTEGER DEFAULT 1,
  labels            TEXT[],
  intelligence_label TEXT,                  -- classifier output
  intelligence_path  TEXT,                  -- 'heuristic'|'byok'|'local'|'api'
  intelligence_score NUMERIC(4,3),
  is_usx            BOOLEAN DEFAULT false,
  last_message_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- MCP API tokens
CREATE TABLE upinbox_jmap.mcp_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  token_hash        TEXT NOT NULL UNIQUE,   -- SHA-256 of raw token
  scopes            TEXT[] NOT NULL,        -- ['read','write','ai']
  name              TEXT,                   -- user-assigned label
  last_used_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,            -- NULL = no expiry
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- USX endpoint registry (public, no RLS restriction on SELECT)
CREATE TABLE upinbox_jmap.usx_registry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain            TEXT NOT NULL UNIQUE,
  endpoint_url      TEXT NOT NULL,
  cert_fingerprint  TEXT NOT NULL,          -- sha256:HEXHEX
  public_key_armored TEXT NOT NULL,
  verified_at       TIMESTAMPTZ,
  last_seen_at      TIMESTAMPTZ
);
```

### RLS Policy Pattern

```sql
-- All tables: users see only their own rows
ALTER TABLE upinbox_jmap.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_owner" ON upinbox_jmap.accounts
  FOR ALL USING (user_id = auth.uid());
```

### What Is Never Stored

- Raw OAuth tokens or IMAP passwords (only `credentials_enc` blob)
- Raw private keys (only `private_key_enc` blob)
- Email content (fetched live from provider, not cached in DB)
- BYOK API keys (session storage only, cleared on tab close)

---

## 8. Deployment Models

### Self-Hosted (Docker Compose)

```
┌────────────────────────────────────────────────────────────┐
│  Your Server                                               │
│                                                            │
│  ┌──────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  upinbox     │  │  stalwart      │  │  postgres     │  │
│  │  Next.js     │  │  (optional     │  │  (your data,  │  │
│  │  :3001       │  │   @domain.com  │  │   encrypted)  │  │
│  │              │  │   mail server) │  │               │  │
│  └──────┬───────┘  └────────────────┘  └───────────────┘  │
│         │                                                  │
│  ┌──────▼───────┐                                         │
│  │  Nginx/      │                                         │
│  │  Caddy       │  ◄─── HTTPS TLS termination            │
│  │  (reverse    │                                         │
│  │   proxy)     │                                         │
│  └──────────────┘                                         │
│                                                            │
│  PLATFORM_ENCRYPTION_KEY = YOUR key, never leaves here    │
│  Email content = never stored, fetched from provider live  │
└────────────────────────────────────────────────────────────┘
         │
         │  Optional (Business/Enterprise license)
         ▼
  api.upinbox.ai/v1/intelligence
  (receives feature vectors only, never content)
```

**Characteristics:**
- You own all data at rest
- `PLATFORM_ENCRYPTION_KEY` is yours — we never see it
- Email content never cached on disk (fetched live)
- Intelligence API optional (heuristic + BYOK always available)
- Community tier: free, ≤10 users
- Business tier: $499/yr, ≤50 users, Intelligence API access
- Enterprise tier: $2,999/yr, unlimited users, SLA

### SaaS (upinbox.ai)

```
┌───────────────────────────────────────────────────────┐
│  upinbox.ai (Hetzner, EU-West)                       │
│                                                       │
│  ┌──────────────┐    ┌──────────────┐                │
│  │  UpInbox app │    │  Supabase    │                │
│  │  (Next.js)   │    │  PostgreSQL  │                │
│  │              │    │  (encrypted) │                │
│  └──────────────┘    └──────────────┘                │
│                                                       │
│  PLATFORM_ENCRYPTION_KEY = rotated, in Hetzner HSM   │
│  ZK private keys = encrypted at rest (Argon2id wrap) │
│  Email content = never stored here                   │
└───────────────────────────────────────────────────────┘
```

**Characteristics:**
- Managed hosting (EU-based)
- ZK encryption still applies — content never stored
- PLATFORM_ENCRYPTION_KEY managed by UpGPT, stored in HSM
- Business plan includes Intelligence API

### Key Differences

| | Self-Hosted | SaaS |
|---|---|---|
| `PLATFORM_ENCRYPTION_KEY` | You control | UpGPT (HSM-stored) |
| Database | Your Postgres | UpGPT Supabase |
| ZK encryption | Identical | Identical |
| Email content | Never stored (either way) | Never stored (either way) |
| Intelligence API | License JWT required | Included in Business plan |
| BYOK AI | Always available | Always available |
| Stalwart (own domain) | Optional, included | Not included in SaaS |

---

## 9. IP Protection Model

UpInbox is intentionally open about the client-side architecture. Here is what is and is not in the public repository:

### In the Public Repository (MIT / UAL-1.0)

| Component | License | What it does |
|---|---|---|
| `src/` — Next.js app | MIT | Full email client, UI, routing |
| `src/lib/mail/` | MIT | JMAP/IMAP adapters, MailProvider interface |
| `src/lib/encryption/` | MIT | ZK layer: OpenPGP.js, Argon2id, AES-256-GCM |
| `src/lib/usx/` | MIT | USX protocol: DNS discovery, encrypted delivery |
| `src/lib/mcp/` | MIT | MCP server: all 20+ tools |
| `packages/email-classifier/` | UAL-1.0 | Heuristic classifier (~70% accuracy) |
| `docker/` | MIT | Docker Compose, Stalwart config, Nginx templates |

**UAL-1.0 note:** The `@upgpt/email-classifier` package is source-available under the UpGPT Attribution License. Free for personal and internal commercial use. Requires attribution. Cannot be used to build a competing email intelligence product without a commercial license.

### Not in the Repository (Proprietary, API-only)

| Component | Where | What it does |
|---|---|---|
| Intelligence classifier weights | `api.upinbox.ai` | Trained model achieving ~95% accuracy |
| Feature extraction pipeline | `api.upinbox.ai` | Converts email metadata → feature vector |
| Reputation scoring | `api.upinbox.ai` | Sender/domain reputation database |
| Learning loop | Internal | Trains classifier on aggregated opt-in signals |

The Intelligence API contract is stable and documented. You can build on it. The model internals are proprietary.

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md). The MIT-licensed portions welcome PRs. The `@upgpt/email-classifier` package accepts bug fixes and feature contributions under the UAL-1.0 CLA.

## Further Reading

- [ZERO-KNOWLEDGE.md](./ZERO-KNOWLEDGE.md) — Full ZK encryption technical spec
- [AI-MODEL-FREEDOM.md](./AI-MODEL-FREEDOM.md) — BYOK, UpLink local AI, Intelligence API explained
- [USX-PROTOCOL.md](./USX-PROTOCOL.md) — USX encrypted delivery protocol
- [SELF-HOSTING.md](./SELF-HOSTING.md) — Complete self-hosting guide
