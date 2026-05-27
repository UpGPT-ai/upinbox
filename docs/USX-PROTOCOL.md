# USX Protocol — UpInbox Secure Exchange

> **Version:** USX1 — May 2026
> **Status:** Implemented in UpInbox v1.0+

USX (UpInbox Secure Exchange) is a DNS-based discovery and encrypted delivery protocol that enables end-to-end encrypted email between UpInbox users without requiring manual key exchange. When both sender and recipient have USX configured, a 🔒 badge appears in the UI confirming that the message is encrypted in the browser before it leaves the sender's device.

This document is the protocol specification. The reference implementation is in `src/lib/usx/` (MIT license).

---

## Table of Contents

1. [Overview and Motivation](#1-overview-and-motivation)
2. [DNS Discovery](#2-dns-discovery)
3. [Trust Indicators](#3-trust-indicators)
4. [End-to-End Delivery Flow](#4-end-to-end-delivery-flow)
5. [Envelope Format](#5-envelope-format)
6. [Signature Scheme](#6-signature-scheme)
7. [IMAP Relay for Gmail/Outlook Users](#7-imap-relay-for-gmailoutlook-users)
8. [USX Endpoint Reference](#8-usx-endpoint-reference)
9. [Fallback Behavior](#9-fallback-behavior)
10. [USX vs S/MIME and PGP Email](#10-usx-vs-smime-and-pgp-email)
11. [Setting Up USX for Your Domain](#11-setting-up-usx-for-your-domain)
12. [Security Considerations](#12-security-considerations)
13. [Protocol Versioning](#13-protocol-versioning)

---

## 1. Overview and Motivation

### The Problem With Existing Encrypted Email

**S/MIME** requires a certificate from a CA, typically costs money, and requires out-of-band key exchange before the first encrypted message. Key discovery is not standardized — you must manually import the recipient's certificate.

**PGP over email** requires both parties to manage keys, share public keys out-of-band, and use compatible clients. Most email clients do not support it. The UX friction has kept adoption near zero for 30+ years.

**Signal / WhatsApp / iMessage** work great for encrypted messaging but are not email — they don't integrate with existing workflows, archives, or email addresses.

### What USX Does Differently

USX makes encrypted email work automatically, as long as both parties use UpInbox (or any USX-compatible client):

1. **No manual key exchange:** Public keys are published in the UpInbox public key directory and linked via DNS. No ceremony required.
2. **DNS-verified endpoints:** The sender looks up the recipient's USX endpoint via a DNS TXT record, which also includes a certificate fingerprint for TOFU (Trust On First Use) pinning.
3. **Standard email addresses:** You send to `bob@example.com` — no special address format, no `:secure` suffix.
4. **Automatic fallback:** If the recipient doesn't have USX, the message falls back to standard SMTP. No broken delivery.
5. **Relay support:** Gmail and Outlook users can participate in USX as senders and recipients via the UpInbox relay — their provider never sees the plaintext.

### What USX Solves

Standard email between two UpInbox users still routes through SMTP, which:
- Means email potentially sitting in plaintext at SMTP relay hops
- Gives server operators the ability to read mail in transit
- Has no cryptographic proof of endpoint authenticity

USX routes encrypted messages directly between JMAP/HTTPS endpoints — bypassing SMTP
for user-to-user delivery. When both sides support USX, the 🔒 indicator appears.

---

## 2. DNS Discovery

### Record Format

To publish a USX endpoint, add a TXT record to your domain:

```
_upinbox.example.com.  IN  TXT  "v=USX1; endpoint=https://jmap.example.com/usx; fp=sha256:CERT_FINGERPRINT_HEX"
```

| Field | Description |
|---|---|
| `v=USX1` | Protocol version. Required. Must be `USX1` for this spec. |
| `endpoint=<URL>` | HTTPS URL of the USX receive endpoint. Required. |
| `fp=sha256:<hex>` | SHA-256 fingerprint of the TLS certificate at the endpoint. Required for full trust; optional for relay-assisted delivery. |

**UpInbox's record:**
```
_upinbox.upinbox.ai  TXT  "v=USX1; endpoint=https://jmap.upinbox.ai/usx; fp=sha256:..."
```

### Lookup Algorithm

```typescript
// src/lib/usx/discovery.ts

export async function discoverUsxEndpoint(
  emailAddress: string
): Promise<UsxEndpoint | null> {
  const domain = emailAddress.split('@')[1];
  const dnsName = `_upinbox.${domain}`;

  let txtRecords: string[];
  try {
    // Browser environment: use DoH (DNS over HTTPS)
    txtRecords = await queryDoH('cloudflare-dns.com', dnsName, 'TXT');
  } catch {
    return null;  // DNS failure → fallback to SMTP
  }

  const usxRecord = txtRecords.find(r => r.includes('v=USX1'));
  if (!usxRecord) return null;

  const params = parseUsxRecord(usxRecord);
  if (!params.endpoint) return null;

  return {
    version: 'USX1',
    endpoint: params.endpoint,
    certFingerprint: params.fp ?? null,
    domain,
  };
}
```

### DNS-over-HTTPS for Browser Clients

Browser JavaScript cannot make raw DNS queries. UpInbox uses DNS-over-HTTPS (DoH) with a fallback chain:

1. Cloudflare DoH: `https://cloudflare-dns.com/dns-query?name=_upinbox.example.com&type=TXT`
2. Google DoH: `https://dns.google/resolve?name=_upinbox.example.com&type=TXT`
3. If both fail: treat as no USX record, fall back to SMTP

Server-side (Node.js in self-hosted deployments) uses `dns.promises.resolveTxt()` directly.

### Multi-Value Records

If a domain publishes multiple `v=USX1` TXT records (e.g., for load-balanced endpoints), the sender picks one at random and includes the chosen endpoint in the envelope `selected_endpoint` field.

---

## 3. Trust Indicators

### The 🔒 Badge

When composing an email to an address with a valid USX DNS record, the compose window shows:

```
To: bob@example.com  🔒 Encrypted
                      ↑
                      DNS record found: _upinbox.example.com
                      Endpoint: https://jmap.example.com/usx
                      Cert fingerprint: sha256:abc123...
```

The badge has three states:

| Badge | Meaning |
|---|---|
| 🔒 Encrypted | Valid USX DNS record found, cert fingerprint verified (or TOFU on first contact) |
| 🔓 Not encrypted | No USX record found — will send via standard SMTP |
| ⚠️ Verify | USX record found but cert fingerprint mismatch — potential MITM, user must confirm |

### Trust on First Use (TOFU)

On first contact with a USX endpoint, UpInbox stores the cert fingerprint from the DNS record in the local trust store (`usx_trusted_endpoints` table). On subsequent messages, the live cert is compared against the stored fingerprint. A mismatch triggers a ⚠️ Verify prompt.

```
First message to bob@example.com:
  DNS record: fp=sha256:abc123
  TLS cert at endpoint: sha256:abc123  ✅ Match
  → Store in trust store: { domain: example.com, fp: sha256:abc123 }
  → Send 🔒

Future message if cert changed legitimately (renewal):
  DNS record updated: fp=sha256:def456
  TLS cert at endpoint: sha256:def456  ✅ Match (DNS updated by Bob)
  → Update trust store → Send 🔒 (transparent cert rotation)

Suspicious scenario:
  DNS record: fp=sha256:abc123  (not updated)
  TLS cert at endpoint: sha256:xyz789  ❌ Mismatch
  → Show ⚠️ "Certificate changed. Verify with recipient before sending."
  → Do not send until user explicitly confirms
```

---

## 4. End-to-End Delivery Flow

```
SENDER SIDE (Alice's browser)
─────────────────────────────
1. Alice composes email to bob@example.com

2. UI triggers DNS lookup: _upinbox.example.com
   Result: endpoint=https://jmap.example.com/usx; fp=sha256:abc123

3. UI shows 🔒 badge. Alice confirms send.

4. Alice's browser fetches Bob's public key:
   GET /api/usx/pubkey?address=bob@example.com
   ← { public_key_armored: "-----BEGIN PGP PUBLIC KEY BLOCK-----..." }

5. Alice's browser encrypts the message:
   openpgp.encrypt({
     message: plaintext,
     encryptionKeys: [bobPublicKey, alicePublicKey],   ← both: Bob reads it, Alice reads sent mail
     signingKeys: [alicePrivateKey],
   })

6. Alice's browser builds USX envelope (see Section 5)

7. Alice's browser POSTs envelope to https://jmap.example.com/usx/receive
   (Bob's endpoint — verified against cert fingerprint from DNS)

8. Bob's server responds 202 Accepted.
   Bob's server stores the ciphertext envelope.
   Bob's server CANNOT read the envelope content.

RECIPIENT SIDE (Bob's browser)
───────────────────────────────
9. Bob opens his inbox in UpInbox
   Thread appears with 🔒 badge

10. Bob's browser fetches the encrypted envelope:
    GET /api/threads/:threadId
    ← { body_enc: "...", subject_enc: "...", sig: "..." }

11. Bob's browser unlocks his private key (passphrase prompt if session expired)

12. Bob's browser decrypts:
    openpgp.decrypt({
      message: body_enc,
      decryptionKeys: [bobPrivateKey],
      verificationKeys: [alicePublicKey],   ← fetched from Alice's server by address
    })

13. Alice's signature is verified. Plaintext rendered in the browser.
    Plaintext never sent back to any server.
```

---

## 5. Envelope Format

USX envelopes are JSON objects transmitted over HTTPS.

```json
{
  "v": "USX1",
  "message_id": "upinbox-550e8400-e29b-41d4-a716-446655440000",
  "thread_ref": "<optional: message_id of parent for replies>",

  "from": "alice@alice.example",
  "to": ["bob@bob.example"],
  "cc": [],

  "subject_enc": "<base64-encoded OpenPGP ciphertext of subject string>",
  "body_enc":    "<base64-encoded OpenPGP ciphertext of body (HTML or text/plain)>",
  "body_format": "text/html",

  "attachments": [
    {
      "filename_enc":  "<base64 OpenPGP ciphertext of original filename>",
      "content_enc":   "<base64 OpenPGP ciphertext of file bytes>",
      "mime_type_hint": "application/pdf",
      "size_bytes": 48291
    }
  ],

  "sent_at": "2026-05-27T12:00:00.000Z",
  "selected_endpoint": "https://jmap.bob.example/usx",

  "sig": "<base64-encoded Ed25519 detached signature over canonical fields>"
}
```

### Field Notes

- `message_id`: Globally unique (UUID v4). Never reused. Recipients deduplicate by this field.
- `thread_ref`: Optional. When present, UpInbox UI threads replies together.
- `body_format`: Plaintext — reveals format but not content. Necessary for correct rendering.
- `mime_type_hint` on attachments: Reveals file type (e.g., `application/pdf`) but not content.
- `size_bytes`: Approximate. May differ from ciphertext size due to OpenPGP padding.
- `selected_endpoint`: The specific endpoint URL the sender chose (for multi-endpoint domains).

---

## 6. Signature Scheme

Alice signs the envelope so Bob can verify it was not tampered with in transit.

### Canonical Fields for Signing

The signature covers a deterministic JSON string of specific fields, excluding `sig` itself:

```typescript
// src/lib/usx/envelope.ts

function canonicalSigningPayload(envelope: UsxEnvelope): Uint8Array {
  const canonical = JSON.stringify({
    v:                 envelope.v,
    message_id:        envelope.message_id,
    from:              envelope.from,
    to:                [...envelope.to].sort(),    // sorted for determinism
    subject_enc:       envelope.subject_enc,
    body_enc:          envelope.body_enc,
    sent_at:           envelope.sent_at,
    selected_endpoint: envelope.selected_endpoint,
  });
  return new TextEncoder().encode(canonical);
}
```

### Signing

```typescript
const sig = await openpgp.sign({
  message: await openpgp.createMessage({ binary: canonicalSigningPayload(envelope) }),
  signingKeys: alicePrivateKey,
  detached: true,
  format: 'binary',
});
envelope.sig = btoa(String.fromCharCode(...new Uint8Array(sig)));
```

### Verification

```typescript
const result = await openpgp.verify({
  message: await openpgp.createMessage({ binary: canonicalSigningPayload(received) }),
  signature: await openpgp.readSignature({ binarySignature: base64Decode(received.sig) }),
  verificationKeys: alicePublicKey,
});

if (!result.signatures[0].verified) {
  // Show ⚠️ — envelope may have been modified in transit
  // Still decrypt and display, but warn user
}
```

If signature verification fails, UpInbox displays a warning but still attempts decryption. The failure indicates possible tampering or key mismatch — it is a signal, not proof. The user sees: ⚠️ "Signature verification failed — this message may have been modified in transit."

---

## 7. IMAP Relay for Gmail/Outlook Users

Gmail and Outlook users who want to participate in USX-encrypted exchanges can use the UpInbox relay. This allows a Gmail user to send and receive 🔒 encrypted messages without migrating their email account.

### Send via Relay (Gmail → USX Recipient)

```
Gmail user (Alice)
  │
  │  Uses UpInbox extension (Chrome/Firefox sidebar in Gmail)
  │  Extension runs browser-side encryption (same as native UpInbox)
  │  Encrypted USX envelope assembled in browser
  │
  └── POST https://api.upinbox.ai/api/upinbox/relay/usx
      Authorization: Bearer <alice_session_token>
      Body: <USX envelope JSON>

UpInbox Relay
  │
  │  Validates alice_session_token
  │  Verifies envelope signature (Alice's public key from UpInbox directory)
  │  Logs: { from_domain: 'gmail.com', to_domain: 'bob.example', timestamp }
  │         (relay NEVER decrypts or reads body_enc / subject_enc)
  │
  └── POST https://jmap.bob.example/usx/receive
      Body: <USX envelope, unmodified>
      X-Relay: api.upinbox.ai
      X-Relay-Sig: <relay's Ed25519 signature over message_id + timestamp>
```

### What the Relay Logs

The relay logs a minimal record for abuse prevention and rate limiting:

```json
{
  "from_domain": "gmail.com",
  "to_domain": "bob.example",
  "message_id": "upinbox-<uuid>",
  "timestamp": "2026-05-27T12:00:00Z",
  "relay_result": "delivered"
}
```

The relay does **not** log: from/to email addresses, subject, body, attachments, or attachment count.

### Receive via Relay (USX Sender → Gmail User)

When Bob (on UpInbox) sends an encrypted USX message to Carol (on Gmail with UpInbox extension):

```
Bob's browser
  ─── fetches Carol's public key from UpInbox directory by Carol's email address
  ─── encrypts for Carol's key + Bob's key
  ─── POSTs envelope to relay's receive endpoint for Carol's Gmail address

Relay
  ─── stores encrypted envelope (TTL: 30 days)
  ─── sends Carol a standard Gmail notification (no content in the notification):
      "You have a secure message from bob@example.com.
       Open in UpInbox to read."

Carol opens UpInbox extension
  ─── fetches encrypted envelope from relay
  ─── decrypts in browser with her private key
  ─── displays plaintext in Gmail sidebar
```

### Relay Rate Limits

| Tier | Outbound relay messages/hr |
|---|---|
| Free | 100 |
| Plus | 500 |
| Business | 5,000 |

Relay requires a valid UpInbox session token — anonymous relay is not supported.

---

## 8. USX Endpoint Reference

### POST /usx/receive

Accept an incoming USX envelope.

**Request:**
```
POST /usx/receive
Content-Type: application/json
Body: <USX envelope JSON>
```

**Response codes:**

| Code | Meaning |
|---|---|
| `202 Accepted` | Envelope received and stored |
| `400 Bad Request` | Malformed envelope (missing required fields, bad JSON) |
| `401 Unauthorized` | Auth required and not provided |
| `403 Forbidden` | Sender domain is blocked or rate-limited |
| `409 Conflict` | `message_id` already received (duplicate) |
| `413 Payload Too Large` | Envelope exceeds max size (default: 25MB) |
| `422 Unprocessable` | `v` field is not `USX1` or envelope fails structural validation |

### GET /usx/pubkey

Retrieve a user's public key for encryption.

**Request:**
```
GET /usx/pubkey?address=user@example.com
```

**Response (200):**
```json
{
  "address": "user@example.com",
  "public_key_armored": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n...",
  "fingerprint": "ABC123...DEF456",
  "updated_at": "2026-01-15T09:00:00Z"
}
```

Returns `404` if the user has not configured USX or has no Ed25519 keypair.

### GET /usx/health

Ping the USX endpoint.

**Request:** `GET /usx/health`

**Response (200):**
```json
{ "status": "ok", "version": "USX1", "domain": "example.com" }
```

---

## 9. Fallback Behavior

If USX delivery fails or the recipient does not support USX, UpInbox falls back to standard SMTP.

### Fallback Triggers

| Condition | Fallback |
|---|---|
| No `_upinbox` DNS record found | Standard SMTP |
| DNS lookup times out (>5s) | Standard SMTP |
| DoH providers unreachable | Standard SMTP |
| USX endpoint returns 4xx/5xx | Standard SMTP |
| Cert fingerprint mismatch | **Blocked** — user must confirm before sending |
| Recipient has no USX public key | Standard SMTP |
| Attachment bundle exceeds 25MB | Standard SMTP (user warned, can split) |

### User Notification on Fallback

```
[Compose — To field]
  bob@external-no-usx.com  🔓 Not encrypted (standard email)
```

If the user has configured "Require encryption — never send unencrypted," the send button is disabled and shows: "Cannot send — recipient doesn't support USX. You can share your UpInbox invite link to enable encrypted exchange."

---

## 10. USX vs S/MIME and PGP Email

| Feature | S/MIME | PGP (Enigmail) | USX |
|---|---|---|---|
| Key discovery | Manual import | Key server (unreliable) | DNS automatic |
| Certificate cost | $0–$50/yr (CA) | Free | Free |
| Works with existing clients | Most clients | Thunderbird, few others | UpInbox-compatible clients |
| No key exchange ceremony | ❌ | ❌ | ✅ |
| Encrypted subject | ❌ | ❌ | ✅ |
| Automatic SMTP fallback | Manual | Manual | ✅ |
| Certificate revocation | CRL / OCSP | Web of Trust | DNS TTL + TOFU |
| MITM detection | CA chain | Manual fingerprint | DNS TOFU + cert pin |
| Open standard | ✅ | ✅ | ✅ (this document) |
| Relay for Gmail/Outlook | ❌ | ❌ | ✅ |
| Encrypted attachment names | ❌ | Partial | ✅ |

### Why Not Just Use S/MIME?

S/MIME is a fine standard. The friction is distribution: obtain a certificate, convince your recipient to import it, repeat for every correspondent. In practice, adoption is limited to organizations with mandated IT policies. USX uses DNS — infrastructure that already exists, is already secured, and is familiar to every domain owner.

### Why Not Just Use PGP?

PGP has the same key distribution problem plus more complex UX. Key servers are often unreliable or return stale keys. The Web of Trust has not achieved mainstream adoption. USX uses DNS for discovery and adds relay support for Gmail/Outlook users — reducing the adoption barrier from "both users must be PGP-fluent" to "both users must be UpInbox users."

---

## 11. Setting Up USX for Your Domain

### Step 1: Enable USX in Your Instance

In your UpInbox admin panel:

```
Settings → Domain → USX
  ☑ Enable USX endpoint
  USX endpoint URL: https://mail.yourdomain.com/usx  (auto-configured with Stalwart)
```

### Step 2: Get Your TLS Certificate Fingerprint

```bash
openssl s_client -connect mail.yourdomain.com:443 -showcerts 2>/dev/null \
  | openssl x509 -fingerprint -sha256 -noout \
  | sed 's/SHA256 Fingerprint=//; s/://g' \
  | tr 'A-F' 'a-f'
```

### Step 3: Add the DNS TXT Record

At your DNS registrar or DNS provider, add:

```
_upinbox.yourdomain.com.  300  IN  TXT  "v=USX1; endpoint=https://mail.yourdomain.com/usx; fp=sha256:YOURFINGERPRINT"
```

TTL of 300 (5 minutes) is recommended so cert rotation changes propagate quickly.

### Step 4: Verify

```bash
# Check DNS propagation
dig TXT _upinbox.yourdomain.com +short

# Test USX endpoint health
curl https://mail.yourdomain.com/usx/health

# Test discovery from UpInbox API
curl "https://api.upinbox.ai/api/usx/discover?domain=yourdomain.com"
```

### Step 5: Optional — Register with the USX Network

Visit `https://upinbox.ai/network/register` to appear in the UpInbox trusted server directory. Registration is free, requires no account, and only verifies that your DNS record and endpoint are correctly configured. It does not give UpInbox any access to your server.

### Certificate Rotation

When you renew your TLS certificate:
1. Update `fp=sha256:NEWFINGERPRINT` in your DNS TXT record
2. Deploy the new certificate to your server
3. Both steps should complete before the old cert expires

UpInbox clients will notice the DNS change on their next lookup and update their TOFU store if DNS record and live cert match.

---

## 12. Security Considerations

### DNS Hijacking

If an attacker controls your DNS zone, they could redirect the USX endpoint to their server. Mitigations:
- Enable DNSSEC on your zone (prevents record spoofing)
- UpInbox uses DoH (transport security for DNS queries, preventing on-path tampering)
- Cert fingerprint pinning means an attacker must also obtain a valid cert for the fingerprint in DNS

### Replay Attacks

`message_id` is globally unique (UUID v4). Recipients store received IDs and reject duplicates with HTTP 409. `sent_at` is included in the signed payload, allowing recipients to reject stale replays outside a configurable window.

### Denial of Service

A hostile sender can flood a USX endpoint with large envelopes. Mitigations:
- `413 Payload Too Large` for envelopes over 25MB
- Rate limiting by sender domain (recommended: 100 envelopes/hour per domain)
- Endpoints may optionally require an authenticated sender (known UpInbox account)

### Metadata Leakage

USX encrypts content but not routing metadata (from/to addresses, timestamps, `body_format`). This is consistent with standard email semantics. If routing metadata privacy is a requirement, consider running both sender and recipient behind privacy-preserving relays and reviewing what the relay logs.

### Encrypted Attachment Type Hints

`mime_type_hint` reveals the file type (e.g., `application/pdf`) but not the content. This is a deliberate trade-off: without the hint, clients cannot display the correct file type icon before decryption. If the file type is itself sensitive, set `mime_type_hint` to `application/octet-stream`.

---

## 13. Protocol Versioning

The current version is `USX1`. The `v` field in DNS records and envelopes allows future versions to introduce changes without breaking existing deployments.

### Compatibility Rules

- A USX1 client receiving a `USX2` envelope MUST return 422 Unprocessable
- A USX2 client receiving a USX1 envelope SHOULD process it (backward compatibility preferred)
- DNS records may contain both `v=USX1` and `v=USX2` entries for transition periods

### Proposed USX2 Extensions (Non-Binding)

- **Routing metadata encryption:** Encrypt from/to addresses using a shared domain key
- **Proof-of-work flood prevention:** Hashcash-style token for unauthenticated senders
- **Group messaging:** Multi-recipient key distribution for encrypted mailing lists
- **Read receipts:** Encrypted delivery confirmation (opt-in per envelope)
- **Forward secrecy:** Ephemeral key exchange per message (Signal-style ratchet)

Community proposals welcome via [GitHub Discussions](https://github.com/UpGPT-ai/upinbox/discussions).

---

## Registering with the USX Network

Optionally register at `https://upinbox.ai/network/register` to:
- Get the 🔒 indicator recognized by all UpInbox clients worldwide
- Receive security patch notifications for self-hosted instances
- Appear in the UpInbox trusted server directory

Registration requires: your domain, your USX endpoint URL, and verification that the cert fingerprint resolves correctly. No account or login required. The registry is read-only public.

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture, USX in context
- [ZERO-KNOWLEDGE.md](./ZERO-KNOWLEDGE.md) — Encryption primitives used by USX
- [AI-MODEL-FREEDOM.md](./AI-MODEL-FREEDOM.md) — How AI works alongside encrypted content
- [SELF-HOSTING.md](./SELF-HOSTING.md) — DNS setup, Stalwart mail server configuration
