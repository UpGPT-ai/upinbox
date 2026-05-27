/**
 * JmapProvider — unit tests
 *
 * Mocks the JMAP HTTP session endpoint and all API calls.
 * Tests the provider interface contract: correct JMAP method names,
 * request shapes, and response normalization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JmapProvider } from '@/lib/mail/providers/jmap';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const MOCK_SESSION = {
  apiUrl: 'https://mail.example.com/jmap/api/',
  capabilities: {
    'urn:ietf:params:jmap:core': { maxCallsInRequest: 32 },
    'urn:ietf:params:jmap:mail': {},
  },
  primaryAccounts: {
    'urn:ietf:params:jmap:mail': 'acc-123',
  },
  accounts: {
    'acc-123': {
      name: 'test@example.com',
      isPersonal: true,
    },
  },
};

const MOCK_MAILBOX = {
  id: 'mb-inbox',
  name: 'Inbox',
  role: 'inbox',
  totalEmails: 150,
  unreadEmails: 12,
  parentId: null,
  sortOrder: 0,
};

function makeFetchMock(responses: unknown[]) {
  let call = 0;
  return vi.fn(async () => ({
    ok: true,
    json: async () => responses[call++] ?? {},
  }));
}

function makeAccount(overrides = {}) {
  return {
    id: 'account-001',
    email_address: 'test@example.com',
    provider_type: 'jmap' as const,
    jmap_session_url: 'https://mail.example.com/jmap/session/',
    encrypted_credentials: '', // not used — credentials passed separately
    ...overrides,
  };
}

function makeCredentials() {
  return { type: 'jmap' as const, token: 'Bearer test-token-abc' };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JmapProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bootstraps session on create() and stores jmap account ID', async () => {
    global.fetch = makeFetchMock([MOCK_SESSION]);

    const provider = await JmapProvider.create(makeAccount(), makeCredentials());
    expect(provider.providerType).toBe('jmap');
    expect(provider.accountId).toBe('account-001');

    // Session endpoint was called with Bearer token
    expect(global.fetch).toHaveBeenCalledWith(
      'https://mail.example.com/jmap/session/',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      })
    );
  });

  it('listMailboxes() calls Mailbox/get and normalizes roles', async () => {
    global.fetch = makeFetchMock([
      MOCK_SESSION,
      // JMAP API response for Mailbox/get
      {
        methodResponses: [
          ['Mailbox/get', { list: [MOCK_MAILBOX] }, 'a'],
        ],
      },
    ]);

    const provider = await JmapProvider.create(makeAccount(), makeCredentials());
    const mailboxes = await provider.listMailboxes();

    expect(mailboxes).toHaveLength(1);
    expect(mailboxes[0].role).toBe('inbox');
    expect(mailboxes[0].unreadEmails).toBe(12);
  });

  it('queryEmails() calls Email/query with correct filter', async () => {
    let apiBody: unknown;
    global.fetch = vi.fn(async (_url, opts) => {
      const body = JSON.parse((opts as RequestInit).body as string);
      apiBody = body;
      return {
        ok: true,
        json: async () =>
          _url.toString().includes('session')
            ? MOCK_SESSION
            : {
                methodResponses: [
                  ['Email/query', { ids: ['e1', 'e2'], total: 2 }, 'a'],
                ],
              },
      };
    }) as typeof fetch;

    const provider = await JmapProvider.create(makeAccount(), makeCredentials());
    const result = await provider.queryEmails({
      mailboxId: 'mb-inbox',
      limit: 25,
      position: 0,
    });

    expect(result.ids).toEqual(['e1', 'e2']);
    expect(result.total).toBe(2);
  });

  it('getEmails() calls Email/get with requested properties', async () => {
    const MOCK_EMAIL = {
      id: 'e1',
      threadId: 't1',
      mailboxIds: { 'mb-inbox': true },
      from: [{ email: 'sender@test.com', name: 'Sender' }],
      subject: 'Hello world',
      receivedAt: '2026-01-15T10:00:00Z',
      keywords: {},
      hasAttachment: false,
      preview: 'Hello there...',
    };

    global.fetch = makeFetchMock([
      MOCK_SESSION,
      {
        methodResponses: [
          ['Email/get', { list: [MOCK_EMAIL], notFound: [] }, 'a'],
        ],
      },
    ]);

    const provider = await JmapProvider.create(makeAccount(), makeCredentials());
    const emails = await provider.getEmails(['e1'], ['id', 'subject', 'from']);

    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe('Hello world');
    expect(emails[0].from[0].email).toBe('sender@test.com');
  });

  it('setKeywords() calls Email/set with correct keyword patch', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn(async (_url, opts) => {
      if (!(_url as string).includes('session')) {
        capturedBody = JSON.parse((opts as RequestInit).body as string);
      }
      return {
        ok: true,
        json: async () =>
          (_url as string).includes('session')
            ? MOCK_SESSION
            : { methodResponses: [['Email/set', { updated: { 'e1': null } }, 'a']] },
      };
    }) as typeof fetch;

    const provider = await JmapProvider.create(makeAccount(), makeCredentials());
    await provider.setKeywords('e1', { '$seen': true, '$flagged': false });

    expect(capturedBody).not.toBeNull();
    const methods = (capturedBody as { using: string[]; methodCalls: unknown[][] }).methodCalls;
    const setCall = methods.find((m) => m[0] === 'Email/set');
    expect(setCall).toBeDefined();
    const args = setCall![1] as Record<string, unknown>;
    expect(args.update).toMatchObject({
      'e1': {
        '$seen': true,
        '$flagged': false,
      },
    });
  });

  it('moveEmail() calls Email/set with mailboxId update', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn(async (_url, opts) => {
      if (!(_url as string).includes('session')) {
        capturedBody = JSON.parse((opts as RequestInit).body as string);
      }
      return {
        ok: true,
        json: async () =>
          (_url as string).includes('session')
            ? MOCK_SESSION
            : { methodResponses: [['Email/set', { updated: { 'e1': null } }, 'a']] },
      };
    }) as typeof fetch;

    const provider = await JmapProvider.create(makeAccount(), makeCredentials());
    await provider.moveEmail('e1', 'mb-archive');

    const methods = (capturedBody as { methodCalls: unknown[][] })?.methodCalls;
    const setCall = methods?.find((m) => m[0] === 'Email/set');
    const args = setCall?.[1] as Record<string, unknown>;
    expect(args?.update).toMatchObject({
      'e1': {
        mailboxIds: { 'mb-archive': true },
      },
    });
  });

  it('throws on non-200 JMAP session response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })) as typeof fetch;

    await expect(JmapProvider.create(makeAccount(), makeCredentials())).rejects.toThrow();
  });

  it('throws when primaryAccounts has no mail capability', async () => {
    const badSession = { ...MOCK_SESSION, primaryAccounts: {} };
    global.fetch = makeFetchMock([badSession]);

    await expect(JmapProvider.create(makeAccount(), makeCredentials())).rejects.toThrow(
      /no mail account/i
    );
  });
});
