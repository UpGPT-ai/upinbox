# MCP Tool Catalog

UpInbox exposes these tools to Claude (and other MCP clients) via /api/upinbox/mcp.

## Authentication

Generate a token in Settings → MCP Tokens. Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "upinbox": {
      "url": "https://mail.upinbox.ai/api/upinbox/mcp",
      "headers": { "Authorization": "Bearer upinbox_mcp_xxxx" }
    }
  }
}
```

Tokens are scoped — pick the capabilities each token can use.

## Tools

### list_emails
List emails from a folder.
Args: { accountId, mailboxId, limit?, query? }
Returns: { emails: [{id, subject, from, receivedAt, snippet, isUnread}] }

### get_email
Get full email body.
Args: { accountId, emailId }
Returns: { id, subject, from, to, cc, body, htmlBody, attachments, headers }

### search_emails
Full-text search across emails.
Args: { accountId, query, from?, subject?, after?, before?, hasAttachment? }
Returns: { emails: [...] }

### draft_reply
Generate a draft reply (uses your configured AI). Does NOT send.
Args: { accountId, originalEmailId, tone?: 'formal'|'friendly'|'brief'|'apologetic' }
Returns: { body: string, bodyHtml: string }

### send_email
Send a new message.
Args: { accountId, to, cc?, bcc?, subject, body, isHtml?, inReplyTo? }
Returns: { ok: true, messageId }

### snooze_email
Snooze an email until a date.
Args: { accountId, emailId, unsnoozeAt }
Returns: { ok: true }

### list_mailboxes
List folders for an account.
Args: { accountId }
Returns: { mailboxes: [{id, name, role, unreadCount}] }

### move_email
Move email to a different folder (including archive/trash).
Args: { accountId, emailId, toMailboxId }
Returns: { ok: true }

## Required Capability

The 'mcp' capability is required on your UpGPT subscription. Without it, MCP calls return JSON-RPC error -32001.

## Rate Limits

- list_emails, search_emails: 60 calls/min
- get_email: 200 calls/min
- send_email: 30 calls/min
- draft_reply: 30 calls/min

## Use Cases

**"Summarize my inbox"**: list_emails + get_email batch + Claude summarization
**"Reply to Alex's email"**: search_emails(from=Alex) + draft_reply + (you review) → send_email
**"Triage today's email"**: list_emails(today) + Claude rules per email → snooze/archive/draft
**"Build my morning brief"**: search_emails(after=yesterday) + Claude extraction → Slack/Notion
