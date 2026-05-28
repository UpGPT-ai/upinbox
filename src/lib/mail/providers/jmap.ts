/**
 * JMAP Provider — implements MailProvider for any JMAP-capable server.
 * Tested against Stalwart, Fastmail, and Cyrus.
 *
 * JMAP RFC: https://www.rfc-editor.org/rfc/rfc8620
 * JMAP Mail RFC: https://www.rfc-editor.org/rfc/rfc8621
 */

import type {
  JmapEmail,
  JmapEmailSubmission,
  JmapIdentity,
  JmapMailbox,
  JmapThread,
  UpInboxAccount,
  JmapCredentials,
} from '@/lib/mail/types';
import type { MailProvider } from './types';
import { decryptCredentials } from '@/lib/mail/crypto/credentials';

// ─── JMAP Session ─────────────────────────────────────────────────────────────

interface JmapCapabilities {
  'urn:ietf:params:jmap:core': {
    maxObjectsInGet: number;
    maxObjectsInSet: number;
    maxCallsInRequest: number;
  };
  'urn:ietf:params:jmap:mail': Record<string, unknown>;
}

interface JmapSession {
  capabilities: JmapCapabilities;
  accounts: Record<string, { name: string; isPersonal: boolean }>;
  primaryAccounts: { 'urn:ietf:params:jmap:mail': string };
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
}

// ─── JMAP API Helpers ─────────────────────────────────────────────────────────

async function jmapRequest(
  apiUrl: string,
  token: string,
  calls: Array<[string, Record<string, unknown>, string]>,
): Promise<{ methodResponses: Array<[string, Record<string, unknown>, string]> }> {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls: calls,
    }),
  });

  if (!res.ok) {
    throw new Error(`JMAP request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── JMAP Provider ────────────────────────────────────────────────────────────

export class JmapProvider implements MailProvider {
  readonly providerType = 'jmap' as const;
  readonly accountId: string;

  private session: JmapSession;
  private token: string;
  private jmapAccountId: string;

  private constructor(accountId: string, session: JmapSession, token: string) {
    this.accountId = accountId;
    this.session = session;
    this.token = token;
    this.jmapAccountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
  }

  static async create(account: UpInboxAccount): Promise<JmapProvider> {
    const credentials = await decryptCredentials(account.encrypted_credentials) as JmapCredentials;

    // Fetch JMAP session from well-known URL
    const sessionRes = await fetch(credentials.sessionUrl, {
      headers: { Authorization: credentials.token },
    });

    if (!sessionRes.ok) {
      throw new Error(
        `JMAP session fetch failed: ${sessionRes.status} — check token and session URL.`,
      );
    }

    const session: JmapSession = await sessionRes.json();
    return new JmapProvider(account.id, session, credentials.token);
  }

  // ── Mailboxes ──────────────────────────────────────────────────────────────

  async listMailboxes(): Promise<JmapMailbox[]> {
    const { methodResponses } = await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Mailbox/get',
        { accountId: this.jmapAccountId, ids: null },
        'mb',
      ],
    ]);

    const [, result] = methodResponses[0];
    const list = (result as { list: Array<Record<string, unknown>> }).list;

    return list.map((mb) => ({
      id: mb.id as string,
      name: mb.name as string,
      role: normalizeRole(mb.role as string | null),
      totalEmails: (mb.totalEmails as number) ?? 0,
      unreadEmails: (mb.unreadEmails as number) ?? 0,
      parentId: (mb.parentId as string | null) ?? null,
      sortOrder: (mb.sortOrder as number) ?? 0,
      isSubscribed: (mb.isSubscribed as boolean) ?? true,
    }));
  }

  // ── Email Queries ──────────────────────────────────────────────────────────

  async queryEmails(opts: {
    mailboxId: string;
    limit?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
    search?: string;
  }): Promise<{ ids: string[]; total: number }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const filter: Record<string, unknown> = { inMailbox: opts.mailboxId };
    if (opts.search) {
      filter.text = opts.search;
    }

    const { methodResponses } = await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Email/query',
        {
          accountId: this.jmapAccountId,
          filter,
          sort: [{ property: 'receivedAt', isAscending: opts.sort === 'asc' }],
          limit,
          position: offset,
          calculateTotal: true,
        },
        'q',
      ],
    ]);

    const [, result] = methodResponses[0];
    return {
      ids: (result as { ids: string[]; total: number }).ids,
      total: (result as { ids: string[]; total: number }).total,
    };
  }

  async getEmails(ids: string[], properties?: string[]): Promise<JmapEmail[]> {
    if (ids.length === 0) return [];

    const defaultProps = [
      'id', 'blobId', 'threadId', 'mailboxIds', 'keywords',
      'size', 'receivedAt', 'messageId', 'inReplyTo', 'subject',
      'from', 'to', 'cc', 'bcc', 'replyTo',
      'textBody', 'htmlBody', 'attachments', 'hasAttachment', 'preview',
    ];

    const { methodResponses } = await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Email/get',
        {
          accountId: this.jmapAccountId,
          ids,
          properties: properties ?? defaultProps,
          bodyProperties: ['partId', 'blobId', 'size', 'type', 'charset', 'disposition', 'name'],
          fetchHTMLBodyValues: true,
          fetchTextBodyValues: true,
          maxBodyValueBytes: 102400, // 100KB per body part
        },
        'e',
      ],
    ]);

    const [, result] = methodResponses[0];
    return (result as { list: JmapEmail[] }).list;
  }

  async getThreads(threadIds: string[]): Promise<JmapThread[]> {
    if (threadIds.length === 0) return [];

    const { methodResponses } = await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Thread/get',
        { accountId: this.jmapAccountId, ids: threadIds },
        't',
      ],
    ]);

    const [, result] = methodResponses[0];
    return (result as { list: JmapThread[] }).list;
  }

  // ── Write Operations ───────────────────────────────────────────────────────

  async createDraft(
    draft: Partial<JmapEmail> & { bodyValues: Record<string, { value: string }> },
  ): Promise<{ id: string }> {
    const { methodResponses } = await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Email/set',
        {
          accountId: this.jmapAccountId,
          create: {
            draft: {
              ...draft,
              keywords: { $draft: true },
            },
          },
        },
        'd',
      ],
    ]);

    const [, result] = methodResponses[0];
    const created = (result as { created: Record<string, { id: string }> }).created;
    const id = created?.draft?.id;
    if (!id) throw new Error('Draft creation failed — no ID returned');
    return { id };
  }

  async sendEmail(submission: JmapEmailSubmission): Promise<{ id: string; sendAt: string }> {
    const now = new Date().toISOString();
    const { methodResponses } = await jmapRequest(this.session.apiUrl, this.token, [
      [
        'EmailSubmission/set',
        {
          accountId: this.jmapAccountId,
          create: {
            sub: {
              identityId: submission.identityId,
              emailId: submission.emailId,
              envelope: submission.envelope,
              sendAt: submission.sendAt ?? now,
            },
          },
        },
        's',
      ],
    ]);

    const [, result] = methodResponses[0];
    const created = (result as { created: Record<string, { id: string; sendAt: string }> }).created;
    const sub = created?.sub;
    if (!sub) throw new Error('Email submission failed');
    return { id: sub.id, sendAt: sub.sendAt ?? now };
  }

  async moveEmail(emailId: string, toMailboxId: string): Promise<void> {
    // First get current mailboxIds, then replace
    const emails = await this.getEmails([emailId], ['id', 'mailboxIds']);
    const currentMailboxIds = emails[0]?.mailboxIds ?? {};

    const newMailboxIds: Record<string, boolean> = { [toMailboxId]: true };

    await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Email/set',
        {
          accountId: this.jmapAccountId,
          update: {
            [emailId]: {
              mailboxIds: newMailboxIds,
            },
          },
        },
        'mv',
      ],
    ]);
  }

  async setKeywords(emailId: string, keywords: Record<string, boolean>): Promise<void> {
    // Patch only the specified keywords (don't replace all)
    const patch: Record<string, boolean | null> = {};
    for (const [key, value] of Object.entries(keywords)) {
      patch[`keywords/${key}`] = value || null; // null removes the keyword
    }

    await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Email/set',
        {
          accountId: this.jmapAccountId,
          update: { [emailId]: patch },
        },
        'kw',
      ],
    ]);
  }

  async deleteEmail(emailId: string): Promise<void> {
    await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Email/set',
        {
          accountId: this.jmapAccountId,
          destroy: [emailId],
        },
        'del',
      ],
    ]);
  }

  // ── Identities ─────────────────────────────────────────────────────────────

  async getIdentities(): Promise<JmapIdentity[]> {
    const { methodResponses } = await jmapRequest(this.session.apiUrl, this.token, [
      [
        'Identity/get',
        { accountId: this.jmapAccountId, ids: null },
        'id',
      ],
    ]);

    const [, result] = methodResponses[0];
    return (result as { list: JmapIdentity[] }).list;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRole(role: string | null): JmapMailbox['role'] {
  const map: Record<string, JmapMailbox['role']> = {
    inbox: 'inbox',
    sent: 'sent',
    drafts: 'drafts',
    trash: 'trash',
    junk: 'spam',
    spam: 'spam',
    archive: 'archive',
  };
  return role ? (map[role.toLowerCase()] ?? null) : null;
}
