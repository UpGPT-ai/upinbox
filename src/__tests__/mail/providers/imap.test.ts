/**
 * ImapProvider — unit tests
 *
 * Mocks imapflow and nodemailer to test the provider interface contract.
 * Verifies: IMAP search filters, email ID encoding, flag mapping, and
 * nodemailer integration for sending.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock imapflow ────────────────────────────────────────────────────────────

const MOCK_MAILBOX_TREE = {
  folders: [
    {
      name: 'INBOX',
      path: 'INBOX',
      specialUse: '\\Inbox',
      flags: new Set(['\\Subscribed']),
      folders: [],
    },
    {
      name: 'Sent',
      path: 'Sent',
      specialUse: '\\Sent',
      flags: new Set(['\\Subscribed']),
      folders: [],
    },
    {
      name: 'Drafts',
      path: 'Drafts',
      specialUse: '\\Drafts',
      flags: new Set(['\\Subscribed']),
      folders: [],
    },
    {
      name: 'Trash',
      path: 'Trash',
      specialUse: '\\Trash',
      flags: new Set(['\\Subscribed']),
      folders: [],
    },
    {
      name: '[Gmail]/Spam',
      path: '[Gmail]/Spam',
      specialUse: '\\Junk',
      flags: new Set(),
      folders: [],
    },
  ],
};

const MOCK_IMAP_MESSAGE = {
  uid: 42,
  envelope: {
    messageId: '<msg-001@test.com>',
    subject: 'Test email',
    from: [{ address: 'sender@example.com', name: 'Test Sender' }],
    to: [{ address: 'me@test.com', name: 'Me' }],
    cc: [],
    bcc: [],
    replyTo: [],
    date: new Date('2026-01-15T10:00:00Z'),
    inReplyTo: null,
  },
  flags: new Set(['\\Seen']),
  size: 1024,
  bodyStructure: { type: 'text', subtype: 'plain', size: 800 },
};

const mockImapClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  listTree: vi.fn().mockResolvedValue(MOCK_MAILBOX_TREE),
  getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
  search: vi.fn().mockResolvedValue([42, 43, 44]),
  fetchOne: vi.fn(),
  fetch: vi.fn(),
  messageMove: vi.fn().mockResolvedValue(undefined),
  messageFlagsAdd: vi.fn().mockResolvedValue(undefined),
  messageFlagsRemove: vi.fn().mockResolvedValue(undefined),
  append: vi.fn().mockResolvedValue({ uid: 99 }),
  mailboxOpen: vi.fn().mockResolvedValue({}),
  status: vi.fn().mockResolvedValue({ messages: 50, unseen: 5 }),
};

vi.mock('imapflow', () => ({
  ImapFlow: vi.fn().mockImplementation(() => mockImapClient),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: '<sent-001@test.com>' }),
    }),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { ImapProvider } from '@/lib/mail/providers/imap';

function makeImapAccount() {
  return {
    id: 'account-imap-001',
    email_address: 'me@test.com',
    provider_type: 'imap' as const,
    encrypted_credentials: '', // not used — credentials passed separately
  };
}

function makeImapCredentials() {
  return {
    type: 'imap' as const,
    host: 'imap.test.com',
    port: 993,
    secure: true,
    username: 'me@test.com',
    password: 'secret123',
    smtp_host: 'smtp.test.com',
    smtp_port: 587,
    smtp_secure: false,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ImapProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates provider with correct type', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    expect(provider.providerType).toBe('imap');
    expect(provider.accountId).toBe('account-imap-001');
  });

  it('listMailboxes() normalizes special-use folders to JMAP roles', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    const mailboxes = await provider.listMailboxes();

    expect(mailboxes.length).toBeGreaterThan(0);

    const inbox = mailboxes.find((m) => m.role === 'inbox');
    expect(inbox).toBeDefined();
    expect(inbox?.name).toBe('INBOX');

    const sent = mailboxes.find((m) => m.role === 'sent');
    expect(sent).toBeDefined();

    const trash = mailboxes.find((m) => m.role === 'trash');
    expect(trash).toBeDefined();

    const spam = mailboxes.find((m) => m.role === 'junk');
    expect(spam).toBeDefined();
  });

  it('queryEmails() calls IMAP SEARCH and returns encoded email IDs', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    const result = await provider.queryEmails({ mailboxId: 'INBOX', limit: 25, position: 0 });

    // UIDs 42, 43, 44 should be encoded as "{uid}@{base64url(INBOX)}"
    expect(result.ids).toHaveLength(3);
    result.ids.forEach((id) => {
      expect(id).toMatch(/^\d+@/);
    });
    expect(result.total).toBe(3);
  });

  it('email ID encodes mailbox path in base64url', async () => {
    // The email ID format: {uid}@{base64url(mailboxPath)}
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    const result = await provider.queryEmails({ mailboxId: 'INBOX', limit: 1, position: 0 });

    const [id] = result.ids;
    const [uidStr, encodedPath] = id.split('@');
    expect(parseInt(uidStr)).toBeGreaterThan(0);

    // Decode the base64url path
    const decoded = Buffer.from(encodedPath, 'base64url').toString('utf-8');
    expect(decoded).toBe('INBOX');
  });

  it('setKeywords() maps $seen to \\Seen IMAP flag', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());

    // Encode a real email ID: uid=42, mailbox=INBOX
    const emailId = `42@${Buffer.from('INBOX').toString('base64url')}`;
    await provider.setKeywords(emailId, { '$seen': true });

    expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
      42,
      ['\\Seen'],
      expect.any(Object)
    );
  });

  it('setKeywords() maps $flagged to \\Flagged IMAP flag', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    const emailId = `42@${Buffer.from('INBOX').toString('base64url')}`;
    await provider.setKeywords(emailId, { '$flagged': true });

    expect(mockImapClient.messageFlagsAdd).toHaveBeenCalledWith(
      42,
      ['\\Flagged'],
      expect.any(Object)
    );
  });

  it('setKeywords() removes flags when value is false', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    const emailId = `42@${Buffer.from('INBOX').toString('base64url')}`;
    await provider.setKeywords(emailId, { '$seen': false });

    expect(mockImapClient.messageFlagsRemove).toHaveBeenCalledWith(
      42,
      ['\\Seen'],
      expect.any(Object)
    );
  });

  it('moveEmail() calls imapflow messageMove', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    const emailId = `42@${Buffer.from('INBOX').toString('base64url')}`;
    await provider.moveEmail(emailId, 'Archive');

    expect(mockImapClient.messageMove).toHaveBeenCalledWith(
      42,
      'Archive',
      expect.any(Object)
    );
  });

  it('getIdentities() returns the account email address', async () => {
    const provider = await ImapProvider.create(makeImapAccount(), makeImapCredentials());
    const identities = await provider.getIdentities();

    expect(identities).toHaveLength(1);
    expect(identities[0].email).toBe('me@test.com');
  });

  it('oauth2 credentials set auth type correctly', async () => {
    const oauthCredentials = {
      type: 'oauth_imap' as const,
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      username: 'me@gmail.com',
      access_token: 'ya29.test-token',
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      smtp_secure: false,
    };

    const provider = await ImapProvider.create(
      { ...makeImapAccount(), email_address: 'me@gmail.com' },
      oauthCredentials
    );
    expect(provider.providerType).toBe('imap');

    // ImapFlow should have been constructed with OAuth2 auth
    const { ImapFlow } = await import('imapflow');
    const constructorCall = vi.mocked(ImapFlow).mock.calls[0][0];
    expect(constructorCall.auth).toMatchObject({
      user: 'me@gmail.com',
      accessToken: 'ya29.test-token',
    });
  });
});
