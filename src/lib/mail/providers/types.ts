/**
 * MailProvider — the unified interface every mail backend implements.
 *
 * Whether the underlying account is JMAP (Stalwart, Fastmail), IMAP (Gmail,
 * Outlook, generic), or Exchange, the app always talks to a MailProvider.
 * This means the entire UI and intelligence layer is protocol-agnostic.
 *
 * Implementations:
 *   - JmapProvider  (src/lib/mail/providers/jmap.ts)  — Stalwart, Fastmail, any JMAP server
 *   - ImapProvider  (src/lib/mail/providers/imap.ts)  — Gmail, Outlook, generic IMAP + nodemailer
 *
 * Usage:
 *   const provider = await getMailProvider(account);
 *   const mailboxes = await provider.listMailboxes();
 */

import type {
  JmapEmail,
  JmapEmailSubmission,
  JmapIdentity,
  JmapMailbox,
  JmapThread,
  ProviderType,
  UpInboxAccount,
} from '@/lib/mail/types';

export interface MailProvider {
  // ── Identity ───────────────────────────────────────────────────────────────
  readonly providerType: ProviderType;
  /** The UpInbox account ID this provider was created for */
  readonly accountId: string;

  // ── Mailboxes ──────────────────────────────────────────────────────────────
  listMailboxes(): Promise<JmapMailbox[]>;

  // ── Email Queries ──────────────────────────────────────────────────────────
  queryEmails(opts: {
    mailboxId: string;
    limit?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
    /** Free-text search — passed to JMAP text filter or IMAP SEARCH */
    search?: string;
  }): Promise<{ ids: string[]; total: number }>;

  getEmails(ids: string[], properties?: string[]): Promise<JmapEmail[]>;

  getThreads(threadIds: string[]): Promise<JmapThread[]>;

  // ── Write Operations ───────────────────────────────────────────────────────
  createDraft(
    draft: Partial<JmapEmail> & { bodyValues: Record<string, { value: string }> },
  ): Promise<{ id: string }>;

  sendEmail(submission: JmapEmailSubmission): Promise<{ id: string; sendAt: string }>;

  moveEmail(emailId: string, toMailboxId: string): Promise<void>;

  /**
   * Set or unset keywords on an email.
   * Keywords: '$seen', '$flagged', '$answered', '$draft', '$upinbox_class_{category}', etc.
   * IMAP providers map these to IMAP flags where possible.
   */
  setKeywords(emailId: string, keywords: Record<string, boolean>): Promise<void>;

  deleteEmail(emailId: string): Promise<void>;

  // ── Identities ─────────────────────────────────────────────────────────────
  getIdentities(): Promise<JmapIdentity[]>;
}

/**
 * Factory — creates the right provider implementation for a given account.
 *
 * IMPORTANT: This is server-side only. Never import in client components.
 * Client components call API routes; API routes call getMailProvider().
 */
export type GetMailProvider = (account: UpInboxAccount) => Promise<MailProvider>;
