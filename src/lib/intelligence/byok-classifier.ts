/**
 * BYOK Classifier — calls the user's own AI API key to classify email.
 *
 * PRIVACY MODEL:
 * - The API key is passed in from the browser (sessionStorage) via the request body
 * - UpInbox never stores the key — it flows through the route handler directly to the AI provider
 * - The email subject + body excerpt ARE sent to the AI provider — that's the user's choice
 * - The user's AI provider bills the user directly
 *
 * Supported providers:
 *   - Anthropic Claude (claude-haiku-4-5 default — fastest/cheapest for classification)
 *   - OpenAI GPT (gpt-4o-mini default)
 *   - Google Gemini (gemini-1.5-flash default)
 *
 * Also supports UpLink (local Ollama) — same API shape, different endpoint.
 */

import type { ClassificationResult, ByokProvider } from './types';
import type { EmailCategory } from './types';

const CLASSIFICATION_PROMPT = (subject: string, bodyExcerpt: string) => `You are an email classifier. Classify the following email into exactly one category.

Categories:
- ACTION_REQUIRED: Needs a response or action from me (meetings, requests, questions, approvals)
- FYI: Information only, no action needed (updates, notifications, confirmations I should know about)
- NEWSLETTER: Regular publication, digest, or curated content I subscribed to
- PROMOTION: Marketing, offers, deals, sales, discounts
- RECEIPT: Order confirmations, invoices, payment receipts, shipping notifications
- EXPIRED: Old thread responses, automatic replies, bounce messages, out-of-office
- SOCIAL: Social media notifications, LinkedIn, GitHub, Slack digests
- AUTOMATED: System notifications, monitoring alerts, cron reports, CI/CD results

Email subject: ${subject}

Email excerpt:
${bodyExcerpt}

Reply with ONLY a JSON object in this format (no other text):
{"category": "CATEGORY_NAME", "confidence": 0.0-1.0, "reasoning": "one sentence"}`;

const VALID_CATEGORIES = new Set<EmailCategory>([
  'ACTION_REQUIRED', 'FYI', 'NEWSLETTER', 'PROMOTION',
  'RECEIPT', 'EXPIRED', 'SOCIAL', 'AUTOMATED',
]);

function parseClassificationResponse(text: string): { category: EmailCategory; confidence: number } {
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[^}]+\}/s);
  if (!jsonMatch) throw new Error('No JSON in classification response');

  const parsed = JSON.parse(jsonMatch[0]);
  const category = parsed.category as string;

  if (!VALID_CATEGORIES.has(category as EmailCategory)) {
    throw new Error(`Invalid category: ${category}`);
  }

  return {
    category: category as EmailCategory,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
  };
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function classifyWithAnthropic(
  apiKey: string,
  model: string,
  subject: string,
  bodyExcerpt: string
): Promise<{ category: EmailCategory; confidence: number }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      messages: [{ role: 'user', content: CLASSIFICATION_PROMPT(subject, bodyExcerpt) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';
  return parseClassificationResponse(text);
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function classifyWithOpenAI(
  apiKey: string,
  model: string,
  subject: string,
  bodyExcerpt: string
): Promise<{ category: EmailCategory; confidence: number }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 64,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: CLASSIFICATION_PROMPT(subject, bodyExcerpt) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseClassificationResponse(text);
}

// ─── Google Gemini ────────────────────────────────────────────────────────────

async function classifyWithGoogle(
  apiKey: string,
  model: string,
  subject: string,
  bodyExcerpt: string
): Promise<{ category: EmailCategory; confidence: number }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: CLASSIFICATION_PROMPT(subject, bodyExcerpt) }] }],
        generationConfig: { maxOutputTokens: 64 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google AI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseClassificationResponse(text);
}

// ─── UpLink (local Ollama) ────────────────────────────────────────────────────

async function classifyWithUpLink(
  endpoint: string,
  model: string,
  subject: string,
  bodyExcerpt: string
): Promise<{ category: EmailCategory; confidence: number }> {
  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: CLASSIFICATION_PROMPT(subject, bodyExcerpt),
      stream: false,
      format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(`UpLink error: ${response.status}`);
  }

  const data = await response.json();
  return parseClassificationResponse(data.response ?? '');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const DEFAULT_MODELS: Record<ByokProvider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  google: 'gemini-1.5-flash',
};

export interface ByokClassifyOptions {
  provider: ByokProvider | 'uplink';
  apiKey?: string;            // required for anthropic/openai/google
  uplinkEndpoint?: string;    // required for uplink
  model?: string;
  subject: string;
  bodyExcerpt: string;
}

/**
 * Classify an email using the user's BYOK provider.
 *
 * NOTE: This runs server-side (in an API route handler) with the API key
 * passed through from the client request. The key is NOT stored.
 */
export async function classifyWithByok(
  opts: ByokClassifyOptions
): Promise<ClassificationResult> {
  const { provider, apiKey, uplinkEndpoint, model, subject, bodyExcerpt } = opts;

  // Truncate body to avoid excessive token usage
  const truncatedBody = bodyExcerpt.slice(0, 800);

  let result: { category: EmailCategory; confidence: number };

  switch (provider) {
    case 'anthropic': {
      if (!apiKey) throw new Error('apiKey required for anthropic provider');
      const resolvedModel = model ?? DEFAULT_MODELS.anthropic;
      result = await classifyWithAnthropic(apiKey, resolvedModel, subject, truncatedBody);
      break;
    }
    case 'openai': {
      if (!apiKey) throw new Error('apiKey required for openai provider');
      const resolvedModel = model ?? DEFAULT_MODELS.openai;
      result = await classifyWithOpenAI(apiKey, resolvedModel, subject, truncatedBody);
      break;
    }
    case 'google': {
      if (!apiKey) throw new Error('apiKey required for google provider');
      const resolvedModel = model ?? DEFAULT_MODELS.google;
      result = await classifyWithGoogle(apiKey, resolvedModel, subject, truncatedBody);
      break;
    }
    case 'uplink': {
      const endpoint = uplinkEndpoint ?? 'http://localhost:11434';
      const uplinkModel = model ?? 'phi4-mini';
      result = await classifyWithUpLink(endpoint, uplinkModel, subject, truncatedBody);
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }

  return {
    ...result,
    signals: [`byok:${provider}`, `model:${model ?? 'default'}`],
    classifierVersion: 'byok-1.0',
    classifierPath: 'byok',
  };
}
