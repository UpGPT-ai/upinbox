/**
 * UpLink License Verifier
 * =======================
 *
 * TLDR: This module is the PAYWALL ENFORCEMENT POINT for UpInbox Pro features.
 *
 * UpInbox is open-source / self-hostable. Anyone can run their own UpInbox
 * server (mail.upinbox.ai is just the hosted flavor). However, Pro features
 * (UpLink Pro tier and above) must only be unlockable by users who have paid
 * for an UpLink license.
 *
 * How this works:
 *   1. The UpLink license server holds a PRIVATE ES256 (ECDSA P-256) key.
 *   2. When a user purchases UpLink Pro / Team, the license server signs a
 *      short-lived JWT containing { sub, tier, exp, iat, iss: 'uplink' }.
 *   3. The mobile UpLink client presents that JWT to whatever UpInbox
 *      instance it is connecting to (hosted OR self-hosted) via the
 *      `Authorization: Bearer <jwt>` header.
 *   4. The receiving UpInbox instance verifies the JWT OFFLINE using the
 *      PUBLIC key embedded in this file. No call to the license server is
 *      required. This means self-hosters get the same verification path as
 *      the hosted service — and crucially, they CANNOT forge Pro tokens
 *      because they do not hold the private key.
 *
 * In short: self-hosters can run UpInbox forever for free, but only the
 * real UpLink license server can grant Pro entitlement to a connecting
 * client. The cryptography enforces this — not a license file, not a
 * remote check, not a flag in a database.
 *
 * Implementation note: uses Node's built-in `crypto` module (no external
 * JWT library). Implements just enough JWT (header + payload + ES256
 * signature) for our verification needs.
 */

import {
  createPublicKey,
  createVerify,
  type KeyObject,
} from 'crypto';

// -----------------------------------------------------------------------------
// Embedded public key (placeholder — replace at deploy time with the real
// UpLink license server's P-256 public key).
// -----------------------------------------------------------------------------
const UPLINK_PUBLIC_KEY_PEM =
  '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_REPLACE_WITH_REAL_KEY_AT_DEPLOY\n-----END PUBLIC KEY-----';

const PLACEHOLDER_MARKER = '_REPLACE_WITH_REAL_KEY_AT_DEPLOY';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------
export type UplinkTier = 'free' | 'plus' | 'pro' | 'team';

export interface UplinkLicense {
  userId: string;
  tier: UplinkTier;
  /** Unix timestamp in SECONDS (matches JWT `exp` semantics). */
  expiresAt: number;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/**
 * Lazily build a KeyObject from the embedded PEM. Returns null if the PEM is
 * still the placeholder — callers use this signal to decide whether to fall
 * back to dev mode.
 */
let cachedKey: KeyObject | null = null;
let cachedKeyAttempted = false;
function getPublicKey(): KeyObject | null {
  if (cachedKeyAttempted) return cachedKey;
  cachedKeyAttempted = true;
  if (UPLINK_PUBLIC_KEY_PEM.includes(PLACEHOLDER_MARKER)) {
    return null;
  }
  try {
    cachedKey = createPublicKey(UPLINK_PUBLIC_KEY_PEM);
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

function isPlaceholderKey(): boolean {
  return UPLINK_PUBLIC_KEY_PEM.includes(PLACEHOLDER_MARKER);
}

function devModeEnabled(): boolean {
  return process.env.UPLINK_LICENSE_DEV_MODE === 'true';
}

function base64UrlDecode(input: string): Buffer {
  // pad
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const b64 =
    input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return Buffer.from(b64, 'base64');
}

/**
 * ES256 produces a 64-byte raw signature (r||s, 32 bytes each). Node's
 * crypto.verify expects DER-encoded ECDSA signatures. Convert raw → DER.
 */
function rawEcSigToDer(raw: Buffer): Buffer | null {
  if (raw.length !== 64) return null;
  const r = raw.subarray(0, 32);
  const s = raw.subarray(32, 64);

  const trim = (buf: Buffer): Buffer => {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0x00) i++;
    let out = buf.subarray(i);
    // If the high bit is set, prepend 0x00 so it's interpreted as positive.
    if (out[0] & 0x80) out = Buffer.concat([Buffer.from([0x00]), out]);
    return out;
  };

  const rTrim = trim(r);
  const sTrim = trim(s);

  const seqLen = 2 + rTrim.length + 2 + sTrim.length;
  return Buffer.concat([
    Buffer.from([0x30, seqLen]),
    Buffer.from([0x02, rTrim.length]),
    rTrim,
    Buffer.from([0x02, sTrim.length]),
    sTrim,
  ]);
}

interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

function parseJwt(jwt: string): JwtParts | null {
  if (typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(h).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(p).toString('utf8'));
  } catch {
    return null;
  }
  const signature = base64UrlDecode(s);
  return { header, payload, signingInput: `${h}.${p}`, signature };
}

function isValidTier(t: unknown): t is UplinkTier {
  return t === 'free' || t === 'plus' || t === 'pro' || t === 'team';
}

function payloadToLicense(
  payload: Record<string, unknown>,
): UplinkLicense | null {
  const sub = payload['sub'];
  const tier = payload['tier'];
  const exp = payload['exp'];
  const iss = payload['iss'];

  if (typeof sub !== 'string' || sub.length === 0) return null;
  if (!isValidTier(tier)) return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  if (iss !== 'uplink') return null;

  return { userId: sub, tier, expiresAt: exp };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Verify an UpLink-issued license JWT.
 *
 * Returns the decoded license on success, or null if the token is malformed,
 * expired, has an invalid signature, or has an unexpected issuer/tier.
 *
 * Dev mode: if the embedded public key is still the placeholder AND
 * `UPLINK_LICENSE_DEV_MODE=true` is set in the environment, signature
 * verification is skipped. A warning is logged once per call. This is for
 * development only — production deploys MUST replace the placeholder PEM.
 */
export function verifyUplinkLicense(jwt: string): UplinkLicense | null {
  const parsed = parseJwt(jwt);
  if (!parsed) return null;

  // Require ES256 header.
  if (parsed.header['alg'] !== 'ES256') {
    // Allow dev mode to bypass header check too, since dev tokens may be
    // signed with HS256 or unsigned ("none").
    if (!(isPlaceholderKey() && devModeEnabled())) {
      return null;
    }
  }

  const license = payloadToLicense(parsed.payload);
  if (!license) return null;

  // Expiry check (always enforced, even in dev mode).
  const nowSec = Math.floor(Date.now() / 1000);
  if (license.expiresAt <= nowSec) return null;

  const key = getPublicKey();

  if (!key) {
    // Public key is the placeholder. Fall back to dev mode if enabled.
    if (isPlaceholderKey() && devModeEnabled()) {
      // eslint-disable-next-line no-console
      console.warn(
        '[uplink-license] DEV MODE: accepting JWT without signature ' +
          'verification because UPLINK_PUBLIC_KEY_PEM is still the ' +
          'placeholder. DO NOT run this configuration in production.',
      );
      return license;
    }
    // Placeholder key and no dev mode → refuse to accept any token.
    return null;
  }

  // Real signature verification.
  const derSig = rawEcSigToDer(parsed.signature);
  if (!derSig) return null;

  let ok = false;
  try {
    const verifier = createVerify('sha256');
    verifier.update(parsed.signingInput);
    verifier.end();
    ok = verifier.verify(key, derSig);
  } catch {
    return null;
  }
  if (!ok) return null;

  return license;
}

/**
 * Returns true if the given license grants Pro-level entitlement
 * (tier === 'pro' or 'team') and has not expired.
 */
export function hasProEntitlement(license: UplinkLicense | null): boolean {
  if (!license) return false;
  if (license.tier !== 'pro' && license.tier !== 'team') return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (license.expiresAt <= nowSec) return false;
  return true;
}

/**
 * Extract and verify an UpLink license from an incoming Request's
 * `Authorization: Bearer <jwt>` header, and require Pro entitlement.
 *
 * Returns a discriminated result so callers can return the appropriate
 * HTTP response without duplicating header-parsing logic.
 */
export function requireProFromRequest(
  request: Request,
):
  | { ok: true; license: UplinkLicense }
  | { ok: false; reason: string } {
  const authHeader =
    request.headers.get('authorization') ??
    request.headers.get('Authorization');

  if (!authHeader) {
    return { ok: false, reason: 'missing_authorization_header' };
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    return { ok: false, reason: 'malformed_authorization_header' };
  }

  const token = match[1].trim();
  if (!token) {
    return { ok: false, reason: 'empty_bearer_token' };
  }

  const license = verifyUplinkLicense(token);
  if (!license) {
    return { ok: false, reason: 'invalid_or_expired_license' };
  }

  if (!hasProEntitlement(license)) {
    return { ok: false, reason: 'pro_entitlement_required' };
  }

  return { ok: true, license };
}
