# Show HN: UpInbox — Privacy-first email with BYOK AI and MCP server (MIT)

**Title (≤80 chars):**
`Show HN: UpInbox – Privacy-first email with BYOK AI and MCP server (MIT)`

**Links:**
- GitHub: https://github.com/UpGPT-ai/upinbox
- Live web client: https://mail.upinbox.ai

---

## Post body

Hey HN,

I've been frustrated for years that "AI email" basically means "let a SaaS company read every message you've ever received in exchange for a Gmail summary." So I built the opposite.

**UpInbox** is a privacy-first email client where:

1. **Your AI key never leaves your browser.** UpInbox is BYOK (Bring Your Own Key) — Anthropic, OpenAI, OpenRouter, or a local model. The key is stored locally and used to call the provider directly from your machine. Our servers never see it, never proxy it, never log prompts.
2. **Your inbox is yours.** We don't train on your mail. We don't sell ads against it. The data model assumes the server is hostile — content is encrypted at rest with keys you control.
3. **It speaks MCP.** UpInbox ships with an MCP (Model Context Protocol) server, so Claude Desktop, Cursor, Zed, or any MCP-aware agent can read, search, draft, and triage your inbox with your permission and your keys.
4. **MIT-licensed and self-hostable.** The whole thing — web client, MCP server, mail backend glue — is MIT on GitHub. If you don't trust us, run it yourself. If you do trust us, mail.upinbox.ai is the hosted version.

### Why I built it

I run a small AI tools company and I kept watching otherwise-thoughtful engineers paste full email threads into ChatGPT, or wire their inbox into closed AI assistants whose privacy policies were... aspirational. Meanwhile the "private" alternatives were either (a) no AI at all, or (b) a single hardcoded model with no way to bring your own.

The real unlock wasn't another AI inbox. It was an inbox where the AI is a **client** of you, not a service that owns you. BYOK + MCP + MIT was the only honest way to ship that.

### Key features

- **BYOK AI in the browser** — Anthropic, OpenAI, OpenRouter, Groq, Ollama (local). Keys stored client-side, never transmitted to UpInbox servers.
- **MCP server** — Plug your inbox into Claude Desktop, Cursor, or any MCP agent. Tools for list, search, read, draft, send, archive, label. Per-tool permission scopes.
- **Smart Screener** — On-device classification triages newsletters, transactional, cold outreach, and humans into separate streams. You can override and it learns the override (locally).
- **Tracker stripper** — Pixel trackers, link wrappers, and read-receipt beacons are stripped before render. Outbound mail strips your own client fingerprints too.
- **End-to-end transparent** — Every AI call shows you the prompt, the model, the provider, and the token cost. No hidden system prompts.
- **MIT self-hostable** — Docker compose, one config file, bring your own IMAP/SMTP or use the included Postfix/Dovecot setup.
- **Sustainable business model** — Hosted tier is a flat subscription for storage + the relay/anti-spam stack. No ads, no data resale, no per-token markup, no "AI credits." If you BYOK on the hosted tier, AI is free to you because it costs us nothing.

### Tech stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind
- **Backend:** Node + Postgres (via Supabase for hosted, plain Postgres for self-host), Redis for the job queue
- **Mail plane:** Postfix + Dovecot + Rspamd, IMAP/SMTP standards-only (no proprietary protocol)
- **AI plane:** BYOK direct-to-provider from the browser; MCP server in TypeScript using `@modelcontextprotocol/sdk`
- **Crypto:** AES-256-GCM for at-rest content, libsodium sealed boxes for cross-device key sync
- **Deploy:** Docker compose for self-host; hosted runs on Hetzner

### What I'd love feedback on

1. Threat model — is "server is hostile, browser is trusted" the right line? Where would you push it harder?
2. MCP tool surface — what's missing for agentic workflows? (Right now: search, read, draft, send, label, archive, summarize-thread.)
3. The sustainability story — does "flat subscription, BYOK, no AI markup" actually read as honest, or does it read as too-good-to-be-true?

Code: https://github.com/UpGPT-ai/upinbox
Try it: https://mail.upinbox.ai

Happy to go deep on any of the design choices in the comments. Roast it.

— Greg

---

## Shorter variants

### Twitter / X (≤280 chars; ~140-char core version)

**140-char core:**
> Launched UpInbox: privacy-first email. BYOK AI in your browser, MCP server for Claude/Cursor, tracker-stripping, MIT. mail.upinbox.ai

**280-char extended:**
> Just launched UpInbox on HN: a privacy-first email client where your AI key never leaves your browser.
>
> • BYOK (Anthropic, OpenAI, local)
> • MCP server for Claude Desktop / Cursor
> • Tracker stripper
> • MIT, self-hostable
>
> Code: github.com/UpGPT-ai/upinbox
> Try: mail.upinbox.ai

---

### LinkedIn (medium length)

**Today I'm launching UpInbox — a privacy-first email client built around a simple idea: your AI should work for you, not own you.**

Most "AI email" products require handing your entire inbox to a third party in exchange for summaries and smart replies. The economics only work if they can train on, mine, or monetize your messages. That's a trade I was never willing to make, and after talking to dozens of engineers, founders, and operators, neither were they.

So we built the opposite.

**What UpInbox does differently:**

🔐 **BYOK AI in the browser** — Bring your own Anthropic, OpenAI, OpenRouter, or local model key. The key stays in your browser. Our servers never see it, never proxy it, never log a single prompt.

🤖 **MCP server included** — UpInbox ships with a Model Context Protocol server, so Claude Desktop, Cursor, Zed, or any MCP-aware agent can safely work with your inbox using your keys and your permission scopes.

🧹 **Smart Screener + tracker stripper** — On-device triage separates humans from newsletters from cold outreach. Pixel trackers and read-receipt beacons are stripped before render.

📖 **MIT-licensed and self-hostable** — The full stack is open source on GitHub. Don't trust us? Run it yourself with one Docker compose file. Want hosted? mail.upinbox.ai.

💰 **A sustainable business model that doesn't require betraying you** — Flat subscription for hosted storage and the mail relay. No ads. No data resale. No per-token AI markup. If you BYOK, AI is effectively free on the hosted tier because it costs us nothing.

**Tech:** Next.js 14, TypeScript, Postgres, Postfix/Dovecot/Rspamd, MCP SDK, AES-256-GCM at rest, deployed on Hetzner.

The whole premise of UpInbox is that privacy-first and AI-native are not opposites — they're the same product, if you're willing to give up the surveillance business model.

Code: https://github.com/UpGPT-ai/upinbox
Try it: https://mail.upinbox.ai
Show HN thread: (link once live)

If you've been waiting for an AI inbox that doesn't require you to surrender your data to use it, I'd love your feedback.

#OpenSource #Privacy #AI #MCP #Email #DeveloperTools
