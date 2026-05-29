# UpInbox API Reference

REST API for UpInbox. All routes under `/api/upinbox/`.

## Authentication

Three accepted auth sources:
1. **Session cookie** (web): set by Supabase Auth after login
2. **UpGPT JWT** (mobile, MCP): `Authorization: Bearer <jwt>`
3. **MCP token**: `Authorization: Bearer upinbox_mcp_<token>` (for MCP endpoint only)

## Accounts

### GET /api/upinbox/accounts
List the user's connected email accounts.

### POST /api/upinbox/accounts/connect
Pre-flight check before opening provider OAuth. Returns 402 if no capability.

## Mailboxes

### GET /api/upinbox/mailboxes?accountId={id}
List folders (mailboxes) for an account.

### POST /api/upinbox/mailbox-order
Persist user's drag-reordered mailbox list.

### DELETE /api/upinbox/mailboxes/empty?accountId={id}&mailboxId={id}
Empty a folder (server-side IMAP EXPUNGE).

## Emails

### GET /api/upinbox/emails?accountId=&mailboxId=&page=&limit=
List emails. Supports search via &search= &from= &subject= &after= &before= &hasAttachment=

### GET /api/upinbox/emails/{id}?accountId={id}
Get full email body with HTML/text parts.

### PATCH /api/upinbox/emails/{id}
Update flags or move:
- Body: { accountId, keywords: { "$seen": true } } — mark read
- Body: { accountId, keywords: { "$flagged": true } } — star
- Body: { accountId, mailboxId } — move to folder

### DELETE /api/upinbox/emails/{id}?accountId={id}
Move to Trash.

### POST /api/upinbox/emails/send
Send a new message. Body: { accountId, to, cc, bcc, subject, body, isHtml, inReplyTo }

## Snooze

### POST /api/upinbox/emails/{id}/snooze
Snooze until unsnoozeAt. Body: { accountId, unsnoozeAt: ISO date }

### DELETE /api/upinbox/emails/{id}/snooze?accountId={id}
Un-snooze.

### GET /api/upinbox/snoozes?accountId={id}
List active snoozes.

## Send Later

### POST /api/upinbox/send-later
Schedule a send. Body: { accountId, sendAt, to, cc, bcc, subject, body }

### DELETE /api/upinbox/send-later/{id}?accountId={id}
Cancel a scheduled send.

## Signatures

### GET /api/upinbox/signatures?accountId={id}
List signatures for an account.

### POST /api/upinbox/signatures
Create. Body: { accountId, name, html, isDefault, useOnReply }

### PATCH /api/upinbox/signatures/{id}
Update.

### DELETE /api/upinbox/signatures/{id}
Delete.

## Labels

### GET /api/upinbox/labels?accountId={id}
List labels.

### POST /api/upinbox/labels/apply
Apply or remove a label. Body: { accountId, emailUid, labelId, apply }

## AI

### POST /api/upinbox/ai/draft
Generate a reply. Body: { subject, from, body, tone, byokKey, byokProvider, byokModel }. Rate-limited 30/hr/user.

### POST /api/upinbox/ai/test
Verify BYOK key. Body: { provider, key, model }. Rate-limited 10/hr/user.

## MCP

### POST /api/upinbox/mcp
JSON-RPC 2.0 MCP server. See [MCP Catalog](./mcp-catalog.md).

## Other

### GET /api/upinbox/billing
Returns active capabilities, plan, accounts used/limit, UpGPT URLs.

### GET /api/upinbox/health
Server health, subsystems status, supported capabilities. No auth required.

### POST /api/upinbox/cron/tick
Internal — dispatches snoozes/sends/reminders. Bearer CRON_SECRET only.

### GET /api/upinbox/proxy?url={encoded}
Image proxy with tracker blocking.

### POST /api/upinbox/push/subscribe
Save Web Push subscription. Body: { subscription }

### POST /api/upinbox/screener/correct
Submit AI screener correction. Body: { accountId, messageId, correctCategory, originalCategory, senderEmail }

## Response Format

Success: `{ ...data }` or `{ ok: true, ...data }`
Error: `{ error: string, status?: number, upgrade?: { url, label, description } }`

## Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 401 | No authentication |
| 402 | Authenticated but missing capability — see `upgrade` field |
| 403 | Forbidden (wrong user, ownership check failed) |
| 404 | Not found |
| 429 | Rate limited — see `retryAfter` |
| 500 | Server error |
