/**
 * Credential encryption for stored IMAP/JMAP credentials.
 *
 * Uses AES-256-GCM with a key derived from PLATFORM_ENCRYPTION_KEY (org-managed env var).
 * UpInbox never holds this key in SaaS — it is provided by the self-hosting org's environment.
 *
 * Encryption: AES-256-GCM with random 12-byte IV per operation.
 * Output format: base64(iv || ciphertext || authTag) — all concatenated, no JSON wrapper.
 */

import type { ProviderCredentials } from '@/lib/mail/types';

const ALG = 'AES-GCM';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12;  // GCM standard
const TAG_BYTES = 16; // GCM auth tag

/**
 * Derive a CryptoKey from the PLATFORM_ENCRYPTION_KEY env var.
 * Throws clearly if the key is missing or wrong length.
 */
async function getWrappingKey(): Promise<CryptoKey> {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'PLATFORM_ENCRYPTION_KEY is not set. ' +
      'Generate one with: openssl rand -hex 32 ' +
      'Self-hosting: this key is yours — UpInbox never sees it.',
    );
  }

  // Accept either hex (64 chars) or base64 (44 chars for 32 bytes)
  let keyBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    keyBytes = new Uint8Array(Buffer.from(raw, 'hex'));
  } else {
    keyBytes = new Uint8Array(Buffer.from(raw, 'base64'));
  }

  if (keyBytes.length !== KEY_BYTES) {
    throw new Error(
      `PLATFORM_ENCRYPTION_KEY must be 32 bytes (got ${keyBytes.length}). ` +
      'Generate: openssl rand -hex 32',
    );
  }

  return crypto.subtle.importKey('raw', keyBytes, { name: ALG }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt provider credentials before storing in the database.
 * Returns a base64 string: iv (12 bytes) + ciphertext + authTag (16 bytes).
 */
export async function encryptCredentials(credentials: ProviderCredentials): Promise<string> {
  const key = await getWrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));

  const cipherBuf = await crypto.subtle.encrypt({ name: ALG, iv }, key, plaintext);
  // cipherBuf contains ciphertext + 16-byte auth tag concatenated
  const result = new Uint8Array(IV_BYTES + cipherBuf.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(cipherBuf), IV_BYTES);

  return Buffer.from(result).toString('base64');
}

/**
 * Decrypt credentials loaded from the database.
 * Throws if the auth tag doesn't match (tampered data or wrong key).
 */
export async function decryptCredentials(enc: string): Promise<ProviderCredentials> {
  const key = await getWrappingKey();
  const buf = new Uint8Array(Buffer.from(enc, 'base64'));

  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Encrypted credential blob is too short — data may be corrupted.');
  }

  const iv = buf.slice(0, IV_BYTES);
  const ciphertext = buf.slice(IV_BYTES); // includes the 16-byte auth tag

  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: ALG, iv }, key, ciphertext);
  } catch {
    throw new Error(
      'Failed to decrypt credentials — wrong PLATFORM_ENCRYPTION_KEY or corrupted data.',
    );
  }

  const json = new TextDecoder().decode(plainBuf);
  return JSON.parse(json) as ProviderCredentials;
}

/**
 * Rotate credentials to a new key.
 * Call this during PLATFORM_ENCRYPTION_KEY rotation to re-encrypt existing blobs.
 */
export async function rotateCredentials(
  enc: string,
  newKeyHex: string,
): Promise<string> {
  // Decrypt with current key
  const credentials = await decryptCredentials(enc);

  // Re-encrypt with new key
  const prevKey = process.env.PLATFORM_ENCRYPTION_KEY;
  process.env.PLATFORM_ENCRYPTION_KEY = newKeyHex;
  const result = await encryptCredentials(credentials);
  process.env.PLATFORM_ENCRYPTION_KEY = prevKey;

  return result;
}
