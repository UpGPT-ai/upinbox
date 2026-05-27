# USX Protocol — UpInbox Secure Exchange

USX is a lightweight protocol for encrypted email delivery between UpInbox users
and any compatible server. It uses DNS for discovery and OpenPGP for encryption.

---

## What USX Solves

Standard email between two UpInbox users still routes through SMTP, which:
- Means cleartext email sitting in SMTP servers between hops
- Gives server operators the ability to read mail in transit
- Has no cryptographic proof of endpoint authenticity

USX routes encrypted messages directly between JMAP endpoints — bypassing SMTP
for user-to-user delivery. When both sides support USX, the 🔒 indicator appears.

---

## DNS Discovery

A server that supports USX publishes a DNS TXT record:

```
_upinbox.example.com  TXT  "v=USX1; endpoint=https://jmap.example.com/usx; fp=sha256:ABC123"
```

| Field | Description |
|-------|-------------|
| `v=USX1` | Protocol version |
| `endpoint` | HTTPS URL that accepts USX delivery |
| `fp` | SHA-256 fingerprint of the TLS certificate at that endpoint |

The fingerprint is a trust anchor — man-in-the-middle attacks are detectable because
the attacker's certificate fingerprint won't match the DNS record.

**UpInbox's record:**
```
_upinbox.upinbox.ai  TXT  "v=USX1; endpoint=https://jmap.upinbox.ai/usx; fp=sha256:..."
```

---

## Delivery Flow

When Alice (on `alice.com`) sends to Bob (on `upinbox.ai`):

```
1. Alice's mail server queries DNS for _upinbox.upinbox.ai
   → Gets USX record with endpoint + fingerprint

2. Alice's server verifies the TLS cert at that endpoint matches fp
   → Protects against DNS spoofing

3. Alice's browser encrypts message with Bob's public key (fetched from Bob's server)
   → openpgp.encrypt({ encryptionKeys: [bobPublicKey], signingKeys: [alicePrivateKey] })

4. POST https://jmap.upinbox.ai/usx
   {
     "from": "alice@alice.com",
     "to": "bob@upinbox.ai",
     "ciphertext": "-----BEGIN PGP MESSAGE-----...",
     "alicePublicKey": "-----BEGIN PGP PUBLIC KEY BLOCK-----..."
   }

5. Bob's server stores the ciphertext and notifies Bob's client via JMAP push
6. Bob's browser decrypts with his private key (never left his browser)
```

The server at step 4 receives only ciphertext. It verifies that `from` resolves to
a USX-capable domain (to prevent spoofing), stores the blob, and that's it.

---

## The 🔒 Trust Indicator

The lock icon appears in the UpInbox UI when:
1. The sending domain has a valid `_upinbox` DNS record
2. The receiving domain has a valid `_upinbox` DNS record
3. The TLS certificate at both endpoints matches the DNS fingerprint
4. The message was delivered via USX (not SMTP fallback)

When the lock is **absent**, the email was delivered via standard SMTP. It may or may
not be encrypted at rest — but it transited the internet as standard email.

---

## SMTP Fallback

If the recipient domain has no USX record, UpInbox falls back to standard SMTP delivery.
The email is still encrypted at rest in UpInbox's storage if the sender is an UpInbox user,
but transit encryption depends on SMTP TLS negotiation with the receiving server.

---

## USX Relay (for Gmail/Outlook Users)

Gmail and Outlook users who install the UpInbox Chrome extension can send USX-encrypted
messages via a relay endpoint at `https://api.upinbox.ai/relay/usx`:

```
Gmail user sends USX:
  Extension encrypts message in browser with recipient's public key
  → POST /api/upinbox/relay/usx { ciphertext, to, fromDomain }
  → Relay verifies recipient's USX DNS record
  → Relay posts to recipient's USX endpoint
  → Relay logs: { fromDomain, toDomain, timestamp } — NO content
```

The relay never sees the plaintext. It only forwards the ciphertext.

---

## Self-Hosting USX

To enable USX on your self-hosted instance:

```bash
# 1. Get your TLS certificate fingerprint
openssl s_client -connect jmap.yourdomain.com:443 < /dev/null 2>/dev/null \
  | openssl x509 -fingerprint -sha256 -noout \
  | sed 's/://g; s/SHA256 Fingerprint=//; tr A-F a-f'

# 2. Add DNS TXT record at your DNS provider:
_upinbox.yourdomain.com  TXT  "v=USX1; endpoint=https://jmap.yourdomain.com/usx; fp=sha256:YOUR_FINGERPRINT"

# 3. Verify discovery works:
dig TXT _upinbox.yourdomain.com

# 4. Test USX delivery:
curl -X POST https://jmap.yourdomain.com/usx \
  -H "Content-Type: application/json" \
  -d '{"ping": true}'
# → {"pong": true, "version": "USX1"}
```

Once the DNS record is live, the 🔒 indicator will appear when exchanging mail with
other USX-capable users.

---

## Registering with the USX Network

Optionally register at `https://upinbox.ai/network/register` to:
- Get the 🔒 indicator recognized by all UpInbox clients
- Receive security patch notifications for self-hosted instances
- Appear in the UpInbox trusted server directory

Registration requires: your domain, your USX endpoint, and that the fingerprint
resolves correctly. No login or account required. The registry is read-only public.
