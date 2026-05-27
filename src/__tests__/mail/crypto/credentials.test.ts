import { describe, it, expect, beforeEach } from 'vitest';
import { encryptCredentials, decryptCredentials, rotateCredentials } from '@/lib/mail/crypto/credentials';
import type { ProviderCredentials } from '@/lib/mail/types';

const TEST_KEY = 'a'.repeat(64); // 32 bytes as hex

beforeEach(() => {
  process.env.PLATFORM_ENCRYPTION_KEY = TEST_KEY;
});

const jmapCreds: ProviderCredentials = {
  type: 'jmap',
  sessionUrl: 'https://jmap.fastmail.com/.well-known/jmap',
  token: 'Bearer test-token-abc123',
};

const imapCreds: ProviderCredentials = {
  type: 'imap',
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  imapTls: true,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpTls: true,
  username: 'user@gmail.com',
  password: 'app-password-xyz',
};

describe('encryptCredentials / decryptCredentials', () => {
  it('round-trips JMAP credentials', async () => {
    const enc = await encryptCredentials(jmapCreds);
    expect(typeof enc).toBe('string');
    expect(enc.length).toBeGreaterThan(40);

    const dec = await decryptCredentials(enc);
    expect(dec).toEqual(jmapCreds);
  });

  it('round-trips IMAP credentials', async () => {
    const enc = await encryptCredentials(imapCreds);
    const dec = await decryptCredentials(enc);
    expect(dec).toEqual(imapCreds);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const enc1 = await encryptCredentials(jmapCreds);
    const enc2 = await encryptCredentials(jmapCreds);
    expect(enc1).not.toBe(enc2);
  });

  it('throws on wrong key', async () => {
    const enc = await encryptCredentials(jmapCreds);
    process.env.PLATFORM_ENCRYPTION_KEY = 'b'.repeat(64);
    await expect(decryptCredentials(enc)).rejects.toThrow('Failed to decrypt');
  });

  it('throws on missing key', async () => {
    delete process.env.PLATFORM_ENCRYPTION_KEY;
    await expect(encryptCredentials(jmapCreds)).rejects.toThrow('PLATFORM_ENCRYPTION_KEY is not set');
  });

  it('throws on corrupted blob', async () => {
    await expect(decryptCredentials('not-valid-base64!!!')).rejects.toThrow();
  });
});

describe('rotateCredentials', () => {
  it('re-encrypts with new key, old key cannot decrypt', async () => {
    const oldKey = TEST_KEY;
    const newKey = 'c'.repeat(64);

    const enc = await encryptCredentials(jmapCreds);
    const rotated = await rotateCredentials(enc, newKey);

    // Rotated blob should be decryptable with new key
    process.env.PLATFORM_ENCRYPTION_KEY = newKey;
    const dec = await decryptCredentials(rotated);
    expect(dec).toEqual(jmapCreds);

    // Old key should not decrypt rotated blob
    process.env.PLATFORM_ENCRYPTION_KEY = oldKey;
    await expect(decryptCredentials(rotated)).rejects.toThrow('Failed to decrypt');
  });
});
