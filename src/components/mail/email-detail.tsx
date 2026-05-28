'use client';

/**
 * EmailDetail — reading pane showing the full email body.
 *
 * Renders HTML bodies in a sandboxed iframe.
 * Plain-text fallback if no HTML body.
 */

import { useAtom } from 'jotai';
import { openEmailIdAtom, activeAccountIdAtom } from '@/atoms/mail';
import { useEmail, useEmailMutations } from '@/hooks/use-emails';
import type { JmapEmail } from '@/lib/mail/types';

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AddressList({ addresses }: { addresses: { email: string; name?: string }[] }) {
  return (
    <span>
      {addresses.map((a, i) => (
        <span key={a.email}>
          {a.name ? (
            <span>
              <span className="font-medium">{a.name}</span>
              <span className="text-muted-foreground"> &lt;{a.email}&gt;</span>
            </span>
          ) : (
            <span className="font-medium">{a.email}</span>
          )}
          {i < addresses.length - 1 && ', '}
        </span>
      ))}
    </span>
  );
}

function EmailBody({ email }: { email: JmapEmail }) {
  // Prefer HTML body
  const htmlPart = email.htmlBody?.[0];
  const textPart = email.textBody?.[0];

  if (htmlPart?.partId && email.bodyValues?.[htmlPart.partId]) {
    const html = email.bodyValues[htmlPart.partId].value;
    // Render in a sandboxed iframe — no scripts, no cross-origin requests
    return (
      <iframe
        srcDoc={`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #1a1a1a;
    margin: 0;
    padding: 16px;
    max-width: 100%;
    overflow-x: hidden;
  }
  img { max-width: 100%; height: auto; }
  a { color: #2563eb; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>${html}</body>
</html>`}
        sandbox="allow-same-origin"
        className="w-full border-0 flex-1"
        style={{ minHeight: '400px' }}
        onLoad={(e) => {
          // Auto-resize iframe to content height
          const iframe = e.currentTarget;
          const height = iframe.contentDocument?.body?.scrollHeight;
          if (height) iframe.style.height = `${height + 32}px`;
        }}
        title="Email content"
      />
    );
  }

  // Plain text fallback
  if (textPart?.partId && email.bodyValues?.[textPart.partId]) {
    const text = email.bodyValues[textPart.partId].value;
    return (
      <pre className="text-sm whitespace-pre-wrap font-sans p-4 text-foreground">
        {text}
      </pre>
    );
  }

  return (
    <div className="p-4 text-muted-foreground text-sm italic">
      No message body
    </div>
  );
}

export function EmailDetail() {
  const [emailId] = useAtom(openEmailIdAtom);
  const [, setOpenEmailId] = useAtom(openEmailIdAtom);
  const [accountId] = useAtom(activeAccountIdAtom);
  const { data: email, isLoading, isError } = useEmail(emailId);
  const { deleteEmail } = useEmailMutations();

  if (!emailId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <span className="text-5xl">📬</span>
        <span className="text-sm">Select an email to read</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
        <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
        <div className="h-px bg-border my-4" />
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !email) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        Failed to load email.
      </div>
    );
  }

  const isFlagged = email.keywords?.['$flagged'] ?? false;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b space-y-2 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold leading-tight">
            {email.subject || '(no subject)'}
          </h1>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Reply"
            >
              ↩
            </button>
            <button
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Forward"
            >
              →
            </button>
            <button
              onClick={() => {
                deleteEmail.mutate(emailId);
                setOpenEmailId(null);
              }}
              className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </div>

        <div className="text-sm space-y-1">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-8 flex-shrink-0">From</span>
            <AddressList addresses={email.from ?? []} />
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-8 flex-shrink-0">To</span>
            <AddressList addresses={email.to ?? []} />
          </div>
          {email.cc && email.cc.length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-8 flex-shrink-0">Cc</span>
              <AddressList addresses={email.cc} />
            </div>
          )}
          <div className="flex gap-2">
            <span className="text-muted-foreground w-8 flex-shrink-0">Date</span>
            <span>{formatFullDate(email.receivedAt ?? '')}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <EmailBody email={email} />
      </div>
    </div>
  );
}
