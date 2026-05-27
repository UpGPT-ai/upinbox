/**
 * Tests for license JWT issuance and verification
 *
 * License JWTs are HMAC-SHA256 signed, domain-bound, and offline-verifiable.
 * A JWT issued for domain A must not verify for domain B.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Set up the signing key before import
process.env.UPINBOX_LICENSE_SIGNING_KEY = 'test-signing-key-32-bytes-long-00';

import { issueLicenseJwt, verifyLicenseJwt, decodeLicenseJwtUnsafe } from '@/lib/billing/license-jwt';

// ─── issueLicenseJwt ─────────────────────────────────────────────────────────

describe('issueLicenseJwt', () => {
  it('returns a three-part JWT string', async () => {
    const jwt = await issueLicenseJwt({
      tier: 'community',
      maxUsers: 10,
      features: ['byok', 'mcp'],
      instanceDomain: 'example.com',
    });
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
  });

  it('encodes tier and domain in payload', async () => {
    const jwt = await issueLicenseJwt({
      tier: 'business',
      maxUsers: 100,
      features: ['byok', 'mcp', 'intelligence-api'],
      instanceDomain: 'acme.com',
    });
    const payload = decodeLicenseJwtUnsafe(jwt);
    expect(payload?.tier).toBe('business');
    expect(payload?.instanceDomain).toBe('acme.com');
    expect(payload?.maxUsers).toBe(100);
  });

  it('sets correct expiry', async () => {
    const before = Date.now();
    const jwt = await issueLicenseJwt(
      { tier: 'community', maxUsers: 10, features: [], instanceDomain: 'test.com' },
      30 // 30 days
    );
    const after = Date.now();
    const payload = decodeLicenseJwtUnsafe(jwt);
    if (!payload) throw new Error('Null payload');

    const expiresAt = new Date(payload.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThan(after + 31 * 24 * 60 * 60 * 1000);
  });

  it('includes licenseId in payload', async () => {
    const jwt = await issueLicenseJwt({
      tier: 'enterprise',
      maxUsers: 999,
      features: ['byok', 'sso'],
      instanceDomain: 'bigcorp.com',
    });
    const payload = decodeLicenseJwtUnsafe(jwt);
    expect(payload?.licenseId).toBeTruthy();
    expect(typeof payload?.licenseId).toBe('string');
  });
});

// ─── verifyLicenseJwt ────────────────────────────────────────────────────────

describe('verifyLicenseJwt', () => {
  let validJwt: string;

  beforeAll(async () => {
    validJwt = await issueLicenseJwt({
      tier: 'business',
      maxUsers: 50,
      features: ['byok', 'intelligence-api'],
      instanceDomain: 'mycompany.com',
    }, 365);
  });

  it('verifies a valid JWT without domain check', async () => {
    const payload = await verifyLicenseJwt(validJwt);
    expect(payload).not.toBeNull();
    expect(payload?.tier).toBe('business');
  });

  it('verifies a valid JWT with matching domain', async () => {
    const payload = await verifyLicenseJwt(validJwt, 'mycompany.com');
    expect(payload).not.toBeNull();
  });

  it('REJECTS a valid JWT with mismatched domain', async () => {
    const payload = await verifyLicenseJwt(validJwt, 'evildomain.com');
    expect(payload).toBeNull(); // domain mismatch → invalid
  });

  it('REJECTS a tampered JWT', async () => {
    // Change a character in the signature
    const parts = validJwt.split('.');
    parts[2] = parts[2].slice(0, -2) + 'XX';
    const tampered = parts.join('.');
    const payload = await verifyLicenseJwt(tampered, 'mycompany.com');
    expect(payload).toBeNull();
  });

  it('REJECTS an expired JWT', async () => {
    const expiredJwt = await issueLicenseJwt(
      { tier: 'community', maxUsers: 1, features: [], instanceDomain: 'expired.com' },
      -1 // expired yesterday
    );
    const payload = await verifyLicenseJwt(expiredJwt, 'expired.com');
    expect(payload).toBeNull();
  });

  it('REJECTS a JWT with wrong signing key', async () => {
    // Issue with a different key, then verify with the original
    const originalKey = process.env.UPINBOX_LICENSE_SIGNING_KEY;
    process.env.UPINBOX_LICENSE_SIGNING_KEY = 'different-key-32-bytes-long-0000';
    const wrongKeyJwt = await issueLicenseJwt({
      tier: 'community', maxUsers: 1, features: [], instanceDomain: 'test.com',
    });
    process.env.UPINBOX_LICENSE_SIGNING_KEY = originalKey;
    const payload = await verifyLicenseJwt(wrongKeyJwt, 'test.com');
    expect(payload).toBeNull();
  });
});

// ─── decodeLicenseJwtUnsafe ───────────────────────────────────────────────────

describe('decodeLicenseJwtUnsafe', () => {
  it('decodes without verifying signature', async () => {
    const jwt = await issueLicenseJwt({
      tier: 'community',
      maxUsers: 5,
      features: ['byok'],
      instanceDomain: 'example.com',
      orgName: 'Acme Inc',
    });
    const payload = decodeLicenseJwtUnsafe(jwt);
    expect(payload?.orgName).toBe('Acme Inc');
    expect(payload?.tier).toBe('community');
  });

  it('returns null for invalid JWT format', () => {
    expect(decodeLicenseJwtUnsafe('not.a.jwt')).toBeNull();
    expect(decodeLicenseJwtUnsafe('')).toBeNull();
    expect(decodeLicenseJwtUnsafe('a.b')).toBeNull();
  });

  it('returns null for JWT with invalid base64 payload', () => {
    expect(decodeLicenseJwtUnsafe('header.!!!invalid!!!.sig')).toBeNull();
  });
});
