# AI Model Freedom in UpInbox

UpInbox is built on a simple belief: **your email is your data, and your AI should be your choice**.
This document explains how that works technically.

---

## The Four AI Paths

UpInbox routes AI tasks through one of four paths, in priority order:

### Path 1: UpLink Local (100% offline)
If you have [UpLink](https://uplink.upgpt.ai) installed, it runs a local AI daemon
(Ollama, default model: phi4-mini or Gemma). UpInbox connects to it at `localhost:11435`.

```
Your email → UpInbox (local) → localhost:11435 → Ollama → Response
```

**Privacy:** The email text never leaves your computer. Zero API costs. Works without internet.

### Path 2: BYOK (Bring Your Own Key)
Enter your Claude, GPT, Gemini, or Groq API key in settings. UpInbox calls the API directly
from your browser — not from our servers.

```
Your email → Your browser → api.anthropic.com (your API key) → Response → Your browser
```

UpInbox is **not in this path**. The HTTP call is made by JavaScript running in your browser,
using your API key, to Anthropic/OpenAI/Google's servers. We never see your prompts.
Your API key is stored in your browser only (`localStorage`) — never transmitted to us.

**Supported providers:** Claude (Anthropic), GPT-4o (OpenAI), Gemini (Google), Llama (Groq)

### Path 3: Intelligence API (Business/Enterprise)
For users who want 95% accuracy without managing their own API key.
Requires a Business or Enterprise license.

```
Your email → Metadata features only (no content) → api.upinbox.ai → Classification result
```

**What we send:** Structural features only:
- Subject word count, body word count
- Has attachment (boolean)
- Sender domain category (commercial/newsletter/automated — not the actual address)
- Time of day, caps ratio, URL count
- Has greeting, has salutation (boolean)

**What we never send:** Email content, subject text, sender/recipient addresses.

The classifier runs on features, not content. Privacy preserved.

### Path 4: Heuristic (Free, Always Available)
The [`@upgpt/email-classifier`](https://github.com/UpGPT-ai/email-classifier) npm package
runs locally with zero API calls. ~70% accuracy. Ships in every Docker image.

---

## Supported BYOK Providers

| Provider | Models | BYOK Path |
|----------|--------|-----------|
| Anthropic | claude-haiku-4-5-20251001, claude-sonnet-4-6 | Direct browser → api.anthropic.com |
| OpenAI | gpt-4o-mini, gpt-4o | Direct browser → api.openai.com |
| Google | gemini-2.5-flash, gemini-2.0-flash | Direct browser → generativelanguage.googleapis.com |
| Groq | llama-3.1-8b-instant, mixtral-8x7b | Direct browser → api.groq.com |
| Mistral | mistral-7b-instruct | Direct browser → api.mistral.ai |
| UpLink | Any Ollama model | localhost:11435 (your computer) |

---

## AI Router Implementation

```typescript
// src/lib/mail/ai/router.ts (simplified)

export async function routeAiTask(
  task: 'classify' | 'summarize' | 'draft',
  input: string,
  accountId: string,
): Promise<AiResult> {
  const config = await getAiConfig(accountId);

  // Priority 1: UpLink local daemon (user's machine, zero cost)
  if (await isUplinkAvailable()) {
    return callUplink(task, input);
  }

  // Priority 2: BYOK — key lives in browser, call is browser → provider
  // Note: this path only fires from client-side code. The key is never on our server.
  if (config.byokProvider && config.byokKey) {
    return callByokProvider(config.byokProvider, config.byokKey, task, input);
  }

  // Priority 3: Intelligence API (license JWT required)
  if (config.classifyProvider === 'intelligence_api' && process.env.LICENSE_JWT) {
    const features = extractMetadataFeatures(input);  // never sends raw content
    return callIntelligenceApi(task, features);
  }

  // Priority 4: Free heuristic (always available, zero cost)
  return { result: classifyEmail(input), provider: 'heuristic' };
}
```

---

## Privacy Comparison

| | Gmail AI | Superhuman | Shortwave | UpInbox BYOK | UpInbox Local |
|---|--------|-----------|---------|------------|-------------|
| AI provider | Google | OpenAI | Anthropic | **Your choice** | **Ollama (local)** |
| Who sees prompts | Google | Superhuman → OpenAI | Shortwave → Anthropic | **Nobody** | **Nobody** |
| Email content on their servers | ✅ | ✅ | ✅ | ✅ (IMAP sync) | ❌ (local only) |
| Can disable AI | Partial | ❌ | ❌ | ✅ | ✅ |
| Opt out of training | Limited | Unknown | Unknown | ✅ (it's your key) | ✅ (it's local) |

---

## We Don't Promote Platform AI

UpInbox has a metered platform AI option (uses our Claude API key, billed to you).
We deliberately do not promote this. The settings UI leads with BYOK and UpLink.
If you use BYOK, we earn nothing on AI inference — and that's by design.

Our revenue comes from capabilities, not inference. You pay for the email intelligence
platform, not for Claude calls we mark up.

---

## AI Config in Settings

```
AI Settings
├── Classification
│   ○ Heuristic only (free, 70% accuracy)
│   ○ BYOK — use my own API key (95% accuracy, my bill)
│   ○ UpLink — run locally (95% accuracy, free, needs UpLink installed)
│   ● Intelligence API (95% accuracy, requires Business plan)  [if on Business]
│
├── Summarize & Draft
│   ○ BYOK — Claude (key stored in browser only)
│   ○ BYOK — GPT-4o Mini
│   ○ UpLink — local Ollama
│
└── API Keys (BYOK)
    Claude API key: [••••••••••••••••] [Stored in browser only. Never transmitted.]
    OpenAI API key: [••••••••••••••••]
    [Add provider +]
```
