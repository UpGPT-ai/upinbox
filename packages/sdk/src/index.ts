/**
 * @upinbox/client
 *
 * TypeScript client SDK for the UpInbox REST API.
 *
 * @example
 * ```ts
 * import { UpInboxClient } from '@upinbox/client';
 *
 * const client = new UpInboxClient({
 *   baseUrl: 'https://api.upinbox.ai',
 *   authToken: process.env.UPINBOX_TOKEN!,
 * });
 *
 * const emails = await client.getEmails({ mailboxId: 'mb_123', limit: 20 });
 * ```
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Base error thrown by the UpInbox client for any non-2xx API response.
 * Carries the HTTP status, machine-readable error code, and raw response body.
 */
export class UpInboxApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly body: unknown;

  constructor(message: string, status: number, code: string, body: unknown) {
    super(message);
    this.name = 'UpInboxApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * Thrown when the caller is authenticated but is not entitled to the
 * requested capability (e.g. AI features without an active subscription).
 * HTTP 403 with code `not_entitled`.
 */
export class UpInboxNotEntitledError extends UpInboxApiError {
  public readonly requiredEntitlement?: string;

  constructor(message: string, body: unknown, requiredEntitlement?: string) {
    super(message, 403, 'not_entitled', body);
    this.name = 'UpInboxNotEntitledError';
    this.requiredEntitlement = requiredEntitlement;
  }
}

/**
 * Thrown when the caller has exceeded a rate limit. HTTP 429.
 * `retryAfterSeconds` is parsed from the `Retry-After` header when present.
 */
export class UpInboxRateLimitError extends UpInboxApiError {
  public readonly retryAfterSeconds?: number;

  constructor(message: string, body: unknown, retryAfterSeconds?: number) {
    super(message, 429, 'rate_limited', body);
    this.name = 'UpInboxRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ---------------------------------------------------------------------------
// Response shape types
// ---------------------------------------------------------------------------

/** A connected mail provider account (e.g. a Gmail or IMAP login). */
export interface Account {
  id: string;
  userId: string;
  provider: 'gmail' | 'outlook' | 'imap' | 'icloud' | 'fastmail';
  email: string;
  displayName?: string;
  status: 'active' | 'paused' | 'reauth_required' | 'error';
  createdAt: string;
  lastSyncedAt?: string;
}

/** A logical mailbox (inbox, label, folder, or virtual view) under an account. */
export interface Mailbox {
  id: string;
  accountId: string;
  name: string;
  kind: 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash' | 'label' | 'folder' | 'virtual';
  unreadCount: number;
  totalCount: number;
  parentId?: string;
}

/** A single email participant address. */
export interface EmailAddress {
  email: string;
  name?: string;
}

/** Summary of an email message returned by list endpoints. */
export interface EmailSummary {
  id: string;
  mailboxId: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: string[];
}

/** Full email message including body content. */
export interface Email extends EmailSummary {
  cc: EmailAddress[];
  bcc: EmailAddress[];
  bodyHtml?: string;
  bodyText?: string;
  attachments: Attachment[];
  headers: Record<string, string>;
}

/** Email attachment metadata. */
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl: string;
}

/** Cursor-paginated list response. */
export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

/** Outgoing message payload used by sendEmail / scheduleSend. */
export interface OutgoingMessage {
  accountId: string;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  inReplyTo?: string;
  threadId?: string;
  attachments?: Array<{ filename: string; mimeType: string; contentBase64: string }>;
}

/** Result of a send/schedule operation. */
export interface SendResult {
  id: string;
  status: 'queued' | 'sent' | 'scheduled' | 'failed';
  scheduledFor?: string;
  sentAt?: string;
}

/** A follow-up reminder tracked by UpInbox. */
export interface FollowUp {
  id: string;
  emailId: string;
  threadId: string;
  dueAt: string;
  reason: string;
  status: 'pending' | 'done' | 'snoozed' | 'dismissed';
}

/** Health score for an inbox / mailbox / account. */
export interface HealthScore {
  scope: 'account' | 'mailbox';
  scopeId: string;
  score: number; // 0..100
  factors: Array<{ key: string; label: string; impact: number }>;
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Method option types
// ---------------------------------------------------------------------------

export interface ListEmailsOptions {
  mailboxId?: string;
  accountId?: string;
  query?: string;
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
}

export interface ListMailboxesOptions {
  accountId?: string;
}

export interface ListFollowUpsOptions {
  status?: FollowUp['status'];
  cursor?: string;
  limit?: number;
}

export interface SnoozeOptions {
  /** ISO-8601 datetime the email should reappear in the inbox. */
  until: string;
}

export interface ScheduleSendOptions {
  /** ISO-8601 datetime the message should be dispatched. */
  sendAt: string;
}

export interface HealthScoreOptions {
  scope?: 'account' | 'mailbox';
  scopeId: string;
}

export interface UpInboxClientOptions {
  /** Root URL of the UpInbox API, e.g. `https://api.upinbox.ai`. */
  baseUrl: string;
  /** Bearer token used for `Authorization: Bearer <token>`. */
  authToken: string;
  /** Optional override for `fetch` (useful for tests or non-browser runtimes). */
  fetch?: typeof fetch;
  /** Optional default headers merged into every request. */
  defaultHeaders?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * UpInbox REST API client.
 *
 * Construct once per authenticated user/session and reuse for the lifetime
 * of that session.
 *
 * @example
 * ```ts
 * const client = new UpInboxClient({
 *   baseUrl: 'https://api.upinbox.ai',
 *   authToken: token,
 * });
 *
 * const accounts = await client.getAccounts();
 * ```
 */
export class UpInboxClient {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(opts: UpInboxClientOptions) {
    if (!opts.baseUrl) throw new Error('UpInboxClient: baseUrl is required');
    if (!opts.authToken) throw new Error('UpInboxClient: authToken is required');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.authToken = opts.authToken;
    this.fetchImpl = opts.fetch ?? fetch;
    this.defaultHeaders = opts.defaultHeaders ?? {};
  }

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------

  /**
   * List all mail provider accounts connected by the current user.
   *
   * @example
   * ```ts
   * const accounts = await client.getAccounts();
   * accounts.forEach(a => console.log(a.email, a.status));
   * ```
   */
  async getAccounts(): Promise<Account[]> {
    return this.request<Account[]>('GET', '/v1/accounts');
  }

  // -------------------------------------------------------------------------
  // Mailboxes
  // -------------------------------------------------------------------------

  /**
   * List mailboxes, optionally scoped to a single account.
   *
   * @example
   * ```ts
   * const mailboxes = await client.getMailboxes({ accountId: 'acc_1' });
   * ```
   */
  async getMailboxes(options: ListMailboxesOptions = {}): Promise<Mailbox[]> {
    const qs = this.toQuery({ accountId: options.accountId });
    return this.request<Mailbox[]>('GET', `/v1/mailboxes${qs}`);
  }

  // -------------------------------------------------------------------------
  // Emails
  // -------------------------------------------------------------------------

  /**
   * List emails (cursor-paginated) by mailbox, account, or full-text query.
   *
   * @example
   * ```ts
   * const page = await client.getEmails({ mailboxId: 'mb_1', limit: 50 });
   * if (page.nextCursor) {
   *   const next = await client.getEmails({ mailboxId: 'mb_1', cursor: page.nextCursor });
   * }
   * ```
   */
  async getEmails(options: ListEmailsOptions = {}): Promise<Paginated<EmailSummary>> {
    const qs = this.toQuery({
      mailbox_id: options.mailboxId,
      account_id: options.accountId,
      q: options.query,
      cursor: options.cursor,
      limit: options.limit,
      unread_only: options.unreadOnly,
    });
    return this.request<Paginated<EmailSummary>>('GET', `/v1/emails${qs}`);
  }

  /**
   * Fetch a single email by id, including full body and attachments.
   *
   * @example
   * ```ts
   * const email = await client.getEmail('em_abc');
   * console.log(email.subject, email.bodyText);
   * ```
   */
  async getEmail(emailId: string): Promise<Email> {
    return this.request<Email>('GET', `/v1/emails/${encodeURIComponent(emailId)}`);
  }

  /**
   * Mark an email as read or unread.
   *
   * @example
   * ```ts
   * await client.markRead('em_abc', true);
   * ```
   */
  async markRead(emailId: string, read = true): Promise<EmailSummary> {
    return this.request<EmailSummary>(
      'POST',
      `/v1/emails/${encodeURIComponent(emailId)}/read`,
      { read }
    );
  }

  /**
   * Archive an email out of the inbox.
   *
   * @example
   * ```ts
   * await client.archiveEmail('em_abc');
   * ```
   */
  async archiveEmail(emailId: string): Promise<EmailSummary> {
    return this.request<EmailSummary>(
      'POST',
      `/v1/emails/${encodeURIComponent(emailId)}/archive`
    );
  }

  /**
   * Permanently delete (or move to trash, depending on provider) an email.
   *
   * @example
   * ```ts
   * await client.deleteEmail('em_abc');
   * ```
   */
  async deleteEmail(emailId: string): Promise<{ id: string; deleted: true }> {
    return this.request<{ id: string; deleted: true }>(
      'DELETE',
      `/v1/emails/${encodeURIComponent(emailId)}`
    );
  }

  /**
   * Send an email immediately.
   *
   * @example
   * ```ts
   * await client.sendEmail({
   *   accountId: 'acc_1',
   *   to: [{ email: 'jane@example.com' }],
   *   subject: 'Hello',
   *   bodyText: 'Hi Jane!',
   * });
   * ```
   */
  async sendEmail(message: OutgoingMessage): Promise<SendResult> {
    return this.request<SendResult>('POST', '/v1/emails/send', message);
  }

  /**
   * Snooze an email until a future timestamp.
   *
   * @example
   * ```ts
   * await client.snoozeEmail('em_abc', { until: '2026-06-01T09:00:00Z' });
   * ```
   */
  async snoozeEmail(emailId: string, options: SnoozeOptions): Promise<EmailSummary> {
    return this.request<EmailSummary>(
      'POST',
      `/v1/emails/${encodeURIComponent(emailId)}/snooze`,
      { until: options.until }
    );
  }

  /**
   * Schedule an email to be sent at a future time.
   *
   * @example
   * ```ts
   * await client.scheduleSend(
   *   { accountId: 'acc_1', to: [{ email: 'jane@example.com' }], subject: 'Hi', bodyText: '...' },
   *   { sendAt: '2026-06-01T15:00:00Z' }
   * );
   * ```
   */
  async scheduleSend(
    message: OutgoingMessage,
    options: ScheduleSendOptions
  ): Promise<SendResult> {
    return this.request<SendResult>('POST', '/v1/emails/schedule', {
      ...message,
      send_at: options.sendAt,
    });
  }

  // -------------------------------------------------------------------------
  // Follow-ups
  // -------------------------------------------------------------------------

  /**
   * List follow-up reminders for the current user.
   *
   * @example
   * ```ts
   * const pending = await client.listFollowUps({ status: 'pending' });
   * ```
   */
  async listFollowUps(options: ListFollowUpsOptions = {}): Promise<Paginated<FollowUp>> {
    const qs = this.toQuery({
      status: options.status,
      cursor: options.cursor,
      limit: options.limit,
    });
    return this.request<Paginated<FollowUp>>('GET', `/v1/followups${qs}`);
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * Get the inbox health score for an account or mailbox.
   *
   * @example
   * ```ts
   * const score = await client.getHealthScore({ scope: 'account', scopeId: 'acc_1' });
   * console.log(score.score, score.factors);
   * ```
   */
  async getHealthScore(options: HealthScoreOptions): Promise<HealthScore> {
    const qs = this.toQuery({
      scope: options.scope ?? 'account',
      scope_id: options.scopeId,
    });
    return this.request<HealthScore>('GET', `/v1/health${qs}`);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private toQuery(params: Record<string, string | number | boolean | undefined>): string {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ''
    );
    if (entries.length === 0) return '';
    const sp = new URLSearchParams();
    for (const [k, v] of entries) sp.append(k, String(v));
    return `?${sp.toString()}`;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.authToken}`,
      Accept: 'application/json',
      ...this.defaultHeaders,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const res = await this.fetchImpl(url, init);

    // 204 No Content
    if (res.status === 204) return undefined as T;

    const contentType = res.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const payload: unknown = isJson ? await res.json().catch(() => undefined) : await res.text();

    if (!res.ok) {
      const code = this.extractCode(payload) ?? `http_${res.status}`;
      const message = this.extractMessage(payload) ?? `UpInbox API error ${res.status}`;

      if (res.status === 403 && code === 'not_entitled') {
        const required = this.extractField(payload, 'required_entitlement');
        throw new UpInboxNotEntitledError(message, payload, required);
      }
      if (res.status === 429) {
        const retryHeader = res.headers.get('retry-after');
        const retryAfter = retryHeader ? Number(retryHeader) : undefined;
        throw new UpInboxRateLimitError(
          message,
          payload,
          Number.isFinite(retryAfter) ? retryAfter : undefined
        );
      }
      throw new UpInboxApiError(message, res.status, code, payload);
    }

    return payload as T;
  }

  private extractMessage(payload: unknown): string | undefined {
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (typeof p.message === 'string') return p.message;
      if (typeof p.error === 'string') return p.error;
      if (p.error && typeof p.error === 'object') {
        const e = p.error as Record<string, unknown>;
        if (typeof e.message === 'string') return e.message;
      }
    }
    return undefined;
  }

  private extractCode(payload: unknown): string | undefined {
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (typeof p.code === 'string') return p.code;
      if (p.error && typeof p.error === 'object') {
        const e = p.error as Record<string, unknown>;
        if (typeof e.code === 'string') return e.code;
      }
    }
    return undefined;
  }

  private extractField(payload: unknown, field: string): string | undefined {
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (typeof p[field] === 'string') return p[field] as string;
      if (p.error && typeof p.error === 'object') {
        const e = p.error as Record<string, unknown>;
        if (typeof e[field] === 'string') return e[field] as string;
      }
    }
    return undefined;
  }
}

export default UpInboxClient;
