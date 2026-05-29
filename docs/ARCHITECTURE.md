# UpInbox Architecture

UpInbox is built on a small set of clear primitives. This document explains the architecture for self-hosters and contributors.

## High-Level Stack
- **Frontend**: Next.js 14 App Router, React Server Components, Jotai for client state, React Query for server state
- **Backend**: Next.js API routes (Node.js runtime), Supabase Postgres + Auth
- **Email Providers**: IMAP via imapflow, SMTP via nodemailer, JMAP via JMAP HTTP client
- **AI**: BYOK routing (Anthropic / OpenAI / Google / Ollama) via raw fetch
- **MCP**: Self-hosted JSON-RPC 2.0 server at /api/upinbox/mcp

## Directory Map
```
src/
├── app/
│   ├── (app)/         # Authenticated routes (require Supabase session)
│   │   ├── inbox/     # Main inbox UI
│   │   ├── settings/  # Settings panels
│   │   └── ...
│   └── api/upinbox/   # REST API
│       ├── accounts/  # Connection management
│       ├── emails/    # Email CRUD
│       ├── mcp/       # MCP server endpoint
│       └── ...
├── lib/
│   ├── billing/       # UpGPT entitlement + license verification
│   ├── mail/          # Email types, providers, threading
│   ├── intelligence/  # AI router, classifier
│   ├── ai/            # Draft generator
│   ├── mcp/           # MCP tool definitions, auth
│   └── ...
├── components/        # React UI
├── stores/            # Jotai atoms
├── hooks/             # React Query hooks
└── __tests__/         # Vitest test files

supabase/
└── migrations/        # SQL migrations (append-only, numbered)

public/                # Static assets (icons, manifest, sw.js)
```

## Core Concepts

### Entitlements
All API routes that touch user data check capabilities via:
```typescript
import { requireEmailEntitlement } from '@/lib/billing/upinbox-entitlement';

const result = await requireEmailEntitlement(request);
if (!result.ok) return NextResponse.json(result, { status: result.status });
```

Three auth sources tried in order: UpGPT JWT (mobile/MCP), Supabase session (web), MCP token (machine clients).

### Capabilities, Not Tiers
UpInbox doesn't have "Pro" or "Basic" tiers — it has capabilities you may or may not have:
- email, mcp, byok, native_mobile, multi_account, team

The JWT payload lists capabilities. Gates check capability presence. This matches UpGPT's composable pricing.

### Database Schema
All UpInbox tables live in the `upinbox` schema. RLS is mandatory:
- Account-scoped tables: `account_id IN (SELECT id FROM upinbox.accounts WHERE user_id = auth.uid())`
- User-scoped tables: `user_id = auth.uid()`

### Providers
Email is abstracted via the Provider interface in lib/mail/providers/. Implementations:
- IMAP (imapflow) — Gmail, Outlook (via app password), generic IMAP
- JMAP — Fastmail, native UpInbox
- OAuth Gmail (planned)

Providers expose: listMailboxes, listEmails, getEmail, sendEmail, moveEmail, deleteEmail.

### AI Routing
BYOK keys live in browser sessionStorage (never server-side). The API routes for AI features (/ai/draft, /ai/test) accept the key client-supplied per-request. No persistent storage of keys.

For users who don't configure BYOK, AI features show "Configure AI in Settings" prompts.

### MCP Server
`POST /api/upinbox/mcp` exposes Claude-compatible tools:
- list_emails, get_email, search_emails
- draft_reply, send_email, snooze_email
- list_mailboxes, move_email

Auth: Bearer token from `Settings → MCP Tokens`. Requires 'mcp' capability.

## Hot Paths
- **Email list render**: lib/mail/providers/imap.ts → app/api/emails/route.ts → hooks/use-emails.ts → components/mail/email-list.tsx
- **Compose + send**: components/mail/compose-window.tsx → hooks/use-emails.ts (useSendEmail) → /api/emails/send → providers/imap.ts (nodemailer)
- **AI draft**: components/ai/draft-generator-panel.tsx → /api/ai/draft → lib/ai/draft-generator.ts → BYOK provider fetch

## Why This Structure?
- Files under `(app)/` are the only auth-required pages
- Files under `api/upinbox/` follow REST conventions
- `lib/` is pure (no React) so it's easy to test
- `components/` is dumb (no fetching) so reuse is straightforward
- Hooks bridge components ↔ API
