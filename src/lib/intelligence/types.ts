/**
 * Intelligence layer types for UpInbox.
 *
 * Three classification paths:
 *   A (SaaS): platform triage pipeline
 *   B (Self-host + license JWT): Intelligence API at api.upinbox.ai
 *   C (BYOK): user's Claude/GPT/Gemini key (browser-direct)
 *   D (Community): @upgpt-ai/email-classifier npm package (heuristic, 70%)
 *
 * See docs/ARCHITECTURE.md → Intelligence Router section.
 */

/** Email categories — match @upgpt-ai/email-classifier taxonomy */
export type EmailCategory =
  | 'ACTION_REQUIRED'
  | 'FYI'
  | 'NEWSLETTER'
  | 'PROMOTION'
  | 'RECEIPT'
  | 'EXPIRED'
  | 'SOCIAL'
  | 'AUTOMATED';

/** Result from any classifier path */
export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  signals: string[];
  classifierVersion: string;
  classifierPath: 'saas' | 'intelligence-api' | 'byok' | 'heuristic';
}

/** BYOK provider options */
export type ByokProvider = 'anthropic' | 'openai' | 'google';

/** BYOK configuration — stored browser-side only */
export interface ByokConfig {
  provider: ByokProvider;
  apiKey: string;       // sessionStorage only, NEVER sent to UpInbox servers
  model: string;
}

/** UpLink local AI configuration */
export interface UplinkConfig {
  endpoint: string;     // e.g. 'http://localhost:11434'
  model?: string;       // e.g. 'phi4-mini', defaults to server configured model
}

/** Intelligence API config for self-hosted instances with a license JWT */
export interface IntelligenceApiConfig {
  licenseJwt: string;
  endpoint?: string;    // defaults to 'https://api.upinbox.ai'
  instanceDomain: string;
}

/**
 * Metadata features sent to the Intelligence API.
 * IMPORTANT: Raw email content (subject text, body text, from/to addresses)
 * is NEVER sent. Only structural/statistical features.
 */
export interface EmailMetadataFeatures {
  subjectWordCount: number;
  bodyWordCount: number;
  hasAttachment: boolean;
  senderDomainType: 'free' | 'corporate' | 'bulk' | 'unknown';
  capsRatio: number;
  hasUrls: boolean;
  urlCount: number;
  punctuationPattern: string;  // e.g. 'high-exclamation', 'normal', 'question-heavy'
  hasGreeting: boolean;
  hasSalutation: boolean;
  listUnsubscribePresent: boolean;
}

/** Classifier tier for this UpInbox installation */
export type ClassifierTier =
  | 'community'     // Free — heuristic npm package (70% accuracy)
  | 'plus'          // Plus — BYOK (95% with user's API key)
  | 'business'      // Business — Intelligence API (95%, no user API key needed)
  | 'enterprise';   // Enterprise — same as business + SLA

/**
 * Input to the classifier router.
 * The router picks the best available path based on user's config.
 */
export interface ClassifyEmailInput {
  /** Supabase account ID (for caching results) */
  accountId: string;
  /** Email ID in provider format */
  emailId: string;
  /** For heuristic classifier — must be present */
  subject?: string;
  /** For heuristic classifier */
  fromEmail?: string;
  /** For heuristic classifier */
  headers?: Record<string, string>;
  /** For heuristic classifier (plain text excerpt, max ~500 chars) */
  bodyText?: string;
  /** For BYOK/AI classifier — same plain text excerpt */
  bodyExcerpt?: string;
}
