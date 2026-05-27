/**
 * UpInbox Extension — 4-path email classifier
 *
 * Path priority (matching server-side router.ts):
 *  1. UpLink     — local Ollama via UpLink daemon (low latency, any tier)
 *  2. BYOK       — Claude / OpenAI / Gemini (95% accuracy, plus+)
 *  3. Intelligence API — hosted privacy-safe metadata (95%, business tier)
 *  4. Heuristic  — @upgpt/email-classifier (70%, always available, zero network)
 *
 * Heuristic runs first as an early-exit: if confidence >= 0.8, skip AI entirely.
 * This prevents unnecessary API calls for obvious emails.
 */

import { classifyEmail as heuristicClassify } from '@upgpt/email-classifier';
import type {
  ClassificationResult,
  ClassifyEmailPayload,
  ExtensionSettings,
  EmailCategory,
} from './types';

// ─── Heuristic (path: heuristic) ──────────────────────────────────────────────

export function runHeuristic(payload: ClassifyEmailPayload): ClassificationResult {
  const start = performance.now();
  const result = heuristicClassify({
    subject: payload.subject,
    from: payload.fromEmail,
    bodyText: payload.bodyText,
    snippet: payload.snippet,
    headers: payload.headers,
  });

  return {
    category: result.category as EmailCategory,
    confidence: result.confidence,
    path: 'heuristic',
    signals: result.signals,
    latencyMs: Math.round(performance.now() - start),
  };
}

// ─── Metadata feature extraction ──────────────────────────────────────────────
// Mirrors server-side src/lib/intelligence/metadata-features.ts
// NEVER includes raw email content — only structural features.

interface MetadataFeatures {
  subjectWordCount: number;
  bodyWordCount: number;
  hasAttachment: boolean;
  senderDomainType: 'personal' | 'business' | 'bulk' | 'unknown';
  capsRatio: number;
  hasUrls: boolean;
  urlCount: number;
  punctuationPattern: string;
  hasGreeting: boolean;
  hasSalutation: boolean;
  listUnsubscribePresent: boolean;
}

function extractMetadataFeatures(payload: ClassifyEmailPayload): MetadataFeatures {
  const subject = payload.subject ?? '';
  const body = payload.bodyText ?? '';
  const from = payload.fromEmail ?? '';
  const headers = payload.headers ?? {};

  const subjectWords = subject.trim().split(/\s+/).filter(Boolean);
  const bodyWords = body.trim().split(/\s+/).filter(Boolean);
  const capsCount = (body.match(/[A-Z]/g) ?? []).length;
  const letterCount = (body.match(/[a-zA-Z]/g) ?? []).length;
  const urlMatches = body.match(/https?:\/\/\S+/g) ?? [];

  // Classify sender domain
  const domain = from.split('@')[1]?.toLowerCase() ?? '';
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'aol.com'];
  const bulkSenderPatterns = /noreply|no-reply|newsletter|notifications?|updates?|mailer|bounce|donotreply/;
  const senderDomainType = personalDomains.includes(domain)
    ? 'personal'
    : bulkSenderPatterns.test(from.split('@')[0] ?? '')
      ? 'bulk'
      : domain
        ? 'business'
        : 'unknown';

  const greetingPatterns = /^(hi|hello|hey|dear|good morning|good afternoon|greetings)\b/im;
  const salutationPatterns = /\b(regards|sincerely|best|thanks|thank you|cheers|warm regards)\b/im;
  const punctPattern = body.slice(0, 200).replace(/[^.!?,;:]/g, '').slice(0, 10);

  return {
    subjectWordCount: subjectWords.length,
    bodyWordCount: bodyWords.length,
    hasAttachment: (headers['content-type'] ?? '').includes('multipart/mixed'),
    senderDomainType,
    capsRatio: letterCount > 0 ? capsCount / letterCount : 0,
    hasUrls: urlMatches.length > 0,
    urlCount: urlMatches.length,
    punctuationPattern: punctPattern,
    hasGreeting: greetingPatterns.test(body),
    hasSalutation: salutationPatterns.test(body),
    listUnsubscribePresent: 'list-unsubscribe' in headers,
  };
}

// ─── BYOK (path: byok) ────────────────────────────────────────────────────────

const BYOK_MODELS: Record<string, string> = {
  claude: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
};

const BYOK_ENDPOINTS: Record<string, string> = {
  claude: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
};

const CLASSIFICATION_PROMPT = (subject: string, snippet: string, fromDomain: string) =>
`Classify this email into exactly one category. Respond with JSON only.

Email metadata:
- Subject: ${subject || '(no subject)'}
- From domain: ${fromDomain || 'unknown'}
- Preview: ${snippet || '(no preview)'}

Categories:
- ACTION_REQUIRED: needs a reply or action from you
- FYI: informational, no action needed
- NEWSLETTER: regular newsletter or digest
- PROMOTIONAL: marketing, sales, offers
- RECEIPT: purchase receipt or invoice
- SOCIAL: social network notification
- SPAM: unwanted or phishing

Respond with exactly: {"category":"CATEGORY","confidence":0.0,"signals":["reason1","reason2"]}`;

async function callByok(
  payload: ClassifyEmailPayload,
  settings: ExtensionSettings,
  apiKey: string
): Promise<ClassificationResult> {
  const start = performance.now();
  const provider = settings.byokProvider;
  const model = settings.byokModel || BYOK_MODELS[provider] || BYOK_MODELS.claude;
  const fromDomain = (payload.fromEmail ?? '').split('@')[1] ?? '';
  const prompt = CLASSIFICATION_PROMPT(
    payload.subject ?? '',
    payload.snippet ?? payload.bodyText?.slice(0, 200) ?? '',
    fromDomain
  );

  let responseText: string;

  if (provider === 'claude') {
    const res = await fetch(BYOK_ENDPOINTS.claude, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 128,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}`);
    const data = await res.json();
    responseText = data.content?.[0]?.text ?? '';

  } else if (provider === 'openai') {
    const res = await fetch(BYOK_ENDPOINTS.openai, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 128,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
    const data = await res.json();
    responseText = data.choices?.[0]?.message?.content ?? '';

  } else if (provider === 'gemini') {
    const endpoint = BYOK_ENDPOINTS.gemini.replace('{model}', model);
    const res = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 128, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    const data = await res.json();
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  } else {
    throw new Error(`Unknown BYOK provider: ${provider}`);
  }

  const parsed = JSON.parse(responseText.trim());
  return {
    category: parsed.category as EmailCategory,
    confidence: Number(parsed.confidence) || 0.95,
    path: 'byok',
    signals: parsed.signals,
    latencyMs: Math.round(performance.now() - start),
  };
}

// ─── Intelligence API (path: intelligence) ────────────────────────────────────
// Business tier only. Sends ONLY metadata features — never raw content.

async function callIntelligenceApi(
  payload: ClassifyEmailPayload,
  settings: ExtensionSettings
): Promise<ClassificationResult> {
  const start = performance.now();
  const features = extractMetadataFeatures(payload);
  const baseUrl = settings.upinboxInstanceUrl || 'https://upinbox.ai';

  const res = await fetch(`${baseUrl}/api/upinbox/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.upinboxSession ? { Authorization: `Bearer ${settings.upinboxSession}` } : {}),
    },
    body: JSON.stringify({ features }),
  });

  if (!res.ok) throw new Error(`Intelligence API ${res.status}`);
  const data = await res.json();

  return {
    category: data.category as EmailCategory,
    confidence: Number(data.confidence) || 0.95,
    path: 'intelligence',
    signals: data.signals,
    latencyMs: Math.round(performance.now() - start),
  };
}

// ─── UpLink / Ollama (path: uplink) ───────────────────────────────────────────

async function callUpLink(
  payload: ClassifyEmailPayload,
  settings: ExtensionSettings
): Promise<ClassificationResult> {
  const start = performance.now();
  const baseUrl = settings.uplinkUrl || 'http://localhost:11434';
  const model = settings.uplinkModel || 'phi4-mini';
  const fromDomain = (payload.fromEmail ?? '').split('@')[1] ?? '';
  const prompt = CLASSIFICATION_PROMPT(
    payload.subject ?? '',
    payload.snippet ?? payload.bodyText?.slice(0, 200) ?? '',
    fromDomain
  );

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
  });
  if (!res.ok) throw new Error(`UpLink/Ollama ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.response ?? '{}');

  return {
    category: parsed.category as EmailCategory,
    confidence: Number(parsed.confidence) || 0.9,
    path: 'uplink',
    signals: parsed.signals,
    latencyMs: Math.round(performance.now() - start),
  };
}

// ─── Main router ──────────────────────────────────────────────────────────────

export async function classifyEmailWithRouter(
  payload: ClassifyEmailPayload,
  settings: ExtensionSettings,
  byokApiKey?: string
): Promise<ClassificationResult> {
  // Step 1: Heuristic early-exit (zero network, zero cost)
  const heuristicResult = runHeuristic(payload);
  if (heuristicResult.confidence >= 0.8) {
    return heuristicResult;
  }

  // Step 2: UpLink (local Ollama, any tier, low latency)
  if (settings.uplinkEnabled) {
    try {
      return await callUpLink(payload, settings);
    } catch (err) {
      console.warn('[UpInbox] UpLink failed, falling back:', err);
    }
  }

  // Step 3: BYOK (plus and above)
  if (byokApiKey && settings.tier !== 'free') {
    try {
      return await callByok(payload, settings, byokApiKey);
    } catch (err) {
      console.warn('[UpInbox] BYOK failed, falling back:', err);
    }
  }

  // Step 4: Intelligence API (business tier)
  if (settings.intelligenceEnabled && settings.tier === 'business') {
    try {
      return await callIntelligenceApi(payload, settings);
    } catch (err) {
      console.warn('[UpInbox] Intelligence API failed, falling back:', err);
    }
  }

  // Final fallback: heuristic result (always succeeds)
  return heuristicResult;
}

// ─── UpLink health check ──────────────────────────────────────────────────────

export async function testUplinkConnection(
  url: string,
  model: string
): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const res = await fetch(`${url}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, model: data.modelinfo?.general?.name ?? model };
    }
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Connection failed' };
  }
}
