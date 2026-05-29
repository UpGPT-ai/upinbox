# @upinbox/client

Official TypeScript client SDK for the [UpInbox](https://upinbox.ai) REST API.

> Your email. Your AI. Your rules.

`@upinbox/client` is a thin, typed wrapper around the UpInbox HTTP API. It
works in any modern JavaScript runtime that provides a global `fetch`
(Node 18+, Bun, Deno, Cloudflare Workers, Vercel Edge, modern browsers).

---

## Installation

```bash
npm install @upinbox/client
# or
pnpm add @upinbox/client
# or
yarn add @upinbox/client
```

> While this package is in pre-release (`0.1.x`), the API surface may change.
> Pin to an exact version in production.

---

## Quick start

```ts
import { UpInboxClient } from '@upinbox/client';

const client = new UpInboxClient({
  baseUrl: 'https://api.upinbox.ai',
  authToken: process.env.UPINBOX_TOKEN!,
});

// List connected mail accounts
const accounts = await client.getAccounts();

// List mailboxes for the first account
const mailboxes = await client.getMailboxes({ accountId: accounts[0].id });

// Page through emails in the inbox
const page = await client.getEmails({
  mailboxId: mailboxes[0].id,
  limit: 25,
  unreadOnly: true,
});

for (const email of page.items) {
  console.log(`${email.from.email}  -  ${email.subject}`);
}
```

---

## Authentication

Pass a Bearer token via the `authToken` option. Tokens can be obtained from
the UpInbox dashboard (`Settings -> Developers -> API tokens`) or minted via
OAuth for end-user installs.

```ts
const client = new UpInboxClient({
  baseUrl: 'https://api.upinbox.ai',
  authToken: 'upinbox_pat_...',
});
```

The token is sent on every request as `Authorization: Bearer <token>`.

---

## API overview

All methods return typed `Promise`s. See `src/index.ts` for full type
definitions and JSDoc on every method.

| Method                          | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `getAccounts()`                 | List connected mail provider accounts.            |
| `getMailboxes(opts?)`           | List mailboxes (optionally filtered by account).  |
| `getEmails(opts?)`              | Paginated email list, with search + filters.      |
| `getEmail(id)`                  | Fetch a single email with full body + attachments.|
| `markRead(id, read?)`           | Mark an email read or unread.                     |
| `archiveEmail(id)`              | Archive an email.                                 |
| `deleteEmail(id)`               | Delete (trash) an email.                          |
| `sendEmail(message)`            | Send a message now.                               |
| `snoozeEmail(id, { until })`    | Snooze an email until a future timestamp.         |
| `scheduleSend(message, { sendAt })` | Schedule a message to be sent later.          |
| `listFollowUps(opts?)`          | List follow-up reminders.                         |
| `getHealthScore({ scopeId })`   | Get inbox health score for an account or mailbox. |

---

## Sending mail

```ts
await client.sendEmail({
  accountId: 'acc_1',
  to: [{ email: 'jane@example.com', name: 'Jane' }],
  cc: [{ email: 'team@example.com' }],
  subject: 'Welcome to UpInbox',
  bodyText: 'Hi Jane, thanks for trying UpInbox!',
  bodyHtml: '<p>Hi Jane, thanks for trying UpInbox!</p>',
});
```

### Scheduled send

```ts
await client.scheduleSend(
  {
    accountId: 'acc_1',
    to: [{ email: 'jane@example.com' }],
    subject: 'Following up',
    bodyText: 'Just checking in!',
  },
  { sendAt: '2026-06-01T15:00:00Z' },
);
```

### Snooze

```ts
await client.snoozeEmail('em_abc', { until: '2026-06-03T09:00:00Z' });
```

---

## Error handling

The client throws typed errors for non-2xx responses. All of them extend
`UpInboxApiError`, so a single `catch` works for the common case.

```ts
import {
  UpInboxClient,
  UpInboxApiError,
  UpInboxNotEntitledError,
  UpInboxRateLimitError,
} from '@upinbox/client';

try {
  await client.sendEmail({ /* ... */ });
} catch (err) {
  if (err instanceof UpInboxRateLimitError) {
    console.warn(`Rate limited. Retry in ${err.retryAfterSeconds ?? '?'}s`);
  } else if (err instanceof UpInboxNotEntitledError) {
    console.warn(`Upgrade required: ${err.requiredEntitlement}`);
  } else if (err instanceof UpInboxApiError) {
    console.error(`UpInbox API ${err.status} ${err.code}: ${err.message}`);
  } else {
    throw err;
  }
}
```

| Error class                  | HTTP status | Code            |
| ---------------------------- | ----------- | --------------- |
| `UpInboxApiError`            | any non-2xx | varies          |
| `UpInboxNotEntitledError`    | 403         | `not_entitled`  |
| `UpInboxRateLimitError`      | 429         | `rate_limited`  |

---

## Custom `fetch` (testing, edge runtimes)

You can inject any `fetch`-compatible implementation. Useful for tests,
mocking, or running on platforms with a non-standard fetch.

```ts
import { UpInboxClient } from '@upinbox/client';

const client = new UpInboxClient({
  baseUrl: 'https://api.upinbox.ai',
  authToken: 'test-token',
  fetch: myMockFetch,
  defaultHeaders: { 'X-Trace-Id': 'abc123' },
});
```

---

## Runtime support

- Node.js 18+
- Bun
- Deno
- Cloudflare Workers / Vercel Edge
- Modern browsers (Chrome, Firefox, Safari, Edge)

No external runtime dependencies — only `fetch`, `URLSearchParams`, and
`JSON`, all of which are platform-native.

---

## License

MIT (c) UpGPT, Inc.
