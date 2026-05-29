# Security Policy

UpInbox handles email — among the most sensitive personal data. Security reports get top priority.

## Reporting Vulnerabilities

Email security@upgpt.ai with:
- Description of the issue
- Steps to reproduce
- Affected versions / commits
- Your contact info

Do NOT open public GitHub issues for security bugs.

We acknowledge reports within 48 hours and aim for a fix or mitigation within 14 days for critical issues.

## Supported Versions

We support the latest release of the main branch. Self-hosters should track main or use tagged releases.

## Security Model

### What We Encrypt
- Email account passwords / IMAP credentials: AES-256-GCM at rest in Supabase
- Session tokens: HttpOnly cookies, Secure flag in production
- MCP tokens: Hashed in storage (SHA-256), only shown once at creation

### What We Don't Touch
- BYOK API keys for AI providers: stored in browser sessionStorage only, never sent to our server
- Email content: read on-demand from your IMAP provider, never persisted to our database
- VAPID push keys: server-only, never exposed to client

### Capability Verification
The UpGPT JWT verifier uses ES256 with an embedded public key. Self-hosters get cryptographic verification without phoning home to upgpt.ai. The private key NEVER leaves UpGPT's license server.

### RLS (Row-Level Security)
Every table in the upinbox schema enforces ownership via Supabase RLS:
- Account-scoped tables: account_id must belong to auth.uid()
- User-scoped tables: user_id = auth.uid()

This is defense in depth — even if the API layer has a bug, RLS prevents cross-user data access.

## Common Threats and Mitigations

| Threat | Mitigation |
|---|---|
| Stolen API key abuse | Rate limiting on /ai/draft (30/hr), /ai/test (10/hr) |
| IDOR (Insecure Direct Object Reference) | Ownership checks on every API route + RLS |
| XSS via email body | sandboxed iframe with srcDoc, restricted sandbox attributes |
| Tracking pixel deanon | Server-side image proxy with tracker domain blocklist |
| Brute-force login | Supabase Auth rate limiting |
| Cron endpoint abuse | Bearer CRON_SECRET required, IP allowlist optional |
| Self-hoster server attacks | Each self-hosted instance is independent |
| Mobile paywall bypass | JWT-based, cryptographic; app binary is the enforcement point |

## What's NOT in Scope

- Vulnerabilities in Supabase, Next.js, or other upstream dependencies — report to those projects first
- Social engineering against UpGPT staff
- Physical access attacks
- Issues requiring jailbroken devices

## Bug Bounty

We don't have a formal bug bounty yet. Critical reports may be eligible for swag or referral compensation at our discretion.

## Disclosure Timeline

- T+0: Report received
- T+48h: Acknowledgment with initial assessment
- T+14d: Fix or detailed mitigation plan
- T+30d: Public disclosure (CVE if applicable)

We aim to credit reporters in CHANGELOG.md unless they prefer anonymity.
