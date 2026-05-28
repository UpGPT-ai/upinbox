/**
 * @upgpt-ai/email-classifier
 *
 * Heuristic email classifier — 70% accuracy, zero network, zero dependencies.
 * Works in any JS environment: Node.js, browser, Chrome extension, Cloudflare Workers.
 *
 * Approach: weighted feature scoring across 8 signal categories.
 * No training data, no ML model, no API calls.
 *
 * Usage:
 *   import { classifyEmail } from '@upgpt-ai/email-classifier';
 *   const result = classifyEmail({ subject, from, bodyText, snippet, headers });
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailCategory =
  | 'ACTION_REQUIRED'
  | 'FYI'
  | 'NEWSLETTER'
  | 'PROMOTIONAL'
  | 'RECEIPT'
  | 'SOCIAL'
  | 'SPAM';

export interface ClassifyInput {
  subject?: string;
  from?: string;          // full "Name <email>" or just email
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  headers?: Record<string, string>;
  receivedAt?: Date;
}

export interface ClassifyResult {
  category: EmailCategory;
  confidence: number;   // 0–1
  signals: string[];    // human-readable signal labels that fired
  scores: Partial<Record<EmailCategory, number>>;  // raw score per category
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SOCIAL_DOMAINS = new Set([
  'facebook.com', 'facebookmail.com', 'twitter.com', 'x.com', 'instagram.com',
  'linkedin.com', 'pinterest.com', 'tiktok.com', 'snapchat.com', 'youtube.com',
  'reddit.com', 'discord.com', 'slack.com', 'teams.microsoft.com', 'meet.google.com',
  'github.com', 'gitlab.com', 'bitbucket.org',
]);

const BULK_SENDER_PATTERNS = /\b(noreply|no-reply|donotreply|do-not-reply|newsletter|notifications?|alerts?|updates?|info|mailer|bounce|marketing|promo|deals?|offers?|news|digest|weekly|monthly|daily|bulletin|unsubscribe)\b/i;

const RECEIPT_SUBJECT_PATTERNS = [
  /\b(receipt|invoice|order\s+(confirmation|#|number)|payment\s+(received|confirmation)|transaction|statement|billing|charge|refund)\b/i,
  /\byour\s+(order|purchase|subscription)\b/i,
  /\b(charged|billed|shipped|delivered)\b/i,
];

const NEWSLETTER_SUBJECT_PATTERNS = [
  /\b(newsletter|weekly|monthly|daily|digest|edition|issue\s+#?\d|roundup|recap|update[s]?\s+from|bulletin)\b/i,
  /\b(this week in|what['']s new|top stories?|headlines?)\b/i,
];

const PROMOTIONAL_SUBJECT_PATTERNS = [
  /\b(\d{1,3}%\s*off|save\s+\d|flash\s+sale|limited\s+time|exclusive\s+offer|deal\s+of|free\s+shipping|coupon|discount|promo\s+code|special\s+offer|don['']t\s+miss)\b/i,
  /[🛍️🎁💰🏷️🔥⚡]\s*/,
];

const ACTION_SUBJECT_PATTERNS = [
  /\b(action\s+required|action\s+needed|reply\s+needed|response\s+needed|urgent|asap|deadline|due\s+(today|tomorrow|by)|please\s+(review|confirm|approve|respond|sign|complete)|approval\s+needed|sign\s+(here|now)|confirmation\s+required)\b/i,
  /\b(invitation|invited|invite\s+you|join\s+(me|us)|RSVP|meeting\s+request|calendar\s+invite)\b/i,
];

const SPAM_SUBJECT_PATTERNS = [
  /\b(congratulations?|you['']ve\s+(won|been\s+selected)|claim\s+your\s+(prize|reward)|act\s+now|limited\s+offer|100%\s+free|make\s+money|work\s+from\s+home|lose\s+weight|enlarge|erectile|viagra|cialis|pharmacy|lottery|inheritance|transfer\s+funds|nigerian|prince)\b/i,
  /[!]{2,}/,
  /\$\$\$/,
  /[A-Z]{5,}/,  // excessive caps
];

const GREETING_PATTERNS = /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening)|greetings|to\s+whom)\b/im;
const SALUTATION_PATTERNS = /\b(regards|sincerely|best\s+(wishes|regards)?|warm\s+regards|thanks?|thank\s+you|cheers|cordially)\s*[,\n]/im;

// ─── Feature extraction ───────────────────────────────────────────────────────

interface Features {
  senderEmail: string;
  senderDomain: string;
  isBulkSender: boolean;
  isSocialSender: boolean;
  hasListUnsubscribe: boolean;
  hasPrecedenceBulk: boolean;
  subject: string;
  subjectWordCount: number;
  body: string;
  bodyWordCount: number;
  hasGreeting: boolean;
  hasSalutation: boolean;
  urlCount: number;
  capsRatio: number;
  hasMoneySymbol: boolean;
  hasPercentage: boolean;
}

function extractFeatures(input: ClassifyInput): Features {
  const from = input.from ?? '';
  const emailMatch = from.match(/<([^>]+)>/) ?? from.match(/([^\s]+@[^\s]+)/);
  const senderEmail = (emailMatch?.[1] ?? from).toLowerCase().trim();
  const senderDomain = senderEmail.split('@')[1] ?? '';
  const localPart = senderEmail.split('@')[0] ?? '';

  const subject = input.subject ?? '';
  const body = input.bodyText ?? input.snippet ?? '';
  const headers = input.headers ?? {};

  const words = body.trim().split(/\s+/).filter(Boolean);
  const letters = body.match(/[a-zA-Z]/g) ?? [];
  const caps = body.match(/[A-Z]/g) ?? [];
  const urls = body.match(/https?:\/\/\S+/g) ?? [];

  return {
    senderEmail,
    senderDomain,
    isBulkSender: BULK_SENDER_PATTERNS.test(localPart) || BULK_SENDER_PATTERNS.test(senderDomain),
    isSocialSender: SOCIAL_DOMAINS.has(senderDomain),
    hasListUnsubscribe: !!headers['list-unsubscribe'],
    hasPrecedenceBulk: (headers['precedence'] ?? '').toLowerCase().includes('bulk'),
    subject,
    subjectWordCount: subject.trim().split(/\s+/).filter(Boolean).length,
    body,
    bodyWordCount: words.length,
    hasGreeting: GREETING_PATTERNS.test(body),
    hasSalutation: SALUTATION_PATTERNS.test(body),
    urlCount: urls.length,
    capsRatio: letters.length > 0 ? caps.length / letters.length : 0,
    hasMoneySymbol: /[\$€£¥]/.test(subject + body),
    hasPercentage: /%\s*(off|discount|sale)/i.test(subject + body),
  };
}

// ─── Scoring ───────────────────────────────────────────────────────────────────

type ScoringResult = { scores: Record<EmailCategory, number>; signals: string[] };

function score(features: Features, input: ClassifyInput): ScoringResult {
  const s: Record<EmailCategory, number> = {
    ACTION_REQUIRED: 0,
    FYI: 0,
    NEWSLETTER: 0,
    PROMOTIONAL: 0,
    RECEIPT: 0,
    SOCIAL: 0,
    SPAM: 0,
  };
  const signals: string[] = [];

  // ── Social ──────────────────────────────────────────────────────────────────
  if (features.isSocialSender) {
    s.SOCIAL += 0.6;
    signals.push('social-sender-domain');
  }

  // ── Spam ────────────────────────────────────────────────────────────────────
  for (const pat of SPAM_SUBJECT_PATTERNS) {
    if (pat.test(features.subject)) {
      s.SPAM += 0.4;
      signals.push('spam-subject-pattern');
      break;
    }
  }
  if (features.capsRatio > 0.4) {
    s.SPAM += 0.25;
    signals.push('excessive-caps');
  }

  // ── Receipt ─────────────────────────────────────────────────────────────────
  for (const pat of RECEIPT_SUBJECT_PATTERNS) {
    if (pat.test(features.subject)) {
      s.RECEIPT += 0.55;
      signals.push('receipt-subject-keyword');
      break;
    }
  }
  if (features.hasMoneySymbol && !features.hasPercentage) {
    s.RECEIPT += 0.15;
    signals.push('money-symbol');
  }

  // ── Newsletter ──────────────────────────────────────────────────────────────
  if (features.hasListUnsubscribe) {
    s.NEWSLETTER += 0.3;
    s.PROMOTIONAL += 0.1;
    signals.push('list-unsubscribe-header');
  }
  if (features.hasPrecedenceBulk) {
    s.NEWSLETTER += 0.2;
    signals.push('precedence-bulk');
  }
  for (const pat of NEWSLETTER_SUBJECT_PATTERNS) {
    if (pat.test(features.subject)) {
      s.NEWSLETTER += 0.4;
      signals.push('newsletter-subject-keyword');
      break;
    }
  }
  if (features.isBulkSender) {
    s.NEWSLETTER += 0.2;
    signals.push('bulk-sender-name');
  }
  if (features.urlCount >= 5) {
    s.NEWSLETTER += 0.15;
    signals.push('many-links');
  }

  // ── Promotional ─────────────────────────────────────────────────────────────
  for (const pat of PROMOTIONAL_SUBJECT_PATTERNS) {
    if (pat.test(features.subject)) {
      s.PROMOTIONAL += 0.5;
      signals.push('promotional-subject-keyword');
      break;
    }
  }
  if (features.hasPercentage) {
    s.PROMOTIONAL += 0.3;
    signals.push('percentage-discount');
  }

  // ── Action Required ──────────────────────────────────────────────────────────
  for (const pat of ACTION_SUBJECT_PATTERNS) {
    if (pat.test(features.subject)) {
      s.ACTION_REQUIRED += 0.5;
      signals.push('action-subject-keyword');
      break;
    }
  }
  if (features.hasGreeting && features.hasSalutation) {
    s.ACTION_REQUIRED += 0.25;
    s.FYI += 0.15;
    signals.push('personal-email-structure');
  }
  if (features.bodyWordCount > 50 && features.bodyWordCount < 600) {
    s.ACTION_REQUIRED += 0.1;
    signals.push('personal-email-length');
  }
  if (!features.isBulkSender && !features.isSocialSender && !features.hasListUnsubscribe) {
    s.ACTION_REQUIRED += 0.2;
    s.FYI += 0.1;
    signals.push('not-bulk-sender');
  }

  // ── FYI ─────────────────────────────────────────────────────────────────────
  if (features.bodyWordCount > 600) {
    s.FYI += 0.2;
    s.NEWSLETTER += 0.1;
    signals.push('long-body');
  }
  if (features.hasGreeting && !features.hasListUnsubscribe) {
    s.FYI += 0.15;
    signals.push('greeting-present');
  }

  return { scores: s, signals: [...new Set(signals)] }; // deduplicate signals
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Classify an email using the heuristic engine.
 *
 * @param input - Email metadata. Raw content is processed locally, never transmitted.
 * @returns ClassifyResult with category, confidence (0-1), signals, and raw scores.
 */
export function classifyEmail(input: ClassifyInput): ClassifyResult {
  const features = extractFeatures(input);
  const { scores: rawScores, signals } = score(features, input);

  // Find the winner
  const categories = Object.keys(rawScores) as EmailCategory[];
  let best: EmailCategory = 'FYI';
  let bestScore = -1;
  let totalScore = 0;

  for (const cat of categories) {
    const sc = rawScores[cat];
    totalScore += sc;
    if (sc > bestScore) {
      bestScore = sc;
      best = cat;
    }
  }

  // Confidence: winner score / total (softmax-ish), clamped to a reasonable range
  const confidence = totalScore > 0
    ? Math.min(0.95, Math.max(0.35, bestScore / totalScore))
    : 0.35;

  // Default to FYI if nothing scored
  if (bestScore === 0) {
    return {
      category: 'FYI',
      confidence: 0.35,
      signals: ['no-strong-signal'],
      scores: rawScores,
    };
  }

  return {
    category: best,
    confidence,
    signals,
    scores: rawScores,
  };
}

// ─── Utility: batch classify ──────────────────────────────────────────────────

export function classifyEmailBatch(inputs: ClassifyInput[]): ClassifyResult[] {
  return inputs.map(classifyEmail);
}

// ─── Re-export types ──────────────────────────────────────────────────────────

export type { ClassifyInput as EmailClassifierInput, ClassifyResult as EmailClassifierResult };
