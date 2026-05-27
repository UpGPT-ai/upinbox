/**
 * Core mail types — provider-agnostic.
 *
 * These types are shared across all mail providers (JMAP, IMAP, Exchange, Gmail).
 * The MailProvider interface normalizes everything to these types regardless of
 * the underlying protocol.
 */

// ─── Provider Types ────────────────────────────────────────────────────────────

export type ProviderType = 'jmap' | 'imap' | 'exchange' | 'gmail';

export interface UpInboxAccount {
  id: string;
  org_id: string;
  user_id: string;
  /** Which mail protocol this account uses */
  provider_type: ProviderType;
  /** AES-256-GCM encrypted JSON blob of ProviderCredentials */
  credentials_enc: string;
  email_address: string;
  display_name: string;
  is_primary: boolean;
  /** Health status — updated by background health monitor */
  health_status: 'ok' | 'error' | 'unknown';
  health_error?: string;
  health_checked_at?: string;
  created_at: string;
  updated_at: string;
}

// ─── Provider Credentials (stored encrypted, never transmitted) ────────────────

export interface JmapCredentials {
  type: 'jmap';
  sessionUrl: string;   // e.g. https://jmap.fastmail.com/.well-known/jmap
  token: string;        // Bearer token
}

export interface ImapCredentials {
  type: 'imap';
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  username: string;
  password: string;     // App password for Gmail; regular password for others
}

export interface OAuthImapCredentials {
  type: 'oauth_imap';
  provider: 'gmail' | 'outlook';
  accessToken: string;
  refreshToken: string;
  expiresAt: string;    // ISO timestamp
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export type ProviderCredentials = JmapCredentials | ImapCredentials | OAuthImapCredentials;

// ─── JMAP Core Types ──────────────────────────────────────────────────────────
// Note: even IMAP-backed accounts use these types after normalization.

export interface JmapMailbox {
  id: string;
  name: string;
  /** Normalized role: inbox | sent | drafts | trash | spam | archive | null */
  role: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | null;
  totalEmails: number;
  unreadEmails: number;
  parentId: string | null;
  sortOrder: number;
  isSubscribed: boolean;
}

export interface JmapEmailAddress {
  name?: string;
  email: string;
}

export interface JmapBodyPart {
  partId: string;
  blobId?: string;
  size: number;
  type: string;        // MIME type
  charset?: string;
  disposition?: 'inline' | 'attachment';
  name?: string;       // filename for attachments
}

export interface JmapEmail {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;  // e.g. { '$seen': true, '$flagged': false }
  size: number;
  receivedAt: string;   // ISO timestamp
  messageId?: string[];
  inReplyTo?: string[];
  subject?: string;
  from?: JmapEmailAddress[];
  to?: JmapEmailAddress[];
  cc?: JmapEmailAddress[];
  bcc?: JmapEmailAddress[];
  replyTo?: JmapEmailAddress[];
  bodyValues: Record<string, { value: string; isTruncated?: boolean }>;
  textBody: JmapBodyPart[];
  htmlBody: JmapBodyPart[];
  attachments: JmapBodyPart[];
  hasAttachment: boolean;
  preview?: string;     // short plaintext preview (256 chars)
}

export interface JmapThread {
  id: string;
  emailIds: string[];
}

export interface JmapIdentity {
  id: string;
  name: string;
  email: string;
  replyTo?: JmapEmailAddress[];
  bcc?: JmapEmailAddress[];
  textSignature?: string;
  htmlSignature?: string;
  mayDelete: boolean;
}

export interface JmapEmailSubmission {
  identityId: string;
  emailId: string;
  envelope?: {
    mailFrom: { email: string };
    rcptTo: Array<{ email: string }>;
  };
  sendAt?: string;     // ISO timestamp — for scheduled send
}

// ─── Triage / Classification Types ────────────────────────────────────────────

/**
 * Email triage result — produced by any of the 4 intelligence paths:
 * 1. @upgpt/email-classifier (npm package, 70% accuracy, free)
 * 2. BYOK AI (user's own Claude/GPT/Gemini key)
 * 3. UpLink local AI (Ollama, 100% offline)
 * 4. Intelligence API (api.upinbox.ai, 95% accuracy, Business/Enterprise license)
 */
export interface TriageResult {
  emailId: string;
  /**
   * Normalized to @upgpt/email-classifier categories:
   * ACTION_REQUIRED | FYI | NEWSLETTER | PROMOTION | RECEIPT | EXPIRED | SOCIAL | AUTOMATED
   */
  category: string;
  confidence: number;         // 0–1
  signals: string[];          // e.g. ['domain:mailchimp.com', 'kw_unsubscribe']
  provider: TriageProvider;
  processedAt: string;        // ISO timestamp
}

export type TriageProvider = 'heuristic' | 'byok_anthropic' | 'byok_openai' | 'byok_gemini' | 'uplink_local' | 'intelligence_api';

// ─── USX Protocol Types ───────────────────────────────────────────────────────

export interface UsxRecord {
  domain: string;
  endpoint: string;           // HTTPS endpoint for encrypted delivery
  fingerprint: string;        // sha256:CERT_FINGERPRINT
  version: 'USX1';
  discoveredAt: string;
}

// ─── MCP Types ────────────────────────────────────────────────────────────────

export type McpToolScope = 'read' | 'write' | 'ai';

export interface McpToken {
  id: string;
  token_hash: string;         // SHA-256 of the raw token — raw token never stored
  scopes: McpToolScope[];
  created_at: string;
  last_used_at?: string;
  description?: string;
}
