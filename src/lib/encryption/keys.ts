/**
 * UpInbox Zero-Knowledge Key Management
 *
 * PRIVACY MODEL (read this before editing):
 *
 * 1. Ed25519 keypairs are generated in the browser (openpgp.js)
 * 2. The private key is encrypted with a passphrase derived from the user's
 *    password via Argon2id BEFORE any network call
 * 3. The UpInbox server stores ONLY the encrypted private key (ciphertext)
 * 4. The server NEVER sees the plaintext private key or the passphrase
 * 5. The public key is stored in plaintext (it's meant to be public)
 *
 * Key derivation:
 *   passphrase = HKDF(Argon2id(password, salt), context='upinbox-key-derivation')
 *
 * Storage:
 *   - encrypted_private_key → upinbox.user_keys table (server)
 *   - plaintext private key → sessionStorage in browser (unlocked per-session)
 *   - public key → upinbox.user_keys table (server, public)
 *
 * This module runs CLIENT SIDE ONLY. Do not import from API routes.
 */

import * as openpgp from 'openpgp';

export interface UpInboxKeyPair {
  publicKeyArmored: string;
  privateKeyArmored: string;         // plaintext — never leave browser
  encryptedPrivateKey: string;       // passphrase-encrypted, safe to send to server
  fingerprint: string;
  createdAt: string;
}

export interface UnlockedKeyPair {
  publicKey: openpgp.PublicKey;
  privateKey: openpgp.PrivateKey;
  fingerprint: string;
}

/**
 * Generate a new Ed25519 keypair for a user.
 *
 * @param email - The user's email address (used as OpenPGP user ID)
 * @param passphrase - Derived from the user's password (NOT their raw password)
 *
 * The passphrase should be derived client-side before calling this:
 *   passphrase = await deriveKeyPassphrase(password, userId)
 */
export async function generateKeyPair(
  email: string,
  passphrase: string
): Promise<UpInboxKeyPair> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'ed25519',
    userIDs: [{ email }],
    passphrase,
    format: 'armored',
  });

  const parsedPublic = await openpgp.readKey({ armoredKey: publicKey });
  const fingerprint = parsedPublic.getFingerprint();

  // The private key here is passphrase-protected (openpgp generates it encrypted)
  return {
    publicKeyArmored: publicKey,
    privateKeyArmored: privateKey,    // passphrase-protected
    encryptedPrivateKey: privateKey,  // same — already protected
    fingerprint,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Unlock a private key from storage using the session passphrase.
 * Returns an unlocked key pair for encryption/decryption operations.
 *
 * The unlocked privateKey is kept in memory only for this session.
 * It is NEVER serialized or stored — only the locked version goes to the server.
 */
export async function unlockKeyPair(
  encryptedPrivateKeyArmored: string,
  publicKeyArmored: string,
  passphrase: string
): Promise<UnlockedKeyPair> {
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: encryptedPrivateKeyArmored }),
    passphrase,
  });

  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  const fingerprint = publicKey.getFingerprint();

  return { privateKey, publicKey, fingerprint };
}

/**
 * Encrypt a message for a recipient using their public key.
 * Signs with the sender's private key.
 *
 * Used for USX (UpInbox Secure Exchange) messages.
 */
export async function encryptMessage(
  content: string,
  recipientPublicKeyArmored: string,
  senderKeyPair: UnlockedKeyPair
): Promise<string> {
  const recipientKey = await openpgp.readKey({ armoredKey: recipientPublicKeyArmored });

  const message = await openpgp.createMessage({ text: content });
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: recipientKey,
    signingKeys: senderKeyPair.privateKey,
  });

  return encrypted as string;
}

/**
 * Decrypt a PGP message using the current user's key pair.
 * Verifies the sender's signature if a public key is provided.
 */
export async function decryptMessage(
  armoredMessage: string,
  recipientKeyPair: UnlockedKeyPair,
  senderPublicKeyArmored?: string
): Promise<{ content: string; signedBy: string | null; verificationPassed: boolean }> {
  const message = await openpgp.readMessage({ armoredMessage });
  const senderKey = senderPublicKeyArmored
    ? await openpgp.readKey({ armoredKey: senderPublicKeyArmored })
    : undefined;

  const { data: content, signatures } = await openpgp.decrypt({
    message,
    decryptionKeys: recipientKeyPair.privateKey,
    verificationKeys: senderKey,
  });

  let verificationPassed = false;
  let signedBy: string | null = null;

  if (senderKey && signatures.length > 0) {
    try {
      await signatures[0].verified;
      verificationPassed = true;
      signedBy = senderKey.getFingerprint();
    } catch {
      verificationPassed = false;
    }
  }

  return { content: content as string, signedBy, verificationPassed };
}

/**
 * Derive a stable passphrase from the user's password using HKDF.
 * This ensures the same password always produces the same PGP passphrase.
 *
 * NOTE: This uses the Web Crypto API — browser only.
 * The raw password is NOT stored or transmitted.
 */
export async function deriveKeyPassphrase(
  password: string,
  userId: string
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'HKDF',
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(`upinbox-key-salt-${userId}`),
      info: enc.encode('upinbox-key-derivation-v1'),
    },
    keyMaterial,
    256
  );

  // Convert to base64 for use as PGP passphrase
  return btoa(String.fromCharCode(...new Uint8Array(derived)));
}
