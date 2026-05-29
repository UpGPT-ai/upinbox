# Getting Started with UpInbox

UpInbox is a privacy-first email client. This guide gets you reading email in your inbox in under 10 minutes.

## 1. Subscribe at UpGPT.ai
UpInbox is part of your UpGPT subscription. Get the email capability at https://upgpt.ai/account/subscribe

## 2. Sign in to mail.upinbox.ai
Use your UpGPT account. Same login, same subscription.

## 3. Connect your first email account
Click "Connect account" → Choose provider:
- **Gmail / Google Workspace** — OAuth, no password needed
- **Outlook / Office 365** — OAuth or app password
- **Fastmail / Generic IMAP** — Server + app password
- **upinbox.ai** — Native account (advanced)

Credentials are AES-256-GCM encrypted before storage. We never see your password.

## 4. Configure AI (optional but recommended)
Settings → AI & Draft:
- Choose provider: Anthropic / OpenAI / Google / Ollama (local)
- Paste your API key (stored in your browser, never sent to UpInbox)
- Test connection
- Pick model

Without AI configured, you still get: tracker stripper, snooze, send later, signatures, search.
With AI configured: Smart Screener, AI drafts, thread summaries, smart reply chips.

## 5. Set up MCP (for power users)
Settings → MCP Tokens → Create token → Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "upinbox": {
      "url": "https://mail.upinbox.ai/api/upinbox/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

Now Claude can read, search, and draft replies from your inbox.

## 6. Install on phone
- iOS: Download UpLink from App Store → sign in → Inbox tab appears
- Android: Same flow via Play Store
- PWA: Open mail.upinbox.ai in mobile browser → "Add to Home Screen"

## What's next?
- [Architecture](./architecture.md) — How UpInbox is built
- [API Reference](./api-reference.md) — REST + MCP endpoints
- [Self-Hosting](../SELF-HOSTING.md) — Run your own server (MIT)
- [Contributing](../CONTRIBUTING.md) — Help build UpInbox
