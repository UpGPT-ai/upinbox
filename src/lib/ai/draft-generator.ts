/**
 * draft-generator.ts
 * Server-side module for generating AI email drafts via BYOK.
 * Supports Anthropic, OpenAI, and Google Generative Language APIs.
 * Never throws — all errors produce a safe fallback DraftResult.
 */

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface DraftRequest {
  threadSubject: string;
  latestMessageFrom: string;
  latestMessageBody: string;
  tone: string;
  userProfile?: object;
  byokKey?: string;
  byokProvider?: string;
  byokModel?: string;
}

export interface DraftResult {
  body: string;
  bodyHtml: string;
  provider: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Wrap plain-text paragraphs in <p> tags for basic HTML rendering. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Fallback result when no BYOK key is configured. */
function notConfiguredResult(): DraftResult {
  const body =
    "AI draft generation is not configured. Please add your BYOK API key in Settings to enable this feature.";
  return {
    body,
    bodyHtml: textToHtml(body),
    provider: "none",
  };
}

/** Fallback result on error. */
function errorResult(err: unknown): DraftResult {
  const message =
    err instanceof Error ? err.message : "Unknown error during draft generation.";
  const body = `Draft generation failed: ${message}\n\nPlease try again or check your API key configuration.`;
  return {
    body,
    bodyHtml: textToHtml(body),
    provider: "error",
  };
}

/** Build the prompt text shared across all providers. */
function buildDraftPrompt(req: DraftRequest): string {
  const profileNote =
    req.userProfile && Object.keys(req.userProfile).length > 0
      ? `\n\nUser context: ${JSON.stringify(req.userProfile)}`
      : "";

  return (
    `You are composing a professional email reply. Write ONLY the email body — no subject line, no salutation unless appropriate, no commentary.\n` +
    `\nThread subject: ${req.threadSubject}` +
    `\nOriginal sender: ${req.latestMessageFrom}` +
    `\nLatest message:\n${req.latestMessageBody}` +
    `\nTone: ${req.tone}` +
    profileNote +
    `\n\nWrite the reply now:`
  );
}

/** Build the summarization prompt. */
function buildSummarizePrompt(threadText: string): string {
  return (
    `Summarize the following email thread concisely in 3-5 sentences. Focus on key decisions, action items, and context.\n\n` +
    `Thread:\n${threadText}\n\nSummary:`
  );
}

// ---------------------------------------------------------------------------
// Provider: Anthropic
// ---------------------------------------------------------------------------

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic API error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Anthropic returned no text content.");
  return textBlock.text.trim();
}

// ---------------------------------------------------------------------------
// Provider: OpenAI
// ---------------------------------------------------------------------------

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI API error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned no content.");
  return text.trim();
}

// ---------------------------------------------------------------------------
// Provider: Google Generative Language
// ---------------------------------------------------------------------------

async function callGoogle(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Google AI API error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Google AI returned no content.");
  return text.trim();
}

// ---------------------------------------------------------------------------
// Provider dispatcher
// ---------------------------------------------------------------------------

type Provider = "anthropic" | "openai" | "google";

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-1.5-flash",
};

async function callProvider(
  prompt: string,
  apiKey: string,
  provider: Provider,
  model?: string
): Promise<{ text: string; provider: string }> {
  const resolvedModel = model || DEFAULT_MODELS[provider];

  switch (provider) {
    case "anthropic":
      return {
        text: await callAnthropic(prompt, apiKey, resolvedModel),
        provider: `anthropic/${resolvedModel}`,
      };
    case "openai":
      return {
        text: await callOpenAI(prompt, apiKey, resolvedModel),
        provider: `openai/${resolvedModel}`,
      };
    case "google":
      return {
        text: await callGoogle(prompt, apiKey, resolvedModel),
        provider: `google/${resolvedModel}`,
      };
    default:
      throw new Error(`Unsupported BYOK provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * Generate an AI email draft based on the thread context and user tone.
 * Returns a safe fallback DraftResult if no key is configured or on any error.
 */
export async function generateDraft(req: DraftRequest): Promise<DraftResult> {
  if (!req.byokKey || !req.byokProvider) {
    return notConfiguredResult();
  }

  try {
    const provider = req.byokProvider.toLowerCase() as Provider;
    const prompt = buildDraftPrompt(req);

    const { text, provider: providerLabel } = await callProvider(
      prompt,
      req.byokKey,
      provider,
      req.byokModel
    );

    return {
      body: text,
      bodyHtml: textToHtml(text),
      provider: providerLabel,
    };
  } catch (err) {
    return errorResult(err);
  }
}

/**
 * Summarize an email thread as plain text.
 * Returns a safe fallback string if no key is configured or on any error.
 */
export async function summarizeThread(
  threadText: string,
  byokKey?: string,
  byokProvider?: string,
  byokModel?: string
): Promise<string> {
  if (!byokKey || !byokProvider) {
    return "Thread summary unavailable — AI not configured. Add your BYOK API key in Settings.";
  }

  try {
    const provider = byokProvider.toLowerCase() as Provider;
    const prompt = buildSummarizePrompt(threadText);

    const { text } = await callProvider(prompt, byokKey, provider, byokModel);
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return `Thread summary failed: ${message}`;
  }
}
