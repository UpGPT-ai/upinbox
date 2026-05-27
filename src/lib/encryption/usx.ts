/**
 * USX — UpInbox Secure Exchange Protocol
 *
 * USX enables end-to-end encrypted message delivery between UpInbox users,
 * regardless of whether they use the same mail server.
 *
 * How it works:
 *   1. Alice wants to send a USX message to bob@example.com
 *   2. Alice's client does a DNS TXT lookup: _upinbox.example.com
 *      → finds: v=USX1; endpoint=https://example.com/api/upinbox/usx; fp=sha256:XXXX
 *   3. Alice's client looks up Bob's public key via that endpoint
 *   4. Alice encrypts the message with Bob's public key + her signing key
 *   5. Alice sends the ciphertext to Bob's USX endpoint
 *   6. Bob's server stores the ciphertext in upinbox.usx_inbox
 *   7. Bob's client decrypts on the fly — server never sees plaintext
 *
 * DNS record format:
 *   _upinbox.{domain} TXT "v=USX1; endpoint={url}; fp=sha256:{fingerprint}"
 *
 * This module handles:
 *   - DNS TXT lookup (via DoH — DNS-over-HTTPS for privacy)
 *   - USX record parsing and validation
 *   - Recipient public key discovery
 *   - Send / receive (the encryption itself is in keys.ts)
 */

export interface UsxRecord {
  version: 'USX1';
  endpoint: string;
  fingerprint: string;
  domain: string;
}

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

/**
 * Discover the USX record for a domain via DNS-over-HTTPS.
 * Returns null if the domain does not advertise USX support.
 *
 * Cached results are stored in upinbox.usx_cache (server-side).
 */
export async function discoverUsxRecord(domain: string): Promise<UsxRecord | null> {
  try {
    const url = new URL(DOH_ENDPOINT);
    url.searchParams.set('name', `_upinbox.${domain}`);
    url.searchParams.set('type', 'TXT');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/dns-json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const answers: Array<{ data: string }> = data.Answer ?? [];

    for (const answer of answers) {
      const record = parseUsxTxtRecord(answer.data, domain);
      if (record) return record;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a DNS TXT record value into a UsxRecord.
 * Returns null if the record is not a valid USX record.
 */
function parseUsxTxtRecord(txtValue: string, domain: string): UsxRecord | null {
  // DNS TXT records may be wrapped in quotes
  const cleaned = txtValue.replace(/^"|"$/g, '').trim();
  if (!cleaned.startsWith('v=USX1')) return null;

  const params: Record<string, string> = {};
  for (const part of cleaned.split(';')) {
    const [key, value] = part.trim().split('=');
    if (key && value) params[key.trim()] = value.trim();
  }

  if (!params.endpoint || !params.fp) return null;

  try {
    new URL(params.endpoint); // validate URL
  } catch {
    return null;
  }

  return {
    version: 'USX1',
    endpoint: params.endpoint,
    fingerprint: params.fp,
    domain,
  };
}

/**
 * Fetch the public key for a USX user from their endpoint.
 *
 * GET {endpoint}/public-key?email={email}
 * → { publicKey: "-----BEGIN PGP PUBLIC KEY BLOCK-----..." }
 */
export async function fetchUsxPublicKey(
  usxRecord: UsxRecord,
  email: string
): Promise<string | null> {
  try {
    const url = new URL(`${usxRecord.endpoint}/public-key`);
    url.searchParams.set('email', email);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-USX-Version': '1',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a USX ciphertext message to a recipient's endpoint.
 *
 * POST {endpoint}/receive
 * Body: { from, to, ciphertext, nonce }
 * Response: { messageId }
 */
export async function sendUsxMessage(
  usxRecord: UsxRecord,
  opts: {
    from: string;          // sender's email address
    to: string;            // recipient's email address
    ciphertext: string;    // OpenPGP armored encrypted message
    nonce: string;         // random string for deduplication
  }
): Promise<{ messageId: string } | null> {
  try {
    const response = await fetch(`${usxRecord.endpoint}/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-USX-Version': '1',
      },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Check if a recipient supports USX.
 * Used to show the USX badge in the compose window.
 *
 * @param email - Recipient's email address
 * @returns UsxRecord if USX is supported, null if not
 */
export async function checkUsxSupport(email: string): Promise<UsxRecord | null> {
  const domain = email.split('@')[1];
  if (!domain) return null;
  return discoverUsxRecord(domain);
}

/**
 * Generate a DNS TXT record for the user's domain.
 * Shown during self-hosting setup to configure USX.
 */
export function generateUsxDnsRecord(opts: {
  domain: string;
  endpoint: string;
  publicKeyFingerprint: string;
}): string {
  return `_upinbox.${opts.domain} TXT "v=USX1; endpoint=${opts.endpoint}; fp=sha256:${opts.publicKeyFingerprint}"`;
}
