# AI Model Freedom in UpInbox

> **Version:** 1.0 — May 2026

UpInbox is built on a simple principle: **your email is your data, and your AI should be your choice.** Most email products with AI features route your messages through their servers to an AI they control. You have no visibility into what is sent, how long it is retained, or whether it trains their next model.

UpInbox takes a different approach. You choose the AI path. You control where your email content goes.

---

## Table of Contents

1. [Why BYOK Matters](#1-why-byok-matters)
2. [The Four AI Paths](#2-the-four-ai-paths)
3. [Path A: Heuristic (Free, Always Available)](#3-path-a-heuristic-free-always-available)
4. [Path B: BYOK AI — Browser-Direct](#4-path-b-byok-ai--browser-direct)
5. [Path C: UpLink Local AI — 100% Offline](#5-path-c-uplink-local-ai--100-offline)
6. [Path D: Intelligence API](#6-path-d-intelligence-api)
7. [Supported BYOK Providers](#7-supported-byok-providers)
8. [Technical Implementation: The AI Router](#8-technical-implementation-the-ai-router)
9. [Privacy Guarantees by Path](#9-privacy-guarantees-by-path)
10. [Comparison: UpInbox vs Gmail AI vs Superhuman vs Shortwave](#10-comparison-upinbox-vs-gmail-ai-vs-superhuman-vs-shortwave)
11. [AI Settings UI Walkthrough](#11-ai-settings-ui-walkthrough)
12. [Our Business Model Does Not Depend on Inference](#12-our-business-model-does-not-depend-on-inference)
13. [Future Directions](#13-future-directions)

---

## 1. Why BYOK Matters

When you use an email product that offers AI features, your email content typically travels a path like this:

```
Your inbox → Product's servers → Product's AI pipeline → Product's AI provider → Response
```

At every arrow, your email content is visible to a server you do not control. This raises several concerns:

**Privacy:**
- Who reads the prompt before it hits the model?
- Does the product log prompts for debugging?
- Does the AI provider train on your data?

**Regulatory:**
- GDPR, HIPAA, SOC 2 — many frameworks require knowing where sensitive data is processed
- "We send it to OpenAI" may not be an acceptable answer for legal email at a law firm

**Vendor lock-in:**
- If the product's AI costs go up, yours do too
- If they switch models or degrade quality, you have no recourse

**Control:**
- You have no visibility into the system prompt shaping the AI's behavior
- You cannot choose a model that fits your use case

BYOK solves all of these. When you bring your own API key, the call path is:

```
Your inbox → Your browser → Anthropic/OpenAI/Google API (your key) → Response
```

UpInbox is not in this path. We never see your prompts. We never see the model response. Your API key is stored in your browser session only and is never transmitted to our servers.

---

## 2. The Four AI Paths

UpInbox routes AI tasks through one of four paths. The router checks them in priority order:

```
Incoming AI task (classify / summarize / draft)
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  AI Router (src/lib/mail/ai/router.ts)                         │
│                                                                 │
│  1. UpLink Desktop detected?   ──YES──► Path C (Local, Ollama) │
│     localhost:11435 responds                                    │
│                                                                 │
│  2. BYOK key configured?       ──YES──► Path B (BYOK, direct)  │
│     User has provider key                                       │
│                                                                 │
│  3. License JWT valid (Biz)?   ──YES──► Path D (Intelligence   │
│     And user opted into API            API, feature vector)    │
│                                                                 │
│  4. Default fallback           ──────► Path A (Heuristic,      │
│                                         @upgpt/email-classifier)│
└─────────────────────────────────────────────────────────────────┘
```

The user can override this priority order in Settings → AI, for example pinning BYOK even when UpLink is running, or disabling the Intelligence API entirely.

---

## 3. Path A: Heuristic (Free, Always Available)

**Package:** `@upgpt/email-classifier` (npm, UAL-1.0)
**Accuracy:** ~70%
**Cost:** Zero
**Privacy:** Absolute — runs in-process, zero network calls

The heuristic classifier ships inside every UpInbox Docker image. It runs synchronously in Node.js (or in the browser via the WASM build). No model weights, no neural network — it uses a combination of rule-based patterns, n-gram features, and sender domain reputation to classify messages.

```typescript
import { classify } from '@upgpt/email-classifier';

const result = classify({
  subject: 'Your order has shipped',
  snippet: 'Your order #12345 has been shipped via UPS...',
  senderDomain: 'amazon.com',
  headers: {
    'List-Unsubscribe': '<mailto:unsub@amazon.com>',
    'X-Mailer': 'Amazon SES',
  },
});
// result.label: 'transactional'
// result.confidence: 0.91
// result.features: ['has_list_unsubscribe', 'known_ecommerce_domain', 'order_keywords']
```

**Output labels:** `newsletter` | `transactional` | `personal` | `work` | `promotional` | `spam` | `unknown`

**When to use:**
- Community tier self-hosters who have no API key
- Users who want zero AI cost and accept lower accuracy
- CI/CD test environments where no real model should be called

---

## 4. Path B: BYOK AI — Browser-Direct

**Accuracy:** ~95%
**Cost:** Your provider bill (typically $0.001–$0.01 per email summarized)
**Privacy:** Your browser calls the provider directly — UpInbox servers are not in the path

### How BYOK Works Technically

The BYOK API call is made by JavaScript running inside your browser tab. It is not proxied through any UpInbox server.

```
Your email
  │
  ▼
UpInbox UI (browser tab)
  │
  ├── Builds prompt locally:
  │     "Classify this email. Category options: [newsletter, transactional, personal, work, promotional, spam].
  │      Subject: {subject}
  │      Snippet: {first 500 chars}
  │      Sender domain: {domain}"
  │
  ├── Reads BYOK key from sessionStorage (your key, stored in your browser only)
  │
  └── fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': byokKey,      ← your Anthropic key
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5', messages: [{ role: 'user', content: prompt }], max_tokens: 50 }),
      })

                    ↓  (direct connection — no UpInbox server involved)

              api.anthropic.com
                    │
                    └── Returns: { content: [{ text: "transactional" }] }

UpInbox UI receives result, updates thread label
```

**What UpInbox sees:** Nothing from this exchange. No server log, no request intercepted.

**What Anthropic sees:** Your prompt (email content), your API key's account. Subject to Anthropic's privacy policy.

**Your API key storage:** Stored in `sessionStorage` only. Cleared when the tab closes or you sign out. Never sent to any UpInbox endpoint.

### BYOK for Drafts and Summaries

BYOK works for all AI tasks, not just classification:

- **Classify:** route the email to the right folder/label
- **Summarize:** produce a 2-3 sentence summary of a long thread
- **Draft:** generate a reply or compose from scratch
- **Extract action items:** pull tasks from a meeting thread
- **Writing coach:** suggest edits to improve tone or clarity

All of these use the same browser-direct pattern. None of them touch UpInbox servers.

---

## 5. Path C: UpLink Local AI — 100% Offline

**Accuracy:** Model-dependent (Llama 3.1 8B ≈ 88%, Mistral 7B ≈ 85%, phi4-mini ≈ 82%)
**Cost:** Electricity only (your hardware)
**Privacy:** Absolute — no network call of any kind. Works without an internet connection.

### How It Works

[UpLink Desktop](https://uplink.upgpt.ai) is a native desktop companion app that runs a local AI daemon on your machine. When UpInbox detects UpLink, it routes AI tasks to it instead of making any external API call.

```
UpInbox UI (browser tab)
  │
  └── fetch('http://localhost:11435/api/classify', {
        method: 'POST',
        headers: { 'X-UpLink-Token': localSessionToken },
        body: JSON.stringify({ task: 'classify', content: emailSnippet }),
      })

            ↓ (loopback — never leaves your machine)

      UpLink Desktop daemon (localhost:11435)
            │
            └── Ollama local inference
                  │
                  └── Your chosen local model (phi4-mini, Llama 3.1 8B, etc.)
                        │
                        └── Returns classification result
```

### Why UpLink Uses Port 11435

Port 11434 is Ollama's native port. UpLink uses 11435 to avoid conflicts if you also run Ollama directly. UpLink proxies to its managed Ollama instance and adds a session token to prevent other local processes from calling the endpoint.

### Selecting a Model in UpLink

UpLink Desktop includes a model manager. Recommended models for email classification:

| Model | Size | Accuracy | Speed |
|---|---|---|---|
| `phi4-mini` | 3.8B / ~2.5GB | 82% | Very fast |
| `llama3.1:8b` | 8B / ~5GB | 88% | Fast |
| `mistral:7b-instruct` | 7B / ~4.5GB | 85% | Fast |
| `llama3.1:70b` | 70B / ~45GB | 94% | Slow (requires 64GB+ RAM or GPU) |

For drafting and summarization tasks where speed is less critical, `llama3.1:70b` or `mistral:8x7b` produce higher quality output.

### UpLink Availability Detection

```typescript
// src/lib/mail/ai/router.ts

async function isUplinkAvailable(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11435/api/health', {
      signal: AbortSignal.timeout(500),   // 500ms timeout — fast fail if not running
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

If UpLink is not running, the router falls through to the next path. There is no error displayed to the user — it silently falls back.

---

## 6. Path D: Intelligence API

**Accuracy:** ~95%
**Cost:** Included in Business ($499/yr self-hosted) and Enterprise ($2,999/yr) licenses
**Privacy:** Feature vectors sent, never email content

The Intelligence API is for users who want high accuracy without managing their own API key. It is hosted at `api.upinbox.ai/v1/intelligence`.

### What Is Sent

The Intelligence API receives a feature vector, not email content:

```json
{
  "features": {
    "subject_token_count": 4,
    "subject_has_re": false,
    "subject_has_fwd": false,
    "body_word_count_bucket": "medium",
    "has_unsubscribe_header": true,
    "has_list_id_header": true,
    "sender_domain_reputation_tier": "commercial",
    "sender_is_known_esp": true,
    "attachment_count": 0,
    "thread_depth": 1,
    "hour_of_day": 9,
    "has_greeting": false,
    "has_salutation": false,
    "url_count_bucket": "many",
    "caps_ratio_bucket": "normal"
  },
  "license_jwt": "eyJ..."
}
```

**What is never sent:** Subject text, body content, sender address, recipient address, attachment contents.

### Feature Extraction Is Client-Side

The feature vector is assembled by `src/lib/mail/ai/feature-extractor.ts` inside the UpInbox app (self-hosted: on your server; SaaS: on UpInbox servers). The raw email content is transformed into this vector locally. Only the vector is transmitted.

### License JWT

The Intelligence API requires a valid license JWT in every request. The JWT encodes: license tier, expiry, max user count, and a signature we verify server-side. Invalid or expired JWTs receive HTTP 401. Licenses are issued at [https://upinbox.ai/licenses](https://upinbox.ai/licenses).

---

## 7. Supported BYOK Providers

| Provider | Models Supported | API Base URL |
|---|---|---|
| Anthropic (Claude) | claude-haiku-4-5-20251001, claude-sonnet-4-6, claude-opus-4-7 | `https://api.anthropic.com` |
| OpenAI | gpt-4o-mini, gpt-4o, o3-mini | `https://api.openai.com` |
| Google (Gemini) | gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-pro | `https://generativelanguage.googleapis.com` |
| Groq | llama-3.1-8b-instant, mixtral-8x7b-32768 | `https://api.groq.com/openai` |
| Mistral | mistral-7b-instruct, mistral-small | `https://api.mistral.ai` |
| UpLink (local) | Any Ollama model | `http://localhost:11435` |

### Adding a Custom Endpoint

For self-hosted instances running local models via a custom OpenAI-compatible endpoint:

```
Settings → AI → BYOK → Add Provider → Custom (OpenAI-compatible)
  Base URL: https://your-endpoint.internal/v1
  API Key:  your-key
  Model:    your-model-name
```

This works with llama.cpp, vLLM, LM Studio, Jan, or any OpenAI-compatible inference server.

---

## 8. Technical Implementation: The AI Router

```typescript
// src/lib/mail/ai/router.ts (simplified)

export type AiTask = 'classify' | 'summarize' | 'draft' | 'extract_actions';

export async function routeAiTask(
  task: AiTask,
  content: string,
  config: AiConfig
): Promise<AiResult> {

  // Path C: UpLink local (user opted in + daemon running)
  if (config.preferLocal !== false && await isUplinkAvailable()) {
    return callUplink(task, content);
  }

  // Path B: BYOK (key in browser sessionStorage — this runs client-side only)
  if (typeof window !== 'undefined' && config.byokProvider && config.byokKey) {
    return callByokProvider(config.byokProvider, config.byokKey, task, content);
  }

  // Path D: Intelligence API (server-side feature extraction + API call)
  if (config.useIntelligenceApi && process.env.LICENSE_JWT) {
    const features = extractFeatures(content);          // extract, never send raw content
    return callIntelligenceApi(task, features, process.env.LICENSE_JWT);
  }

  // Path A: Heuristic fallback (always available, zero cost)
  if (task === 'classify') {
    return { label: classifyEmail(content), provider: 'heuristic', confidence: null };
  }

  // Non-classification tasks (summarize/draft) require an AI model
  throw new AiNotConfiguredError(
    'No AI provider configured. Add a BYOK key or install UpLink for full AI features.'
  );
}
```

### Error Handling

If a BYOK call fails (wrong key, rate limit, provider outage), the router catches the error and falls through to the next available path. The user sees a small notification: "AI temporarily unavailable — using heuristic classifier." This prevents a failed API key from breaking the inbox experience.

---

## 9. Privacy Guarantees by Path

| Path | Email content leaves device? | Who sees it? | UpInbox in the path? |
|---|---|---|---|
| A — Heuristic | No | Nobody | In-process only |
| B — BYOK | Yes | Your AI provider (Anthropic/OpenAI/etc.) | No |
| C — UpLink Local | No | Nobody | No (loopback only) |
| D — Intelligence API | No (features only) | UpInbox API (feature vector only) | Yes (feature vector) |

**The key distinction for Path D:** The Intelligence API receives a structural description of the email (word count buckets, boolean header flags, domain reputation tier). It does not receive words. It cannot reconstruct the email from the feature vector. This is functionally equivalent to sending "this email is medium-length, has an unsubscribe header, and comes from a known ESP" — sufficient for classification, insufficient for content reconstruction.

---

## 10. Comparison: UpInbox vs Gmail AI vs Superhuman vs Shortwave

| Feature | Gmail AI | Superhuman | Shortwave | UpInbox BYOK | UpInbox Local |
|---|---|---|---|---|---|
| Who controls the AI? | Google | Superhuman | Shortwave | You | You |
| AI provider | Google Gemini | OpenAI | Anthropic | Your choice | Ollama (local) |
| Email content sent to AI vendor | ✅ Google | ✅ Superhuman→OpenAI | ✅ Shortwave→Anthropic | ✅ Your browser→Your provider | ❌ Never |
| Content sent to email product's servers | ✅ | ✅ | ✅ | ❌ (client-side call) | ❌ |
| Can you choose the model? | ❌ | ❌ | ❌ | ✅ | ✅ |
| Can you use a private/self-hosted model? | ❌ | ❌ | ❌ | ✅ (custom endpoint) | ✅ |
| Works offline? | ❌ | ❌ | ❌ | ❌ | ✅ |
| HIPAA-compatible AI path? | Limited BAA | Not public | Not public | ✅ (local/BYOK with BAA from provider) | ✅ |
| AI cost per month | Included (in Google One) | Included | Included | Your provider bill | Electricity |
| Open source? | ❌ | ❌ | ❌ | ✅ (MIT) | ✅ (MIT + UpLink) |

**A note on fairness:** Gmail, Superhuman, and Shortwave are good products. The comparison above reflects structural privacy differences, not quality differences. Their AI integrations may outperform UpInbox heuristics in some scenarios — the trade-off is privacy vs. convenience.

---

## 11. AI Settings UI Walkthrough

```
Settings → AI & Intelligence
│
├── Classification Engine
│   ○ Heuristic only (free, ~70% accuracy, zero data shared)
│   ○ BYOK — use my API key (~95% accuracy, my API bill, direct to provider)
│   ● UpLink — use local AI (~85-94% accuracy, free, needs UpLink Desktop)  [if UpLink detected]
│   ○ Intelligence API (~95% accuracy, requires Business plan)               [if licensed]
│
├── Summarize & Draft AI
│   Separate from classification — can use a different provider
│   ○ BYOK — Claude (haiku-4-5 for speed, sonnet-4-6 for quality)
│   ○ BYOK — GPT-4o Mini
│   ○ UpLink — local Ollama model
│
├── BYOK API Keys
│   These keys are stored in your browser only.
│   They are never transmitted to UpInbox servers.
│   They are cleared when you sign out or close the browser.
│
│   Anthropic API Key:  [••••••••sk-ant-•••••••]  [Verify] [Clear]
│   OpenAI API Key:     [not set]                  [Add]
│   Custom Endpoint:    [not set]                  [Add]
│
│   ℹ️ Keys are stored in sessionStorage. Refreshing the page or closing
│      the tab will require you to re-enter your key.
│      For persistent storage, install the UpInbox browser extension
│      (encrypts keys in extension storage — not accessible to the web app).
│
└── Privacy Settings
    ☑ Allow Intelligence API to receive metadata features for classification
    ☐ Opt out of aggregated model improvement (Business/Enterprise only)
    ☑ Show which AI path was used for each classification (badge in thread view)
```

---

## 12. Our Business Model Does Not Depend on Inference

We want to be direct about this: UpInbox does not make money on AI inference. We do not mark up API calls. We do not run a proprietary model that you must use.

Revenue comes from:
- **Licenses** (Business $499/yr, Enterprise $2,999/yr self-hosted)
- **SaaS plans** (Free / Plus $9/mo / Business $19/user/mo)
- **UpLink** — the desktop companion app that powers local AI and advanced features

When you use BYOK, your API calls go directly to Anthropic/OpenAI/Google. We earn nothing on those calls. We actively support this because it aligns our incentives with yours: we win by building the best email intelligence platform, not by maximizing AI usage fees.

The settings UI deliberately leads with BYOK and UpLink. The Intelligence API option is listed last, after the privacy-first options.

---

## 13. Future Directions

### Model Routing by Task

Different tasks benefit from different model sizes. A future version of the AI router will automatically select the cheapest model sufficient for the task:

| Task | Recommended Model | Why |
|---|---|---|
| Classification | claude-haiku-4-5 or phi4-mini | Low reasoning required, high volume |
| Summarization | claude-sonnet-4-6 or llama3.1:8b | Medium reasoning, moderate volume |
| Draft (short reply) | claude-haiku-4-5 or mistral:7b | Speed prioritized |
| Draft (complex compose) | claude-sonnet-4-6 or llama3.1:70b | Quality prioritized |
| Extract action items | claude-haiku-4-5 | Structured output, low reasoning |

### User-Defined System Prompts

We plan to support user-defined system prompt prefixes for all BYOK calls. This allows organizations to add context (e.g., "I am a lawyer at a litigation firm. Classify emails accordingly.") or guardrails without UpInbox being able to enforce or read them.

### AI Transparency Log

A per-thread log showing: which AI path was used, which model, the classification result, and the confidence score. Allows users to audit AI decisions and override them. Data stored locally — not sent to UpInbox.

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Full system architecture, intelligence routing diagram
- [ZERO-KNOWLEDGE.md](./ZERO-KNOWLEDGE.md) — How ZK encryption works alongside AI
- [USX-PROTOCOL.md](./USX-PROTOCOL.md) — Encrypted delivery between users
- [SELF-HOSTING.md](./SELF-HOSTING.md) — Running your own instance with custom AI config
