# UpInbox

**Your email. Your AI. Your rules.**

UpInbox is an open-source email intelligence layer that connects to Gmail, Outlook, Fastmail, or any IMAP server — and makes it smart. You choose the AI: bring your own Claude/GPT/Gemini key, run it 100% locally with [UpLink](https://uplink.upgpt.ai), or use our hosted intelligence API.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm: @upgpt/email-classifier](https://img.shields.io/badge/npm-%40upgpt%2Femail--classifier-red)](https://www.npmjs.com/package/@upgpt/email-classifier)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)

---

## What It Does

- **Connects to any inbox** — Gmail (OAuth), Outlook (OAuth), Fastmail (JMAP), or generic IMAP. You own the account; we're just the intelligence layer.
- **AI that's yours** — Bring your own Claude/GPT/Gemini API key (runs in your browser, we never see it), or install [UpLink](https://uplink.upgpt.ai) for 100% local AI via Ollama.
- **Zero-knowledge encryption** — Ed25519 keypairs, OpenPGP.js, Argon2id key derivation. Private keys never leave your browser. Server stores ciphertext only.
- **Open source client** — MIT license. The email client, JMAP/IMAP adapters, encryption layer, and USX protocol are all here. Audit them.
- **Self-hostable** — Docker Compose. 10-minute deploy. Your server, your keys, your data.

---

## Features

| Feature | Free | Plus $9/mo | Business $19/user |
|---------|------|-----------|------------------|
| Connect Gmail / Outlook / IMAP | ✅ | ✅ | ✅ |
| BYOK AI (Claude, GPT, Gemini) | ✅ | ✅ | ✅ |
| Local AI via UpLink (Ollama) | ✅ | ✅ | ✅ |
| Zero-knowledge encryption (USX) | ✅ | ✅ | ✅ |
| Email screener + smart feed | ✅ | ✅ | ✅ |
| Smart labels + auto-archive | ❌ | ✅ | ✅ |
| AI drafts + writing coach | ❌ | ✅ | ✅ |
| Reply Later + Paper Trail | ❌ | ✅ | ✅ |
| UpInbox Intelligence API (95% accuracy, no API key needed) | ❌ | ❌ | ✅ |
| MCP server for AI assistants | ✅ | ✅ | ✅ |

---

## Quick Start (Hosted)

1. Go to [upinbox.ai](https://upinbox.ai)
2. Connect your Gmail or Outlook — takes 60 seconds
3. Add your AI key (Claude/GPT) — runs in your browser, we never see it
4. Optional: install [UpLink](https://uplink.upgpt.ai) for 100% local AI

---

## Self-Host in 10 Minutes

```bash
git clone https://github.com/UpGPT-ai/upinbox.git
cd upinbox
cp .env.example .env
# Edit .env — set PLATFORM_ENCRYPTION_KEY, POSTGRES_PASSWORD
docker compose up -d
```

Visit `http://localhost:3001` → connect your Gmail or Outlook → done.

The Docker image includes:
- UpInbox web app (Next.js)
- Stalwart mail server (for optional @yourdomain.com addresses)
- PostgreSQL

**What's in the image:** JMAP/IMAP adapters, USX encryption, BYOK AI routing, the [`@upgpt/email-classifier`](https://github.com/UpGPT-ai/email-classifier) npm package (UAL-1.0, 70% heuristic accuracy).

**What's not in the image:** UpInbox's trained intelligence classifier (~95% accuracy, no API key needed). That lives at `api.upinbox.ai` and requires a [Business or Enterprise license](https://upinbox.ai/licenses). Community tier (≤10 users) is free forever with heuristic classification and BYOK.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  UpInbox Client (Next.js 15)                                    │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Gmail OAuth │  │ Outlook OAuth│  │ IMAP / JMAP Adapter    │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│         └────────────────┴────────────────────┘                 │
│                   MailProvider Interface                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Intelligence Router                                      │  │
│  │  ① @upgpt/email-classifier (npm, free, 70%)             │  │
│  │  ② BYOK: your Claude/GPT key → your bill               │  │
│  │  ③ UpLink: localhost Ollama → 100% local               │  │
│  │  ④ Intelligence API: api.upinbox.ai (license JWT, 95%) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────┐   ┌────────────────────────────────┐ │
│  │ ZK Encryption Layer  │   │ USX Protocol                   │ │
│  │ OpenPGP.js (Ed25519) │   │ Encrypted delivery between     │ │
│  │ Argon2id key deriv.  │   │ UpInbox users                 │ │
│  └──────────────────────┘   └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Full architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## MCP Server

UpInbox exposes a full MCP server for AI assistants. Connect Claude Desktop or Cursor:

```json
{
  "mcpServers": {
    "upinbox": {
      "url": "https://your-instance.com/api/upinbox/mcp",
      "auth": "Bearer YOUR_MCP_TOKEN"
    }
  }
}
```

→ See [`UpGPT-ai/upinbox-mcp`](https://github.com/UpGPT-ai/upinbox-mcp) for 20+ tools.

---

## Email Classification

The [`@upgpt/email-classifier`](https://github.com/UpGPT-ai/email-classifier) npm package powers free-tier classification:

```typescript
import { classifyEmail } from '@upgpt/email-classifier';

const result = classifyEmail({
  subject: 'Re: Your order has shipped',
  from: 'shipping@amazon.com',
  headers: { 'list-unsubscribe': '<mailto:...>' },
  bodyText: 'Your order #123 has shipped...',
});
// → { category: 'RECEIPT', confidence: 0.92, signals: ['domain:amazon.com', 'kw_shipped'] }
```

Zero dependencies. Works in browser or Node. MIT + attribution.

---

## License

UpInbox client code: **MIT License** — see [LICENSE](LICENSE)

`@upgpt/email-classifier` package: **[UAL-1.0](https://github.com/UpGPT-ai/email-classifier/blob/main/LICENSE)** — free with "Powered by UpGPT.ai" attribution. Commercial license (remove attribution): [hello@upgpt.ai](mailto:hello@upgpt.ai)

UpInbox Intelligence API: Proprietary — [license tiers](https://upinbox.ai/licenses)

---

## Contributing

PRs welcome on the client, adapters, encryption layer, and MCP server. See [CONTRIBUTING.md](CONTRIBUTING.md).

**Do not submit PRs that attempt to:**
- Add intelligence API calls without the JWT enforcement
- Remove license checks from the self-host Docker build
- Embed the platform classifier logic locally

---

## Links

- 🌐 [upinbox.ai](https://upinbox.ai)
- 📧 [Create a free @upinbox.ai address](https://upinbox.ai)
- 📦 [npm: @upgpt/email-classifier](https://www.npmjs.com/package/@upgpt/email-classifier)
- 🔌 [UpInbox MCP Server](https://github.com/UpGPT-ai/upinbox-mcp)
- 🤖 [UpLink — Local AI](https://uplink.upgpt.ai)
- 📖 [Self-hosting guide](docs/SELF-HOSTING.md)
- 🔒 [Zero-knowledge architecture](docs/ZERO-KNOWLEDGE.md)
