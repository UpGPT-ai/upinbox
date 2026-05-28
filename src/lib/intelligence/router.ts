/**
 * Intelligence Router — selects the best available classifier path.
 *
 * Priority order:
 *   1. BYOK (user's API key) — if confidence from heuristic < 0.8
 *   2. UpLink — local Ollama, if enabled
 *   3. Intelligence API — if license JWT present (self-hosted Business/Enterprise)
 *   4. @upgpt-ai/email-classifier — heuristic npm package (always available, 70% accuracy)
 *
 * For the SaaS platform, classification happens in the platform triage pipeline
 * (not here) — this router is for self-hosted instances and the Chrome extension.
 */

import { classifyEmail } from '@upgpt-ai/email-classifier';
import { classifyWithByok } from './byok-classifier';
import { extractMetadataFeatures } from './metadata-features';
import type {
  ClassificationResult,
  ClassifyEmailInput,
  ByokConfig,
  UplinkConfig,
  IntelligenceApiConfig,
} from './types';

export interface RouterConfig {
  byok?: ByokConfig;
  uplink?: UplinkConfig;
  intelligenceApi?: IntelligenceApiConfig;
}

/**
 * Classify an email using the best available method.
 *
 * Falls back gracefully: BYOK → Intelligence API → heuristic.
 * Never throws — always returns a result (may have low confidence).
 */
export async function classifyEmailWithRouter(
  input: ClassifyEmailInput,
  config: RouterConfig
): Promise<ClassificationResult> {
  // Step 1: Always run heuristic first (zero cost, zero latency)
  const heuristicResult = classifyEmail({
    subject: input.subject,
    from: input.fromEmail,
    headers: input.headers,
    bodyText: input.bodyText,
  });

  const heuristicClassification: ClassificationResult = {
    category: heuristicResult.category as ClassificationResult['category'],
    confidence: heuristicResult.confidence,
    signals: heuristicResult.signals ?? [],
    classifierVersion: `email-classifier@${getPackageVersion()}`,
    classifierPath: 'heuristic',
  };

  // Step 2: If heuristic confidence is high (≥ 0.8), return it — no AI needed
  if (heuristicResult.confidence >= 0.8) {
    return heuristicClassification;
  }

  // Step 3: Try UpLink (local, highest privacy)
  if (config.uplink && input.subject !== undefined) {
    try {
      return await classifyWithByok({
        provider: 'uplink',
        uplinkEndpoint: config.uplink.endpoint,
        model: config.uplink.model,
        subject: input.subject ?? '',
        bodyExcerpt: input.bodyExcerpt ?? input.bodyText ?? '',
      });
    } catch {
      // UpLink unavailable — fall through
    }
  }

  // Step 4: Try BYOK (user's cloud AI key)
  if (config.byok && input.subject !== undefined) {
    try {
      return await classifyWithByok({
        provider: config.byok.provider,
        apiKey: config.byok.apiKey,
        model: config.byok.model,
        subject: input.subject ?? '',
        bodyExcerpt: input.bodyExcerpt ?? input.bodyText ?? '',
      });
    } catch {
      // BYOK failed — fall through to Intelligence API or heuristic
    }
  }

  // Step 5: Try Intelligence API (self-hosted with license)
  if (config.intelligenceApi) {
    try {
      const apiResult = await classifyWithIntelligenceApi(input, config.intelligenceApi);
      if (apiResult) return apiResult;
    } catch {
      // Intelligence API unavailable — fall through
    }
  }

  // Step 6: Return heuristic result as final fallback
  return heuristicClassification;
}

/**
 * Call the UpInbox Intelligence API.
 *
 * Sends ONLY metadata features — never raw email content.
 * The license JWT is domain-bound and validated server-side.
 */
async function classifyWithIntelligenceApi(
  input: ClassifyEmailInput,
  config: IntelligenceApiConfig
): Promise<ClassificationResult | null> {
  const features = extractMetadataFeatures({
    subject: input.subject,
    fromEmail: input.fromEmail,
    bodyText: input.bodyText,
    headers: input.headers,
  });

  const endpoint = config.endpoint ?? 'https://api.upinbox.ai';

  const response = await fetch(`${endpoint}/v1/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.licenseJwt}`,
      'X-Instance-Domain': config.instanceDomain,
    },
    body: JSON.stringify({
      emailId: input.emailId,
      features,
    }),
    signal: AbortSignal.timeout(5000), // 5s timeout
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Intelligence API: license invalid or expired (${response.status})`);
    }
    return null;
  }

  const data = await response.json();
  return {
    category: data.category,
    confidence: data.confidence,
    signals: data.signals ?? ['intelligence-api'],
    classifierVersion: data.modelVersion ?? 'intelligence-api-1.0',
    classifierPath: 'intelligence-api',
  };
}

function getPackageVersion(): string {
  try {
    // Will be replaced with actual version at build time
    return '0.1.0';
  } catch {
    return 'unknown';
  }
}
