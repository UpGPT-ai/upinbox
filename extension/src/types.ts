/**
 * UpInbox Chrome Extension — shared type definitions
 */

// ─── Tier ────────────────────────────────────────────────────────────────────

/**
 * The user's UpInbox tier. Controls which classification paths are available.
 *
 * Migration from old tier names:
 *   Old "basic"    → "free"
 *   Old "personal" → "plus"
 *   Old "pro"      → "plus"
 *   Old "team"     → "business"
 */
export type UpInboxTier = 'free' | 'plus' | 'business';

export function normalizeTier(raw: string): UpInboxTier {
  switch (raw.toLowerCase().trim()) {
    case 'business':
    case 'team':
    case 'enterprise':
      return 'business';
    case 'plus':
    case 'pro':
    case 'personal':
      return 'plus';
    default:
      return 'free';
  }
}

// ─── Classification paths ─────────────────────────────────────────────────────

/**
 * Which classifier ran for this result.
 *
 * Priority order (from router.ts):
 *  1. uplink     — local Ollama via UpLink daemon (any tier with UpLink installed)
 *  2. byok       — BYOK AI (Claude / GPT / Gemini) — plus and above
 *  3. intelligence — Intelligence API (hosted, privacy-safe metadata only) — business tier
 *  4. heuristic  — @upgpt/email-classifier npm package (70% accuracy, always available)
 */
export type ClassifierPath = 'heuristic' | 'byok' | 'intelligence' | 'uplink';

export type EmailCategory =
  | 'ACTION_REQUIRED'
  | 'FYI'
  | 'NEWSLETTER'
  | 'PROMOTIONAL'
  | 'RECEIPT'
  | 'SOCIAL'
  | 'SPAM';

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;  // 0–1
  path: ClassifierPath;
  signals?: string[];  // human-readable reasoning tokens
  latencyMs?: number;
}

// ─── BYOK config ─────────────────────────────────────────────────────────────

export type ByokProvider = 'claude' | 'openai' | 'gemini' | 'uplink';

export interface ByokConfig {
  provider: ByokProvider;
  apiKey: string;       // stored in sessionStorage, NEVER in chrome.storage
  model?: string;
}

// ─── Extension settings ───────────────────────────────────────────────────────

/**
 * Persisted extension settings (chrome.storage.sync).
 *
 * SECURITY NOTES:
 * - apiKey is NEVER stored here. It stays in sessionStorage (popup context) only.
 * - upinboxSession (JWT) is stored as sync so the user stays logged in across
 *   browser restarts but is scoped to the extension's storage namespace.
 */
export interface ExtensionSettings {
  tier: UpInboxTier;
  byokProvider: ByokProvider;
  byokModel: string;
  uplinkEnabled: boolean;
  uplinkUrl: string;            // default: http://localhost:11434
  uplinkModel: string;          // default: phi4-mini
  intelligenceEnabled: boolean; // business tier only
  upinboxInstanceUrl: string;   // default: https://upinbox.ai
  upinboxSession?: string;      // session JWT for Intelligence API auth
  autoClassify: boolean;
  showBadge: boolean;
  badgeCountCategory: EmailCategory | 'ACTION_REQUIRED';
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  tier: 'free',
  byokProvider: 'claude',
  byokModel: 'claude-haiku-4-5-20251001',
  uplinkEnabled: false,
  uplinkUrl: 'http://localhost:11434',
  uplinkModel: 'phi4-mini',
  intelligenceEnabled: false,
  upinboxInstanceUrl: 'https://upinbox.ai',
  autoClassify: true,
  showBadge: true,
  badgeCountCategory: 'ACTION_REQUIRED',
};

// ─── Messages (background ↔ content ↔ popup) ─────────────────────────────────

export type ExtensionMessage =
  | { type: 'CLASSIFY_EMAIL'; payload: ClassifyEmailPayload }
  | { type: 'CLASSIFICATION_RESULT'; payload: ClassificationResult }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<ExtensionSettings> }
  | { type: 'SET_BYOK_KEY'; payload: { apiKey: string } }
  | { type: 'TEST_UPLINK' }
  | { type: 'TEST_UPLINK_RESULT'; payload: { ok: boolean; model?: string; error?: string } };

export interface ClassifyEmailPayload {
  subject?: string;
  fromEmail?: string;
  fromName?: string;
  bodyText?: string;
  bodyHtml?: string;
  headers?: Record<string, string>;
  snippet?: string;
  /** Session-only BYOK key (not persisted). Passed from popup → background. */
  byokApiKey?: string;
}
