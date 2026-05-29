import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  verifyUpGPTLicense,
  hasCapability,
  getLicenseFromRequest,
} from '@/lib/billing/upgpt-license';

/**
 * Helper: construct a well-formed (but unsigned/fake-signed) JWT for tests.
 * Format: header.payload.signature — all base64url-encoded.
 */
function makeJwt(payload: Record<string, unknown>, signature = 'sig'): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64(header)}.${b64(payload)}.${signature}`;
}

describe('upgpt-license: verifyUpGPTLicense', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null for malformed JWT', async () => {
    const result = await verifyUpGPTLicense('not-a-jwt');
    expect(result).toBeNull();
  });

  it('returns null for expired JWT', async () => {
    vi.stubEnv('UPGPT_LICENSE_DEV_MODE', 'true');
    const expiredJwt = makeJwt({
      sub: 'user-123',
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      capabilities: ['upinbox.send'],
    });
    const result = await verifyUpGPTLicense(expiredJwt);
    expect(result).toBeNull();
  });

  it('accepts any well-formed JWT in dev mode', async () => {
    vi.stubEnv('UPGPT_LICENSE_DEV_MODE', 'true');
    const jwt = makeJwt({
      sub: 'user-123',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      capabilities: ['upinbox.send', 'upinbox.read'],
      tier: 'pro',
    });
    const result = await verifyUpGPTLicense(jwt);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe('user-123');
    expect(result?.capabilities).toContain('upinbox.send');
  });
});

describe('upgpt-license: hasCapability', () => {
  it('returns true when capability is in license', () => {
    const license = {
      sub: 'user-123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      capabilities: ['upinbox.send', 'upinbox.read'],
    };
    expect(hasCapability(license, 'upinbox.send')).toBe(true);
  });

  it('returns false when license is null', () => {
    expect(hasCapability(null, 'upinbox.send')).toBe(false);
  });

  it('returns false when capability not in array', () => {
    const license = {
      sub: 'user-123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      capabilities: ['upinbox.read'],
    };
    expect(hasCapability(license, 'upinbox.send')).toBe(false);
  });
});

describe('upgpt-license: getLicenseFromRequest', () => {
  it('extracts Bearer token from Authorization header', () => {
    const request = new Request('http://localhost/test', {
      headers: {
        Authorization: 'Bearer abc.def.ghi',
      },
    });
    const token = getLicenseFromRequest(request);
    expect(token).toBe('abc.def.ghi');
  });

  it('returns null when header missing', () => {
    const request = new Request('http://localhost/test');
    const token = getLicenseFromRequest(request);
    expect(token).toBeNull();
  });
});
