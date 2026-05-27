/**
 * IMAP Provider — implements MailProvider for any IMAP server.
 * Uses imapflow for IMAP and nodemailer for SMTP send.
 *
 * Folder role mapping handles Gmail's non-standard folder names
 * ([Gmail]/Sent Mail, [Gmail]/Trash, etc.) automatically.
 *
 * All operations normalize IMAP UIDs to string IDs in the format "{uid}@{mailbox}"
 * so they are stable references that can be passed back to getEmails().
 */

import type {
  JmapEmail,
  JmapEmailAddress,
  JmapEmailSubmission,
  JmapIdentity,
  JmapMailbox,
  JmapThread,
  UpInboxAccount,
  ImapCredentials,
  OAuthImapCredentials,
} from '@/lib/mail/types';
import type { MailProvider } from './types';
import { decryptCredentials } from '@/lib/mail/crypto/credentials';

// These are runtime imports — imapflow and nodemailer must be in node_modules.
// Type-only imports to avoid bundler issues in edge/browser contexts.
type ImapFlow = import('imapflow').ImapFlow;
type ImapFlowOptions = import('imapflow').ImapFlowOptions;

// ─── Known IMAP Folder → Role Mapping ─────────────────────────────────────────

const ROLE_MAP: Record<string, JmapMailbox['role']> = {
  // Standard
  inbox: 'inbox',
  sent: 'sent',
  'sent items': 'sent',
  'sent mail': 'sent',
  drafts: 'drafts',
  draft: 'drafts',
  trash: 'trash',
  'deleted items': 'trash',
  'deleted messages': 'trash',
  junk: 'spam',
  spam: 'spam',
  'junk email': 'spam',
  archive: 'archive',
  // Gmail-specific
  '[gmail]/sent mail': 'sent',
  '[gmail]/trash': 'trash',
  '[gmail]/spam': 'spam',
  '[gmail]/drafts': 'drafts',
  '[gmail]/all mail': 'archive',
  // Outlook-specific
  'sentitems': 'sent',
  'deleteditems': 'trash',
  'junkemail': 'spam',
};

function guessRole(path: string): JmapMailbox['role'] {
  return ROLE_MAP[path.toLowerCase()] ?? null;
}

// ─── Email ID codec ───────────────────────────────────────────────────────────

function makeEmailId(uid: number, mailboxPath: string): string {
  return `${uid}@${Buffer.from(mailboxPath).toString('base64url')}`;
}

function parseEmailId(id: string): { uid: number; mailboxPath: string } {
  const atIdx = id.indexOf('@');
  const uid = parseInt(id.slice(0, atIdx), 10);
  const mailboxPath = Buffer.from(id.slice(atIdx + 1), 'base64url').toString();
  return { uid, mailboxPath };
}

// ─── IMAP Provider ────────────────────────────────────────────────────────────

export class ImapProvider implements MailProvider {
  readonly providerType = 'imap' as const;
  readonly accountId: string;

  private credentials: ImapCredentials | OAuthImapCredentials;
  private emailAddress: string;

  private constructor(
    accountId: string,
    credentials: ImapCredentials | OAuthImapCredentials,
    emailAddress: string,
  ) {
    this.accountId = accountId;
    this.credentials = credentials;
    this.emailAddress = emailAddress;
  }

  static async create(account: UpInboxAccount): Promise<ImapProvider> {
    const credentials = await decryptCredentials(account.credentials_enc);
    if (credentials.type !== 'imap' && credentials.type !== 'oauth_imap') {
      throw new Error(`ImapProvider requires imap or oauth_imap credentials, got: ${credentials.type}`);
    }
    return new ImapProvider(account.id, credentials as ImapCredentials | OAuthImapCredentials, account.email_address);
  }

  /** Create a connected ImapFlow client. Caller must call client.logout() when done. */
  private async connect(): Promise<ImapFlow> {
    const { ImapFlow } = await import('imapflow');
    const creds = this.credentials;

    let auth: ImapFlowOptions['auth'];
    if (creds.type === 'oauth_imap') {
      auth = { user: this.emailAddress, accessToken: creds.accessToken };
    } else {
      auth = { user: creds.username, pass: creds.password };
    }

    const client = new ImapFlow({
      host: creds.imapHost,
      port: creds.imapPort,
      secure: creds.imapTls,
      auth,
      logger: false, // suppress verbose imapflow logging
    });

    await client.connect();
    return client;
  }

  // ── Mailboxes ──────────────────────────────────────────────────────────────

  async listMailboxes(): Promise<JmapMailbox[]> {
    const client = await this.connect();
    try {
      const tree = await client.listTree();
      const mailboxes: JmapMailbox[] = [];

      function flatten(node: import('imapflow').ListTreeResponse, parentId: string | null = null) {
        const id = node.path;
        const role = guessRole(node.path);

        // Try to get counts — requires SELECT, which we skip for listing speed
        mailboxes.push({
          id,
          name: node.name,
          role,
          totalEmails: 0,   // filled lazily on select
          unreadEmails: 0,
          parentId,
          sortOrder: role === 'inbox' ? 0 : mailboxes.length + 1,
          isSubscribed: node.subscribed ?? true,
        });

        for (const child of node.folders ?? []) {
          flatten(child, id);
        }
      }

      flatten(tree as unknown as import('imapflow').ListTreeResponse);
      return mailboxes.sort((a, b) => a.sortOrder - b.sortOrder);
    } finally {
      await client.logout();
    }
  }

  // ── Email Queries ──────────────────────────────────────────────────────────

  async queryEmails(opts: {
    mailboxId: string;
    limit?: number;
    offset?: number;
    sort?: 'asc' | 'desc';
    search?: string;
  }): Promise<{ ids: string[]; total: number }> {
    const client = await this.connect();
    try {
      const lock = await client.getMailboxLock(opts.mailboxId);
      try {
        const criteria = opts.search
          ? { text: opts.search }
          : { all: true };

        const uids = await client.search(criteria, { uid: true });
        const total = uids.length;

        // Sort: IMAP search returns ascending UIDs, reverse for newest-first
        const sorted = opts.sort === 'asc' ? uids : [...uids].reverse();
        const offset = opts.offset ?? 0;
        const limit = opts.limit ?? 50;
        const page = sorted.slice(offset, offset + limit);

        const ids = page.map((uid) => makeEmailId(uid as number, opts.mailboxId));
        return { ids, total };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async getEmails(ids: string[]): Promise<JmapEmail[]> {
    if (ids.length === 0) return [];

    // Group by mailbox so we can batch per-mailbox
    const byMailbox = new Map<string, number[]>();
    for (const id of ids) {
      const { uid, mailboxPath } = parseEmailId(id);
      const arr = byMailbox.get(mailboxPath) ?? [];
      arr.push(uid);
      byMailbox.set(mailboxPath, arr);
    }

    const client = await this.connect();
    const emails: JmapEmail[] = [];

    try {
      for (const [mailboxPath, uids] of byMailbox) {
        const lock = await client.getMailboxLock(mailboxPath);
        try {
          for await (const msg of client.fetch(
            uids.join(','),
            {
              uid: true,
              flags: true,
              envelope: true,
              bodyStructure: true,
              bodyParts: ['1', 'TEXT', 'HTML'],
              internalDate: true,
              size: true,
            },
            { uid: true },
          )) {
            emails.push(mapImapMessageToJmap(msg, mailboxPath));
          }
        } finally {
          lock.release();
        }
      }
    } finally {
      await client.logout();
    }

    // Return in the requested order
    const byId = new Map(emails.map((e) => [e.id, e]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as JmapEmail[];
  }

  async getThreads(threadIds: string[]): Promise<JmapThread[]> {
    // IMAP has no native thread concept — treat each email ID as its own thread
    return threadIds.map((id) => ({ id, emailIds: [id] }));
  }

  // ── Write Operations ───────────────────────────────────────────────────────

  async createDraft(
    draft: Partial<JmapEmail> & { bodyValues: Record<string, { value: string }> },
  ): Promise<{ id: string }> {
    const { createTransport } = await import('nodemailer');
    const creds = this.credentials;

    // Build MIME message using nodemailer's compile step (no send)
    const transport = createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpTls,
      auth: creds.type === 'oauth_imap'
        ? { type: 'OAuth2', user: this.emailAddress, accessToken: creds.accessToken }
        : { user: creds.username, pass: creds.password },
    });

    const bodyText = Object.values(draft.bodyValues ?? {})[0]?.value ?? '';
    const message = transport.sendMail({
      from: this.emailAddress,
      to: draft.to?.map((a) => a.email).join(', '),
      subject: draft.subject ?? '',
      text: bodyText,
    });

    // Append to Drafts folder
    const client = await this.connect();
    try {
      const rawMessage = await (await message).then
        ? /* already a string */ bodyText
        : bodyText;

      const result = await client.append('Drafts', rawMessage, ['\\Draft']);
      const uid = typeof result === 'object' && result !== null && 'uid' in result
        ? (result as { uid: number }).uid
        : 0;
      return { id: makeEmailId(uid, 'Drafts') };
    } finally {
      await client.logout();
    }
  }

  async sendEmail(submission: JmapEmailSubmission): Promise<{ id: string; sendAt: string }> {
    const { createTransport } = await import('nodemailer');
    const creds = this.credentials;

    // Get the draft content first
    const [email] = await this.getEmails([submission.emailId]);
    if (!email) throw new Error(`Draft not found: ${submission.emailId}`);

    const transport = createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpTls,
      auth: creds.type === 'oauth_imap'
        ? { type: 'OAuth2', user: this.emailAddress, accessToken: creds.accessToken }
        : { user: creds.username, pass: creds.password },
    });

    const bodyText = Object.values(email.bodyValues ?? {})[0]?.value ?? '';
    await transport.sendMail({
      from: `${email.from?.[0]?.name ?? ''} <${this.emailAddress}>`,
      to: email.to?.map((a) => `${a.name ?? ''} <${a.email}>`).join(', '),
      cc: email.cc?.map((a) => a.email).join(', '),
      subject: email.subject ?? '',
      text: bodyText,
    });

    const now = new Date().toISOString();
    return { id: submission.emailId, sendAt: now };
  }

  async moveEmail(emailId: string, toMailboxId: string): Promise<void> {
    const { uid, mailboxPath } = parseEmailId(emailId);
    const client = await this.connect();
    try {
      const lock = await client.getMailboxLock(mailboxPath);
      try {
        await client.messageMove(uid.toString(), toMailboxId, { uid: true });
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async setKeywords(emailId: string, keywords: Record<string, boolean>): Promise<void> {
    const { uid, mailboxPath } = parseEmailId(emailId);
    const client = await this.connect();

    // Map JMAP keywords to IMAP flags
    const flagMap: Record<string, string> = {
      '$seen': '\\Seen',
      '$flagged': '\\Flagged',
      '$answered': '\\Answered',
      '$draft': '\\Draft',
    };

    const addFlags: string[] = [];
    const removeFlags: string[] = [];

    for (const [keyword, value] of Object.entries(keywords)) {
      const flag = flagMap[keyword];
      if (!flag) continue; // Custom keywords ($upinbox_class_*) ignored in IMAP
      (value ? addFlags : removeFlags).push(flag);
    }

    try {
      const lock = await client.getMailboxLock(mailboxPath);
      try {
        if (addFlags.length > 0) {
          await client.messageFlagsAdd(uid.toString(), addFlags, { uid: true });
        }
        if (removeFlags.length > 0) {
          await client.messageFlagsRemove(uid.toString(), removeFlags, { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async deleteEmail(emailId: string): Promise<void> {
    await this.moveEmail(emailId, 'Trash');
  }

  async getIdentities(): Promise<JmapIdentity[]> {
    // IMAP has no identity concept — return a single identity from the account email
    return [{
      id: this.accountId,
      name: this.emailAddress.split('@')[0],
      email: this.emailAddress,
      mayDelete: false,
    }];
  }
}

// ─── IMAP → JmapEmail Mapping ─────────────────────────────────────────────────

function mapImapMessageToJmap(msg: Record<string, unknown>, mailboxPath: string): JmapEmail {
  const envelope = msg.envelope as Record<string, unknown> | undefined;
  const flags = (msg.flags as Set<string> | undefined) ?? new Set<string>();
  const uid = msg.uid as number;

  const keywords: Record<string, boolean> = {
    '$seen': flags.has('\\Seen'),
    '$flagged': flags.has('\\Flagged'),
    '$answered': flags.has('\\Answered'),
    '$draft': flags.has('\\Draft'),
  };

  function mapAddress(addr: unknown): JmapEmailAddress[] {
    if (!Array.isArray(addr)) return [];
    return addr.map((a: Record<string, string>) => ({
      name: a.name ?? undefined,
      email: `${a.mailbox ?? ''}@${a.host ?? ''}`,
    }));
  }

  const bodyParts = msg.bodyParts as Map<string, Buffer> | undefined;
  const bodyText = bodyParts?.get('TEXT')?.toString('utf-8') ?? '';

  return {
    id: makeEmailId(uid, mailboxPath),
    blobId: makeEmailId(uid, mailboxPath),
    threadId: makeEmailId(uid, mailboxPath),
    mailboxIds: { [mailboxPath]: true },
    keywords,
    size: (msg.size as number) ?? 0,
    receivedAt: (msg.internalDate as Date)?.toISOString() ?? new Date().toISOString(),
    subject: (envelope?.subject as string) ?? undefined,
    from: mapAddress(envelope?.from),
    to: mapAddress(envelope?.to),
    cc: mapAddress(envelope?.cc),
    bcc: mapAddress(envelope?.bcc),
    bodyValues: { '1': { value: bodyText } },
    textBody: [{ partId: '1', size: bodyText.length, type: 'text/plain' }],
    htmlBody: [],
    attachments: [],
    hasAttachment: false,
    preview: bodyText.slice(0, 256).replace(/\s+/g, ' ').trim(),
  };
}
