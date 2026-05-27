/**
 * Provider factory — unit tests
 *
 * Tests getMailProvider() routes to the correct provider class
 * based on provider_type, and that credentials are decrypted before use.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the crypto module so we don't need PLATFORM_ENCRYPTION_KEY in tests
vi.mock('@/lib/mail/crypto/credentials', () => ({
  decryptCredentials: vi.fn().mockResolvedValue({
    type: 'jmap',
    token: 'mock-token',
  }),
  encryptCredentials: vi.fn().mockResolvedValue('encrypted-mock'),
}));

// Mock providers
vi.mock('@/lib/mail/providers/jmap', () => ({
  JmapProvider: {
    create: vi.fn().mockResolvedValue({
      providerType: 'jmap',
      accountId: 'test-account',
    }),
  },
}));

vi.mock('@/lib/mail/providers/imap', () => ({
  ImapProvider: {
    create: vi.fn().mockResolvedValue({
      providerType: 'imap',
      accountId: 'test-account',
    }),
  },
}));

import { getMailProvider, isJmapProvider, isImapProvider } from '@/lib/mail/providers';
import { JmapProvider } from '@/lib/mail/providers/jmap';
import { ImapProvider } from '@/lib/mail/providers/imap';
import { decryptCredentials } from '@/lib/mail/crypto/credentials';

describe('getMailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseAccount = {
    id: 'acc-001',
    email_address: 'test@example.com',
    encrypted_credentials: 'base64-encrypted-blob',
  };

  it('routes jmap accounts to JmapProvider', async () => {
    const account = {
      ...baseAccount,
      provider_type: 'jmap' as const,
      jmap_session_url: 'https://mail.example.com/jmap/session/',
    };

    const provider = await getMailProvider(account);
    expect(provider.providerType).toBe('jmap');
    expect(JmapProvider.create).toHaveBeenCalled();
    expect(ImapProvider.create).not.toHaveBeenCalled();
  });

  it('routes imap accounts to ImapProvider', async () => {
    vi.mocked(decryptCredentials).mockResolvedValueOnce({
      type: 'imap',
      host: 'imap.test.com',
      port: 993,
      secure: true,
      username: 'test@test.com',
      password: 'pw',
      smtp_host: 'smtp.test.com',
      smtp_port: 587,
      smtp_secure: false,
    });

    const account = {
      ...baseAccount,
      provider_type: 'imap' as const,
    };

    const provider = await getMailProvider(account);
    expect(provider.providerType).toBe('imap');
    expect(ImapProvider.create).toHaveBeenCalled();
    expect(JmapProvider.create).not.toHaveBeenCalled();
  });

  it('decrypts credentials before constructing provider', async () => {
    const account = {
      ...baseAccount,
      provider_type: 'jmap' as const,
      jmap_session_url: 'https://mail.example.com/jmap/session/',
    };

    await getMailProvider(account);
    expect(decryptCredentials).toHaveBeenCalledWith('base64-encrypted-blob');
  });

  it('throws if jmap account has no jmap_session_url', async () => {
    const account = {
      ...baseAccount,
      provider_type: 'jmap' as const,
      jmap_session_url: undefined,
    };

    await expect(getMailProvider(account)).rejects.toThrow(/jmap_session_url/);
  });

  it('throws on unknown provider_type', async () => {
    const account = {
      ...baseAccount,
      provider_type: 'unknown' as 'jmap', // force bad type past TS
    };

    await expect(getMailProvider(account)).rejects.toThrow(/Unknown provider_type/);
  });
});

describe('type guards', () => {
  it('isJmapProvider returns true for jmap provider', () => {
    const mock = { providerType: 'jmap' as const } as ReturnType<typeof JmapProvider.create> extends Promise<infer T> ? T : never;
    expect(isJmapProvider(mock as Parameters<typeof isJmapProvider>[0])).toBe(true);
  });

  it('isImapProvider returns true for imap provider', () => {
    const mock = { providerType: 'imap' as const } as ReturnType<typeof ImapProvider.create> extends Promise<infer T> ? T : never;
    expect(isImapProvider(mock as Parameters<typeof isImapProvider>[0])).toBe(true);
  });

  it('isJmapProvider returns false for imap provider', () => {
    const mock = { providerType: 'imap' as const } as Parameters<typeof isJmapProvider>[0];
    expect(isJmapProvider(mock)).toBe(false);
  });
});
