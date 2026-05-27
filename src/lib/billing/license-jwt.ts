/**
 * Self-Host License JWT
 *
 * License JWTs are Ed25519-signed tokens issued by UpInbox for self-hosted
 * Business and Enterprise customers. They encode:
 *   - tier (business | enterprise)
 *   - maxUsers (seat count)
 *   - instanceDomain (bound to a specific domain — cannot be moved)
 *   - features (array of enabled feature flags)
 *   - issuedAt / expiresAt (annual renewal)
 *
 * Verification:
 *   - Self-hosted instance verifies JWT signature using UpInbox's public key
 *   - Domain binding: instanceDomain in JWT must match X-Instance-Domain header
 *   - No call-home required — fully offline verification
 *
 * The signing key (UPINBOX_LICENSE_SIGNING_KEY) is kept server-side only.
 * The verification key (UPINBOX_LICENSE_PUBLIC_KEY) is embedded in the Docker image.
 */

export interface LicensePayload {
  licenseId: string;
  tier: 'community' | 'business' | 'enterprise';
  maxUsers: number;
  features: string[];
  instanceDomain: string;
  issuedAt: string;
  expiresAt: string;
  // Optional: customer info (not used for auth, just for support)
  orgName?: string;
  contactEmail?: string;
}

/**
 * Issue a license JWT. SERVER SIDE ONLY — signing key required.
 *
 * Signs with HMAC-SHA256 (using the UPINBOX_LICENSE_SIGNING_KEY env var).
 * For production, replace with Ed25519 via the `jose` package.
 */
export async function issueLicenseJwt(
  payload: Omit<LicensePayload, 'licenseId' | 'issuedAt' | 'expiresAt'>,
  expiresInDays = 365
): Promise<string> {
  const signingKey = process.env.UPINBOX_LICENSE_SIGNING_KEY;
  if (!signingKey) throw new Error('UPINBOX_LICENSE_SIGNING_KEY not configured');

  const now = new Date();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const fullPayload: LicensePayload = {
    licenseId: crypto.randomUUID(),
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...payload,
  };

  // Simple JWT: base64url(header).base64url(payload).base64url(signature)
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(fullPayload));
  const toSign = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  const sigB64 = Buffer.from(sig).toString('base64url');

  return `${toSign}.${sigB64}`;
}

/**
 * Verify a license JWT and return the payload.
 * Returns null if invalid, expired, or domain mismatch.
 *
 * Uses UPINBOX_LICENSE_SIGNING_KEY for HMAC verification.
 * In production self-host, the Docker image contains only the public key.
 */
export async function verifyLicenseJwt(
  jwt: string,
  expectedDomain?: string
): Promise<LicensePayload | null> {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const toVerify = `${headerB64}.${payloadB64}`;

    const signingKey = process.env.UPINBOX_LICENSE_SIGNING_KEY;
    if (!signingKey) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(signingKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = Buffer.from(sigB64, 'base64url');
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(toVerify)
    );

    if (!valid) return null;

    const payload: LicensePayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    );

    // Check expiry
    if (new Date(payload.expiresAt) < new Date()) return null;

    // Domain binding check
    if (expectedDomain && payload.instanceDomain !== expectedDomain) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Quick decode without verification — for displaying license info in UI.
 * NEVER use for access control decisions.
 */
export function decodeLicenseJwtUnsafe(jwt: string): LicensePayload | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

function base64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}
