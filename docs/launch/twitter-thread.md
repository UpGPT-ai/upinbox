# UpInbox Launch — Twitter / X Thread

**Handle:** @upgpt_ai (post from founder account, retweet from brand)
**Cadence:** Post tweets 1-8 back-to-back as a thread. Engagement replies posted as standalone quote-tweets ~6-12 hours after launch when comments start landing.
**Pinned for 7 days.** Track CTR on `upinbox.ai/?ref=x-launch`.

---

## Thread (8 tweets)

### 1/8 — Privacy hook

> Your inbox knows more about you than your therapist.
>
> Every "AI email assistant" today reads it in plaintext on someone else's servers, trains on it, and calls that a feature.
>
> We built UpInbox so that stops being the trade-off.
>
> Launching today. 🧵

*(Media: 1 screenshot — encrypted-at-rest indicator + "Your keys. Your email. Your AI." tagline.)*

---

### 2/8 — What it actually is

> UpInbox is an end-to-end encrypted email client with an AI layer that runs on **your** keys.
>
> – Zero-knowledge storage (we literally can't read your mail)
> – BYOK for OpenAI, Anthropic, Gemini, or a local model
> – Works with Gmail, IMAP, and any SMTP provider
>
> The AI is a tenant in your inbox, not a landlord.

---

### 3/8 — AI capabilities

> What the AI can actually do once you plug a key in:
>
> – Triage 500 emails into 5 piles in under a minute
> – Draft replies in your voice (trained on *your* sent folder, never ours)
> – Summarize long threads + extract action items
> – Auto-file, auto-archive, auto-unsubscribe rules you can read and edit

No black box. Every rule is inspectable.

---

### 4/8 — MCP integration (the part we're most excited about)

> UpInbox speaks **MCP** — the Model Context Protocol.
>
> That means Claude Desktop, Cursor, Zed, and any MCP-compatible agent can talk to your inbox *with your permission, scoped to specific folders or senders*.
>
> "Claude, find the invoice from Stripe last March and draft a follow-up." → done. Locally.

*(Media: 15-sec screen recording — Claude Desktop pulling a thread via MCP, drafting reply.)*

---

### 5/8 — Mobile story

> iOS + Android apps shipping in the same beta.
>
> – Biometric unlock (Face ID / fingerprint) for the encrypted vault
> – Push notifications that don't leak metadata to APNs/FCM
> – Voice triage on the go ("read me what's urgent")
> – Same MCP bridge — your phone can be the agent or the client
>
> One license. All devices.

---

### 6/8 — Pricing

> One subscription, one identity, every product we make.
>
> – **Free** — encrypted client, manual triage, no AI
> – **Plus $9/mo** — BYOK AI, MCP access, mobile apps
> – **Pro $29/mo** — multi-account, team sharing rules, priority support
>
> We don't sell inference. We sell the *tooling*. Your API spend stays yours.

---

### 7/8 — What's not polished yet (being honest)

> Day-1 beta, so:
>
> – Search across large archives is fast but not instant (working on it)
> – Calendar integration is read-only this sprint
> – Outlook OAuth ships next week — IMAP works today
> – Some onboarding edges are rough, especially first-time key generation
>
> We'd rather ship now and fix in public.

---

### 8/8 — Links

> Try it:
> 🔗 https://upinbox.ai (web + download)
> 📱 TestFlight + Play Beta linked on the site
> 🧩 MCP setup guide: upinbox.ai/mcp
> 💬 Discord: upinbox.ai/discord
>
> Reply with what's missing. We read every one — on encrypted mail, naturally.

---

## Engagement Reply Tweets (post as quote-tweets to the main thread when conversation builds)

### Reply 1 — "Why no free AI tier?"

> Asked a lot already: why no free AI tier?
>
> Because the second we host inference, we have to read your mail to route it. That breaks the entire promise.
>
> BYOK means the model provider sees it, not us. You can use a $0 local model on Plus and pay nothing past the $9.
>
> The math has to match the marketing.

---

### Reply 2 — Tech stack

> A few asks about the stack:
>
> – Client: Tauri (Rust + TS), SQLite encrypted at rest with SQLCipher, age for key wrap
> – Sync: Postfix + Dovecot on our infra, but mail is sealed before it lands
> – AI layer: provider-agnostic, OpenAI/Anthropic/Gemini/Ollama via a single adapter
> – MCP: native server, scoped tokens per agent
>
> Open-sourcing the client crypto module this month.

---

### Reply 3 — MCP integration story

> The MCP story is the one I keep getting DMs about, so:
>
> Most "AI inbox" tools wrap an LLM around your mail. We did the opposite — exposed the inbox as a tool surface and let *any* agent drive it.
>
> Your Claude Desktop reads your real inbox. Your Cursor agent can answer a customer thread. Your future agents inherit access via scoped, revocable tokens.
>
> The inbox stops being a destination. It becomes infrastructure.

---

## Posting checklist

- [ ] Confirm `upinbox.ai/?ref=x-launch` analytics tag is live
- [ ] Pre-record tweet 4 screen capture (Claude Desktop ↔ UpInbox MCP)
- [ ] Pre-render tweet 1 hero image with privacy tagline
- [ ] Schedule for Tuesday 9:15am PT (peak founder/dev engagement window)
- [ ] Greg posts thread, brand account quote-tweets tweet 1
- [ ] Drop in #launches Slack + r/selfhosted + HN /show within 30 min
- [ ] Founder DMs first 50 sign-ups personally within 24h
