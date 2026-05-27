# Zero-Knowledge Encryption in UpInbox

UpInbox is designed so the server operator — including UpInbox Inc. — structurally
cannot read your email content. This document explains how.

---

## The Core Claim

When you send or receive encrypted email via UpInbox:
- Your private key **never leaves your browser**
- The server stores only **ciphertext** — encrypted blobs it cannot read
- UpInbox holds no master key, no escrow key, no recovery key
- A warrant served to UpInbox Inc. produces: the open-source client code. Nothing else.

This is not a policy claim. It is an architectural property you can verify in this repo.

---

## Key Generation

When you create a new UpInbox account, your browser generates an Ed25519 keypair
using [OpenPGP.js](https://openpgpjs.org/):

```typescript
// src/lib/mail/crypto/keys.ts
import * as openpgp from 'openpgp';

export async function generateUserKeypair(email: string): Promise<{
  publicKey: string;    // ASCII-armored public key — stored on server, shared freely
  privateKeyBlob: string;  // encrypted private key — stored on server, only you can decrypt
}> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'ed25519',
    userIDs: [{ email }],
    format: 'armored',
  });

  // Encrypt private key before it ever leaves the browser
  const privateKeyBlob = await encryptPrivateKey(privateKey, /* user password */);
  
  return { publicKey, privateKeyBlob };
}
```

The raw private key exists in browser memory only during this function call.

---

## Private Key Encryption (Client-Side)

Before the private key is transmitted to the server, it is encrypted:

```
User password
    ↓
Argon2id(password, random_salt, { time: 3, memory: 64MB, parallelism: 4 })
    ↓
32-byte wrapping key
    ↓
AES-256-GCM encrypt(raw_private_key, wrapping_key, random_iv)
    ↓
encrypted_blob = { salt, iv, ciphertext, tag }  ← stored in DB
```

The server receives only `encrypted_blob`. It has no way to derive the wrapping key
without the user's password — which is never transmitted.

**Argon2id parameters** are deliberately expensive (64MB memory, 3 iterations) to
make offline dictionary attacks impractical even if the encrypted blob is leaked.

---

## Sending Encrypted Email (USX)

When Alice sends an encrypted email to Bob:

```
1. Alice's browser fetches Bob's public key from the DB (public — no auth required)
2. openpgp.encrypt({
     message: plaintext,
     encryptionKeys: [bobPublicKey],
     signingKeys: [alicePrivateKey],  ← decrypted from blob in Alice's browser only
   })
3. Ciphertext is sent to Bob's USX endpoint (via relay or direct JMAP)
4. Server stores: { from: alice_domain, to: bob_domain, ciphertext: '...', timestamp }
   The server CANNOT read the ciphertext — it has only Bob's public key, not Bob's private key
```

---

## Receiving and Decrypting

When Bob opens the email in his browser:

```
1. Browser loads encrypted blob from DB
2. Browser prompts for password (if session key expired)
3. Argon2id(password, stored_salt) → wrapping key
4. AES-256-GCM.decrypt(encrypted_private_key_blob, wrapping_key) → raw private key
5. openpgp.decrypt({ message: ciphertext, decryptionKeys: [bobPrivateKey] })
6. Plaintext rendered in browser — never sent to server
```

The decrypted private key lives in browser memory only for the duration of step 5.
It is not persisted, not sent anywhere, not written to localStorage.

---

## Password Links (Non-PGP Recipients)

For recipients without an UpInbox account, Alice can send a password-protected link:

```
1. Alice enters a one-time password for the link
2. Browser derives key: PBKDF2(password, random_salt, 500000 iterations, SHA-256)
3. Browser encrypts message: AES-256-GCM(plaintext, derived_key, random_iv)
4. Encrypted blob stored in DB with expiry (default: 7 days)
5. Link sent to recipient: https://upinbox.ai/m/{random_id}
6. Alice shares the password via a separate channel (text, phone, in-person)
7. Recipient visits link, enters password, browser decrypts — server never sees plaintext
```

---

## What the Server Sees

| Data | Stored on Server | Operator Can Read? |
|------|-----------------|-------------------|
| Encrypted email body | ✅ (ciphertext) | ❌ No — no decryption key |
| Encrypted subject | ✅ (ciphertext) | ❌ No |
| Sender email address | ✅ (plaintext header) | ✅ Yes — metadata only |
| Recipient email address | ✅ (plaintext header) | ✅ Yes — metadata only |
| Send timestamp | ✅ | ✅ Yes |
| Your public key | ✅ | ✅ Yes — it's meant to be public |
| Your private key (raw) | ❌ Never | — |
| Your private key (encrypted blob) | ✅ | ❌ No — encrypted with your password |
| Your password | ❌ Never | — |
| Attachments | ✅ (encrypted) | ❌ No |

---

## Self-Hosted Deployments

For enterprise self-hosters: nothing changes. You run UpInbox on your own server.
Your `PLATFORM_ENCRYPTION_KEY` encrypts IMAP credentials at rest in your DB.
UpInbox Inc. has no access to your server, your DB, or your `PLATFORM_ENCRYPTION_KEY`.

If IT needs "break-glass" access to an employee's email:
- They have DB access (it's their server)
- The DB contains only ciphertext
- They still cannot read email content without the employee's password
- This is a feature, not a bug — it protects the org from insider threats too

---

## Verification

The encryption code is in this repo. Review it:
- `src/lib/mail/crypto/keys.ts` — keypair generation
- `src/lib/mail/crypto/encrypt.ts` — message encryption/decryption
- `src/lib/mail/crypto/credentials.ts` — IMAP credential encryption

Run the tests: `npm test src/__tests__/mail/crypto/`

If you find a flaw in the ZK design, please email [security@upinbox.ai](mailto:security@upinbox.ai).
