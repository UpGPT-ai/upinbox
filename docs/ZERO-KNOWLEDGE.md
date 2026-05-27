# Zero-Knowledge Encryption in UpInbox

> **Version:** 1.0 — May 2026
> **Applies to:** All UpInbox deployments (self-hosted and SaaS)

This document describes the zero-knowledge encryption architecture that protects email content in UpInbox. "Zero-knowledge" in this context means: **a correctly operating UpInbox server can never read your email content, even with full database access.**

The encryption layer is implemented entirely in the open-source repository (`src/lib/mail/crypto/`) using auditable, well-established primitives.

---

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Cryptographic Primitives](#2-cryptographic-primitives)
3. [Keypair Generation](#3-keypair-generation)
4. [Private Key Storage — Encrypted at Rest](#4-private-key-storage--encrypted-at-rest)
5. [Sending an Encrypted Email](#5-sending-an-encrypted-email)
6. [Receiving an Encrypted Email](#6-receiving-an-encrypted-email)
7. [Password Links for Non-PGP Recipients](#7-password-links-for-non-pgp-recipients)
8. [What Operators Can and Cannot See](#8-what-operators-can-and-cannot-see)
9. [Self-Hosted Break-Glass Access](#9-self-hosted-break-glass-access)
10. [Warrant Canary Implications](#10-warrant-canary-implications)
11. [Key Rotation and Recovery](#11-key-rotation-and-recovery)
12. [Session Key Lifecycle](#12-session-key-lifecycle)
13. [Implementation Reference](#13-implementation-reference)

---

## 1. Threat Model

### Attacker Profiles

| Attacker | Capability | ZK Protected? | Notes |
|---|---|---|---|
| External attacker with DB dump | Full read access to all DB tables | ✅ Yes | Only ciphertext in DB |
| Malicious SaaS operator | Full server + DB access | ✅ Yes | Private keys encrypted with user password |
| Self-hosted IT admin | Full server + DB + filesystem | ✅ Yes (content) | Can access OAuth tokens via PLATFORM_ENCRYPTION_KEY; cannot access content |
| Network eavesdropper (active MITM) | Can intercept HTTP traffic | ✅ Yes | Content encrypted before transmission; TLS adds transport layer |
| Attacker with user's password | Can derive wrapping key | ❌ No | Password unlocks everything — password hygiene is user responsibility |
| Attacker with user's unlocked device | Browser session access | ❌ No | Session key in memory; lock your screen |
| Compromised server binary | Can modify code | ⚠️ Partial | Can intercept keys during decryption; does not retroactively decrypt stored blobs |

### What "Zero-Knowledge" Means Here

The UpInbox server stores encrypted blobs. It does not know your password. Without your password, it cannot derive the wrapping key. Without the wrapping key, it cannot decrypt your private key. Without your private key, it cannot decrypt email content that was encrypted using USX.

This is an architectural guarantee, not a policy promise. You can verify it in this repository.

### Scope

ZK encryption covers:
- **USX messages** — encrypted in the browser before delivery
- **Private key storage** — encrypted with your password before upload
- **Encrypted subjects and attachment names** (USX mode)

ZK encryption does **not** cover:
- Gmail/Outlook messages you did not encrypt — those remain at your provider
- **Metadata** — from/to addresses, timestamps, and thread depth are stored unencrypted for routing and UI performance
- IMAP/OAuth credential storage — these are encrypted with `PLATFORM_ENCRYPTION_KEY`, not your user password. A server operator (or self-hosted admin) with `PLATFORM_ENCRYPTION_KEY` can decrypt these and thereby access your mail account at the provider level. This is a fundamental property of any email client that stores credentials.

---

## 2. Cryptographic Primitives

| Primitive | Algorithm | Library | Purpose |
|---|---|---|---|
| Asymmetric keypair | Ed25519 | `openpgp.js` v6 | Identity, signing, ECDH |
| ECDH key agreement | X25519 (Curve25519) | `openpgp.js` v6 | Derive shared secret for content encryption |
| Key derivation (password) | Argon2id | `argon2-browser` (WASM) | Stretch password into AES wrapping key |
| Symmetric encryption | AES-256-GCM | WebCrypto API | Content and private key encryption |
| Password links (non-PGP) | PBKDF2-SHA256 (600,000 rounds) | WebCrypto API | Encrypt content for recipients without PGP |
| Fingerprints | SHA-256 | WebCrypto API | Key fingerprints, USX endpoint cert pinning |

### Why These Choices

**Ed25519 over RSA:**
Smaller keys (32 bytes vs 256+ bytes for RSA-2048). Faster generation in the browser. Immune to weak-RNG vulnerabilities that have affected RSA in constrained environments. Modern, well-audited, natively supported by OpenPGP.js.

**Argon2id over bcrypt or scrypt:**
Memory-hard and time-hard. The `id` variant combines Argon2i (side-channel resistance) and Argon2d (GPU resistance). Parameters used: `m=65536` (64 MiB), `t=3`, `p=4`. This makes brute-forcing a strong password computationally infeasible even with a leaked database.

**AES-256-GCM over AES-CBC:**
Authenticated encryption: provides confidentiality and integrity in a single operation. The authentication tag detects ciphertext tampering before decryption begins. Hardware-accelerated on modern CPUs via AES-NI.

**WebCrypto API for symmetric operations:**
Browser-native and hardware-accelerated where supported. Session-scoped `CryptoKey` objects can be marked non-extractable — the key material cannot be read back out of the object, only used for encrypt/decrypt operations. No third-party JS dependency for symmetric work.

---

## 3. Keypair Generation

Key generation happens entirely in the browser on first login. The server is not involved.

```typescript
// src/lib/mail/crypto/keys.ts

import * as openpgp from 'openpgp';

export async function generateUserKeypair(email: string): Promise<{
  publicKeyArmored: string;    // stored on server, shared freely
  privateKeyArmored: string;   // encrypted before upload — see section 4
  fingerprint: string;
}> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'ed25519',
    userIDs: [{ email }],
    format: 'armored',
  });

  const fingerprint = (await openpgp.readKey({ armoredKey: publicKey }))
    .getFingerprint()
    .toUpperCase();

  // Raw privateKey lives in browser memory only.
  // Caller encrypts it with encryptPrivateKeyForStorage() before any upload.
  return { publicKeyArmored: publicKey, privateKeyArmored: privateKey, fingerprint };
}
```

**Critical invariant:** The raw `privateKeyArmored` string is NEVER included in any HTTP request body. Only the encrypted blob produced in Section 4 leaves the browser.

---

## 4. Private Key Storage — Encrypted at Rest

Before the private key is transmitted to the server, it is wrapped in two steps: derive a wrapping key from the user's password, then encrypt the private key with it.

### Step 1: Key Derivation via Argon2id

```typescript
// src/lib/mail/crypto/keys.ts

import argon2 from 'argon2-browser';

const ARGON2_PARAMS = {
  type: argon2.ArgonType.Argon2id,
  hashLen: 32,      // 256-bit output → AES-256 key
  memory: 65536,    // 64 MiB
  time: 3,          // 3 iterations
  parallelism: 4,
};

async function deriveWrappingKey(
  password: string,
  salt: Uint8Array   // 32 random bytes, stored in DB (not secret)
): Promise<CryptoKey> {
  const result = await argon2.hash({
    pass: password,
    salt,
    ...ARGON2_PARAMS,
  });

  return crypto.subtle.importKey(
    'raw',
    result.hash,
    { name: 'AES-GCM', length: 256 },
    false,           // non-extractable
    ['encrypt', 'decrypt']
  );
}
```

### Step 2: Encrypt Private Key with AES-256-GCM

```typescript
export async function encryptPrivateKeyForStorage(
  privateKeyArmored: string,
  password: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; iv: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    new TextEncoder().encode(privateKeyArmored)
  );

  return { ciphertext: new Uint8Array(ciphertext), salt, iv };
}
```

### What Gets Stored in the Database

```
user_keys table:
  public_key_armored  = "-----BEGIN PGP PUBLIC KEY BLOCK-----..."   ← public, shared freely
  private_key_enc     = <AES-256-GCM ciphertext>                    ← opaque blob
  private_key_salt    = <32 random bytes>                            ← Argon2id salt (not secret)
  private_key_iv      = <12 random bytes>                            ← GCM nonce (not secret)
  fingerprint         = "ABC123...DEF456"                            ← for lookup and USX DNS
```

The server operator has `salt` and `iv` but not the password. Without the password, Argon2id cannot be run to recover the wrapping key. Without the wrapping key, AES-GCM decryption fails.

---

## 5. Sending an Encrypted Email

When Alice sends a USX-encrypted email to Bob, the entire encryption operation runs in Alice's browser.

```
Alice's Browser
│
│  1. Fetch Bob's public key
│     GET /api/usx/pubkey?address=bob@bob.example
│     ← { public_key_armored: "-----BEGIN PGP PUBLIC KEY BLOCK-----..." }
│
│  2. Parse and optionally verify against Bob's USX DNS record fingerprint
│     const bobKey = await openpgp.readKey({ armoredKey: bobPubKey });
│
│  3. Decrypt Alice's own private key (from in-memory session — see Section 12)
│     const alicePrivKey = sessionKeyStore.get(aliceUserId);
│
│  4. Encrypt message content with both keys
│     (Alice encrypts for Bob AND herself so she can read her sent mail)
│
│     const encrypted = await openpgp.encrypt({
│       message: await openpgp.createMessage({ text: bodyPlaintext }),
│       encryptionKeys: [bobKey, alicePublicKey],
│       signingKeys: alicePrivKey,
│       format: 'binary',
│     });
│
│  5. Encrypt subject separately (same approach)
│     const encryptedSubject = await openpgp.encrypt({
│       message: await openpgp.createMessage({ text: subject }),
│       encryptionKeys: [bobKey, alicePublicKey],
│       format: 'binary',
│     });
│
│  6. Build USX envelope
│     {
│       "v": "USX1",
│       "from": "alice@alice.example",
│       "to":   "bob@bob.example",
│       "subject_enc": base64(encryptedSubject),
│       "body_enc":    base64(encrypted),
│       "sig":         "<Alice's detached Ed25519 signature over canonical fields>",
│       "sent_at":     "2026-05-27T12:00:00Z"
│     }
│
│  7. Deliver to Bob's USX endpoint
│     POST https://jmap.bob.example/usx/receive
│     Content-Type: application/json
│     Body: <USX envelope above>
│
│  Bob's server stores the ciphertext. It cannot read it.
```

### Why Alice Encrypts for Herself

OpenPGP allows multiple PKESK (Public Key Encrypted Session Key) packets — one per recipient. Alice adds herself as a recipient so she can read her own sent mail. Without this, Alice's browser would have no key to decrypt sent messages, since she has only her own private key.

---

## 6. Receiving an Encrypted Email

When Bob opens a USX thread, decryption runs entirely in his browser.

```
Bob's Browser
│
│  1. Load thread
│     GET /api/threads/:threadId
│     ← { body_enc: "<base64 ciphertext>", subject_enc: "...", sig: "..." }
│
│  2. Check session key store (see Section 12)
│     If private key not yet unlocked: prompt for passphrase
│
│  3. Unlock private key (if not already in session)
│     const salt = base64Decode(user_keys.private_key_salt);
│     const iv   = base64Decode(user_keys.private_key_iv);
│     const enc  = base64Decode(user_keys.private_key_enc);
│
│     const wrappingKey = await deriveWrappingKey(passphrase, salt);
│     const privateKeyBytes = await crypto.subtle.decrypt(
│       { name: 'AES-GCM', iv },
│       wrappingKey,
│       enc
│     );
│     const bobPrivKey = await openpgp.readPrivateKey({
│       binaryKey: privateKeyBytes
│     });
│
│  4. Decrypt message
│     const { data: plaintext, signatures } = await openpgp.decrypt({
│       message:          await openpgp.readMessage({ binaryMessage: bodyEnc }),
│       decryptionKeys:   bobPrivKey,
│       verificationKeys: alicePublicKey,  // fetched from DB by Alice's address
│       format: 'utf8',
│     });
│
│  5. Verify Alice's signature
│     const verified = await signatures[0].verified;  // Promise<true> or throws
│     // If verification fails, display ⚠️ "Signature could not be verified"
│
│  6. Render plaintext in thread view
│     // Plaintext is never sent back to the server
│     // Never written to localStorage
│     // Exists in JS memory only during render
```

---

## 7. Password Links for Non-PGP Recipients

When Alice wants to send encrypted content to Carol (who does not have UpInbox/PGP), Alice generates a password-protected secure link.

```typescript
// src/lib/mail/crypto/password-link.ts

export async function encryptForPasswordLink(
  plaintext: string,
  password: string,
  expiryDays = 7
): Promise<PasswordLinkPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  // Derive key using PBKDF2-SHA256, 600,000 rounds (NIST SP 800-132 recommendation as of 2023)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const encKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey,
      new TextEncoder().encode(plaintext))
  );

  return {
    ciphertext,
    salt,
    iv,
    expiresAt: new Date(Date.now() + expiryDays * 86_400_000),
    oneTimeOpen: false,   // configurable: mark consumed after first access
  };
}
```

### Delivery Flow

1. Alice's browser encrypts the message and uploads the ciphertext blob
2. Server stores: `{ token, ciphertext, salt, iv, expires_at }` — the password is **not** stored
3. Server sends Carol an email: "Alice sent you a secure message — click here to read it"
4. Carol opens `https://upinbox.ai/secure/<token>`, enters the password Alice shared separately
5. Carol's browser fetches the ciphertext, runs PBKDF2 locally, decrypts, renders
6. The server sees only: token was accessed at timestamp X from IP Y

One-time-open links: if `oneTimeOpen: true`, the server marks the token `consumed = true` on first fetch. Subsequent requests return HTTP 410 Gone.

---

## 8. What Operators Can and Cannot See

### Can See (Stored Unencrypted)

| Data | Why Unencrypted |
|---|---|
| From/To email addresses | Required for routing; standard SMTP header |
| Send timestamps | Standard metadata |
| Thread message count | UI performance (cached counter) |
| Whether a thread uses USX | `is_usx` boolean — needed for 🔒 indicator |
| `credentials_enc` blob | Opaque to DB reader; decryptable with `PLATFORM_ENCRYPTION_KEY` |
| `private_key_enc` blob | Opaque to DB reader; decryptable only with user's password |

### Cannot See (Stored Encrypted or Never Stored)

| Data | Reason |
|---|---|
| Email body (USX) | End-to-end encrypted; `body_enc` is opaque ciphertext |
| Email subject (USX) | Encrypted in `subject_enc` |
| Attachments (USX) | Encrypted in `attachments_enc` |
| Private keys | Only `private_key_enc` stored; no password = no decryption |
| BYOK API keys | Never transmitted to server — browser only |
| AI prompts (BYOK) | API calls go browser → provider; server not in path |
| Email body (Gmail/Outlook) | Not cached on UpInbox servers at all; fetched live from provider |

### The Database With a Full Dump

An attacker who steals the full UpInbox database for a user who uses USX sees:

```
threads.from_address  = alice@example.com          ← visible
threads.to_address    = bob@example.com             ← visible
threads.last_message  = 2026-05-27 12:00:00Z        ← visible
threads.subject_enc   = 0xab12fde3...               ← opaque ciphertext
threads.body_enc      = 0x9e45c1a2...               ← opaque ciphertext
user_keys.public_key  = -----BEGIN PGP PUBLIC...    ← public by design
user_keys.private_key_enc = 0x7c3d1b8f...           ← opaque, Argon2id-wrapped
```

What the attacker learns: who communicated with whom, and when. Not what was said.

---

## 9. Self-Hosted Break-Glass Access

In a self-hosted deployment, the IT admin has full server access. This is expected and correct. The ZK design ensures that this access does not yield email content.

### What the Admin Can Access

| Resource | Admin Access | With `PLATFORM_ENCRYPTION_KEY` |
|---|---|---|
| Database tables | Full read/write | — |
| `credentials_enc` | Encrypted blob | ✅ Can decrypt → OAuth token → provider IMAP access |
| `private_key_enc` | Encrypted blob | ❌ Only user's password decrypts this |
| `body_enc` (USX) | Encrypted blob | ❌ Cannot decrypt without user's private key |
| `subject_enc` (USX) | Encrypted blob | ❌ Cannot decrypt without user's private key |

### Break-Glass for Content

There is no server-side break-glass for email content. If an organization requires legal-hold or eDiscovery capabilities, the options are:

1. **Key escrow (Enterprise):** UpInbox Enterprise supports an optional organizational escrow key — a separate Ed25519 keypair managed by the organization's IT team. Users can opt to encrypt messages for the escrow key as well as the recipient. This is configured per-policy and requires user consent at setup. Contact enterprise@upinbox.ai.

2. **Device seizure:** In a legally authorized investigation, if the user's device and session are accessible, the decrypted private key may be in memory or the session may be active.

3. **Password compulsion:** Court orders can compel a user to provide their password. UpInbox cannot compel this.

### No "Master Key"

UpInbox does not generate or hold a master decryption key. The `PLATFORM_ENCRYPTION_KEY` decrypts OAuth tokens — not email content. This is a deliberate architectural choice, not an oversight.

---

## 10. Warrant Canary Implications

### What a Warrant to UpGPT (SaaS) Produces

If UpGPT receives a lawful demand for user email content:

- **Can produce:** Encrypted blobs (ciphertext), metadata (from/to, timestamps), account registration information (email address, IP at registration, payment info)
- **Can produce:** This open-source repository
- **Cannot produce:** Decrypted email content — we do not have users' passwords
- **Cannot produce:** User private keys — we have only encrypted blobs that require the user's password to decrypt

A warrant for email content from UpGPT is structurally unproductive unless combined with a warrant for the user's password (which UpGPT also does not store).

### What a Warrant to a Self-Hosted Operator Produces

A warrant served to a self-hosted organization produces:

- Encrypted blobs + metadata (same as SaaS)
- `PLATFORM_ENCRYPTION_KEY` (if compelled) → decrypts OAuth tokens → provider IMAP access
- The open-source code
- Still cannot produce decrypted USX email content

### Warrant Canary

UpGPT publishes a warrant canary at [https://upinbox.ai/canary](https://upinbox.ai/canary), updated on the first of each quarter. The canary statement includes the current date and a signed assertion that UpGPT has not received any secret legal demands, national security letters, or FISA court orders that would require compromising user encryption. If the canary is not updated by the 15th of the quarter, users should treat the canary as triggered.

---

## 11. Key Rotation and Recovery

### Changing Your Password (Re-Wrapping)

When you change your UpInbox password:

```
1. Prompt for current password
2. Derive old wrapping key: Argon2id(old_password, stored_salt)
3. Decrypt private key blob with old wrapping key
4. Generate new salt (32 bytes)
5. Generate new IV (12 bytes)
6. Derive new wrapping key: Argon2id(new_password, new_salt)
7. Re-encrypt private key with new wrapping key
8. POST /api/account/rekey  with { new_blob, new_salt, new_iv }
9. Server atomically replaces old user_keys row
```

The Ed25519 keypair itself does not change on password change — only the wrapping. All previously received USX messages remain decryptable.

### Recovery Key

During account setup (or in Settings → Security → Recovery Key), you can generate a recovery key. This is a random 256-bit value displayed as a 24-word BIP-39 mnemonic. UpInbox uses the same wrapping process as a password — the recovery key produces a second encrypted blob (`private_key_recovery_enc`) stored alongside the password-encrypted blob.

If you lose your password:
- Open `https://yourdomain.com/recover`
- Enter your recovery key mnemonic
- Browser derives recovery wrapping key, decrypts private key, re-encrypts with a new password

Without a recovery key, a lost password means permanent loss of the ability to decrypt previously received USX messages. This is a fundamental property of end-to-end encryption — it is not a bug.

### Key Expiry and Future Subkey Rotation

The current implementation uses a single Ed25519 master key for both signing and encryption. A future version will support annual subkey rotation: the master signing key remains stable while a new encryption subkey is issued each year. Old subkeys are retained for decrypting historical messages.

---

## 12. Session Key Lifecycle

The private key is not decrypted on every message open. UpInbox uses a session-scoped key store to avoid repeatedly prompting for the passphrase.

```
First encrypted message open in session:
  → Prompt for passphrase
  → Run Argon2id (takes ~1-2s intentionally)
  → Decrypt private key blob
  → Store decrypted CryptoKey object in sessionKeyStore (in-memory Map)
  → CryptoKey is non-extractable: cannot be read back, only used for crypto operations

Subsequent message opens in session:
  → sessionKeyStore.has(userId) → true
  → Decrypt with cached key (no passphrase prompt, no Argon2id)
  → ~5ms

Session key cleared when:
  → User signs out
  → Browser tab closes
  → Idle timeout fires (default: 30 minutes, configurable in Settings → Security)
  → `lock()` called explicitly (keyboard shortcut: Ctrl/Cmd+L)
```

**Storage:** The session key is in a JavaScript `Map` object in-memory. It is NOT stored in `localStorage`, `sessionStorage`, `IndexedDB`, or any browser persistence mechanism. Closing and reopening the tab requires re-entering the passphrase.

---

## 13. Implementation Reference

All encryption code is in `src/lib/mail/crypto/`:

| File | Purpose |
|---|---|
| `keys.ts` | Ed25519 keypair generation, fingerprinting |
| `keys.ts` | Private key wrapping/unwrapping (Argon2id + AES-GCM) |
| `session-store.ts` | Session-scoped private key cache, idle timeout |
| `encrypt.ts` | USX message encryption (OpenPGP.js) |
| `decrypt.ts` | USX message decryption and signature verification |
| `password-link.ts` | PBKDF2-based password links for non-PGP recipients |
| `credentials.ts` | PLATFORM_ENCRYPTION_KEY wrapping for OAuth tokens |

### Test Coverage

```bash
npm test src/__tests__/mail/crypto/
```

Tests cover: key generation, wrapping/unwrapping, encrypt/decrypt round-trip, tampered ciphertext rejection (GCM tag failure), password link encryption, session store lifecycle, and idle timeout.

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `openpgp` | `^6.0.0` | Ed25519, ECDH, OpenPGP message format |
| `argon2-browser` | `^2.18.0` | Argon2id in browser (WebAssembly) |

All symmetric cryptography (AES-256-GCM, PBKDF2, SHA-256) uses the browser's native `crypto.subtle` WebCrypto API — no external dependency.

### Security Disclosure

Responsible disclosure: [security@upinbox.ai](mailto:security@upinbox.ai)

We follow a 90-day disclosure policy. Critical ZK vulnerabilities are eligible for a bug bounty. See [SECURITY.md](../SECURITY.md).

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Full system architecture, database schema
- [AI-MODEL-FREEDOM.md](./AI-MODEL-FREEDOM.md) — How BYOK AI works without seeing content
- [USX-PROTOCOL.md](./USX-PROTOCOL.md) — Encrypted delivery between UpInbox users
- [SELF-HOSTING.md](./SELF-HOSTING.md) — PLATFORM_ENCRYPTION_KEY setup, HSM guidance
