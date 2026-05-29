# Migration Guide

Moving to UpInbox from another email client.

## From Gmail

You don't need to "move" — just connect Gmail to UpInbox:
1. Settings → Connect account → Google
2. Sign in (OAuth, no password sharing)
3. UpInbox reads via IMAP. Your Gmail account stays as the source of truth.

Recommended for power users: enable IMAP in Gmail Settings → Forwarding and POP/IMAP, then UpInbox can sync archived/labeled state.

## From Apple Mail / Outlook

Same flow — these are IMAP clients too. Connect your underlying email account (iCloud, Outlook, etc.) directly. UpInbox doesn't import from Apple Mail or Outlook — it connects to the source.

## From Superhuman / Hey

Their data lives in your underlying Gmail/iCloud account. Just connect that account. UpInbox replaces the client, not the storage.

## From Self-Hosted Mail (Mailbox.org, Migadu, etc.)

Use the "Other IMAP" option. You'll need:
- IMAP host + port (usually 993, TLS)
- SMTP host + port (usually 465 or 587)
- Email + app password (most providers require app passwords for IMAP clients)

## Importing Old Email

UpInbox doesn't import .mbox or .eml files yet. Your existing email stays where it is — UpInbox is a client.

For long-term archival, we recommend running self-hosted UpInbox alongside a paid mail provider like Migadu or Fastmail.

## Database Migrations (Self-Hosters)

After every git pull, apply pending Supabase migrations:

```bash
npx supabase db push
```

Migrations are append-only and numbered. They preserve all data.

## Breaking Changes

We commit to semantic versioning for major bumps. Self-hosters can stay on a major version indefinitely. Check CHANGELOG.md before pulling.
