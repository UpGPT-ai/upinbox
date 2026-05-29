/**
 * UpGPT.ai License Verifier
 * ==========================
 *
 * UpGPT.ai is the SINGLE billing and entitlement authority for every UpGPT
 * product surface — UpInbox (free + paid features), UpLink paid features,
 * the UpGPT platform itself, and any future composable product.
 *
 * How it works
 * ------------
 * The UpGPT.ai license server holds a PRIVATE ECDSA P-256 key. When a user
 * purchases or renews a plan, the server signs a JWT (ES256) describing the
 * capabilities they have unlocked.  The corresponding PUBLIC key is embedded
 * in this module so any UpInbox deployment — whether hosted at upinbox.ai or
 * self-hosted on a customer's hardware — can verify the JWT entirely offline.
 *
 * This module is the offline verification point.  Hosted and self-hosted
 * UpInbox instances run the EXACT same code path and reach the EXACT same
 * conclusion about whether a JWT is valid.  There is no network call to a
 * license API and no server-side allowlist that a self-hoster could bypass.
 *
 * Why this matters
 * ----------------
 * Self-hosters cannot forge entitlements.  Only the UpGPT.ai license server,
 * which holds the private key, can issue JWTs that pass verification here.
 * Patching this module to skip verification is detectable (signature mismatch
 * propagates to UpGPT.ai-issued audit events) and self-defeating (a forked
 * verifier no longer receives signed capability updates).
 *
 * In short: the UpGPT paywall is cryptographic, not server-side.  Anything
 * gated on `hasCapability(...)` is gated by a real signature, not by a
 * conditional that lives on a server we control.
 *
 * Capability model
 * ----------------
 * The JWT payload uses a capabilities ARRAY, not a tier string.  This matches
 * UpGPT's composable pricing: a user might own `email + byok` without
 * `native_mobile`, or `mcp + team` without `email`.  Known capabilities:
 *
 *   - 'email'          UpInbox is unlocked
 *   - 'mcp'            MCP server access
 *   - 'byok'           Bring-Your-Own-Key models
 *   - 'native_mobile'  UpLink native mobile gated features
 *   - 'team'           Team management / multi-seat
 *
 * The list is open-ended; new capabilities are added by the UpGPT.ai license
 * server without requiring a client update.
 */

import {
  createPublicKey,
  createVerify,
  type KeyObject,
} from 'node:crypto';

// ---------------------------------------------------------------------------
// Embedded UpGPT.ai license-server public key (ECDSA P-256, SPKI/PEM).
// REPLACE AT DEPLOY: the placeholder below is a marker, not a real key.
// ---------------------------------------------------------------------------
export const UPGPT_PUBLIC_KEY_PEM =
  '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_PLACEHOLDER_REPLACE_AT_DEPLOY\n-----END PUBLIC KEY-----';

const PLACEHOLDER_MARKER = '_PLACEHOLDER_REPLACE_AT_DEPLOY';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UpGPTLicense {
  userId: string;
  capabilities: string[];
  plan: string;
  expiresAt: number; // unix seconds
  raw: object;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Base64url decode → Buffer. Tolerates missing padding. */
function b64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

/**
 * Convert a JWS raw R||S signature (64 bytes for P-256) into the DER-encoded
 * ECDSA signature that Node's crypto verifier expects.
 */
function joseToDer(jose: Buffer): Buffer {
  if (jose.length !== 64) {
    throw new Error('invalid ES256 signature length');
  }
  const r = jose.subarray(0, 32);
  const s = jose.subarray(32, 64);

  const trim = (b: Buffer): Buffer => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let out = b.subarray(i);
    // If high bit is set, prepend 0x00 so the integer stays positive.
    if (out[0]! & 0x80) out = Buffer.concat([Buffer.from([0]), out]);
    return out;
  };

  const rT = trim(r);
  const sT = trim(s);
  const seqLen = 2 + rT.length + 2 + sT.length;

  return Buffer.concat([
    Buffer.from([0x30, seqLen]),
    Buffer.from([0x02, rT.length]),
    rT,
    Buffer.from([0x02, sT.length]),
    sT,
  ]);
}

let cachedKey: KeyObject | null = null;
function getPublicKey(): KeyObject {
  if (cachedKey) return cachedKey;
  cachedKey = createPublicKey({ key: UPGPT_PUBLIC_KEY_PEM, format: 'pem' });
  return cachedKey;
}

function isPlaceholderKey(): boolean {
  return UPGPT_PUBLIC_KEY_PEM.includes(PLACEHOLDER_MARKER);
}

function isDevModeAccepted(): boolean {
  return (
    process.env.UPGPT_LICENSE_DEV_MODE === 'true' && isPlaceholderKey()
  );
}

let devWarningEmitted = false;
function emitDevWarningOnce(): void {
  if (devWarningEmitted) return;
  devWarningEmitted = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[upgpt-license] DEV MODE ACTIVE: accepting unsigned JWTs because ' +
      'UPGPT_LICENSE_DEV_MODE=true and the embedded public key is the ' +
      'placeholder. This MUST NOT be enabled in production.'
  );
}

interface ParsedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

function parseJwt(jwt: string): ParsedJwt | null {
  if (typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  if (!h || !p || !s) return null;
  try {
    const header = JSON.parse(b64urlToBuffer(h).toString('utf8')) as Record<
      string,
      unknown
    >;
    const payload = JSON.parse(b64urlToBuffer(p).toString('utf8')) as Record<
      string,
      unknown
    >;
    const signature = b64urlToBuffer(s);
    return { header, payload, signingInput: `${h}.${p}`, signature };
  } catch {
    return null;
  }
}

function payloadToLicense(
  payload: Record<string, unknown>
): UpGPTLicense | null {
  const sub = payload['sub'];
  const capabilities = payload['capabilities'];
  const plan = payload['plan'];
  const exp = payload['exp'];

  if (typeof sub !== 'string' || sub.length === 0) return null;
  if (!Array.isArray(capabilities)) return null;
  if (!capabilities.every((c): c is string => typeof c === 'string')) {
    return null;
  }
  if (typeof plan !== 'string') return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (exp <= nowSec) return null;

  return {
    userId: sub,
    capabilities,
    plan,
    expiresAt: exp,
    raw: payload,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a UpGPT.ai-issued license JWT.
 *
 * Returns the decoded license on success, or `null` for any failure mode
 * (malformed token, wrong algorithm, bad signature, expired, missing
 * required claims, or wrong issuer).  Never throws.
 */
export function verifyUpGPTLicense(jwt: string): UpGPTLicense | null {
  const parsed = parseJwt(jwt);
  if (!parsed) return null;

  const { header, payload, signingInput, signature } = parsed;

  // Issuer must be 'upgpt' regardless of mode.
  if (payload['iss'] !== 'upgpt') return null;

  // Dev-mode fallback: accept any well-formed JWT, skip signature check.
  if (isDevModeAccepted()) {
    emitDevWarningOnce();
    return payloadToLicense(payload);
  }

  // Production path: enforce ES256.
  if (header['alg'] !== 'ES256') return null;
  if (header['typ'] !== undefined && header['typ'] !== 'JWT') return null;

  try {
    const key = getPublicKey();
    const der = joseToDer(signature);
    const verifier = createVerify('SHA256');
    verifier.update(signingInput);
    verifier.end();
    const ok = verifier.verify(
      { key, dsaEncoding: 'der' },
      der
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  return payloadToLicense(payload);
}

/**
 * True iff `license` is non-null and its capability array contains `cap`.
 * Safe to call with `null` so callers can chain `hasCapability(verify(...), 'email')`.
 */
export function hasCapability(
  license: UpGPTLicense | null,
  cap: string
): boolean {
  if (!license) return false;
  return license.capabilities.includes(cap);
}

/**
 * Extract a bearer token from `Authorization: Bearer <jwt>`, verify it, and
 * return the resulting license — or `null` if the header is missing,
 * malformed, or the token does not verify.
 */
export function getLicenseFromRequest(request: Request): UpGPTLicense | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1]?.trim();
  if (!token) return null;
  return verifyUpGPTLicense(token);
}
