'use client';

/**
 * EmailDetail — reading pane showing the full email body.
 *
 * Features:
 * - Renders HTML in sandboxed iframe; plain-text fallback
 * - Tracker stripper: rewrites all img src= through proxy, counts tracking pixels
 * - Reply / Reply-all / Forward wire into composeDraftAtom
 * - Mark as read automatically on open
 * - Label chips + apply/remove labels dropdown
 * - Delete, flag/unflag
 * - Archive button (moves to archive mailbox)
 * - Snooze button with SnoozeSelector dropdown
 * - Smart reply chips (subject-aware quick replies)
 * - AI summarize button (✨) with amber summary panel
 * - Follow-up button with FollowUpSelector dropdown
 */

import { useEffect, useCallback, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { openEmailIdAtom, activeAccountIdAtom, composeDraftAtom, byokApiKeyAtom, byokProviderAtom } from '@/atoms/mail';
import { useEmail, useEmailMutations } from '@/hooks/use-emails';
import { useAccounts } from '@/hooks/use-accounts';
import { useLabels, useApplyLabel, useEmailLabels, type Label } from '@/hooks/use-labels';
import { useMailboxes } from '@/hooks/use-mailboxes';
import { SnoozeSelector } from '@/components/mail/snooze-selector';
import { SmartReplyChips } from '@/components/mail/smart-reply-chips';
import { FollowUpSelector } from '@/components/mail/follow-up-selector';
import type { JmapEmail } from '@/lib/mail/types';
import type { ComposeDraft } from '@/atoms/mail';

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
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

// ── Tracker stripper ──────────────────────────────────────────────────────────

function stripTrackers(html: string): { html: string; trackerCount: number } {
  let trackerCount = 0;
  // Rewrite all img src attributes to go through proxy
  const rewritten = html.replace(
    /(<img[^>]*\s)src=["']([^"']+)["']/gi,
    (match, prefix, srcUrl) => {
      if (!srcUrl.startsWith('http')) return match;
      const proxied = '/api/upinbox/proxy?url=' + encodeURIComponent(srcUrl);
      // Heuristic: 1x1 images and known tracking patterns
      if (srcUrl.includes('tracking') || srcUrl.includes('open') || srcUrl.includes('pixel') ||
          srcUrl.includes('beacon') || srcUrl.includes('track') || srcUrl.match(/\/[a-f0-9]{20,}\.gif/)) {
        trackerCount++;
      }
      return prefix + 'src="' + proxied + '"';
    }
  );
  return { html: rewritten, trackerCount };
}

// ── EmailBody ─────────────────────────────────────────────────────────────────

function EmailBody({
  email,
  onTrackerCount,
}: {
  email: JmapEmail;
  onTrackerCount?: (n: number) => void;
}) {
  const htmlPart = email.htmlBody?.[0];
  const textPart = email.textBody?.[0];

  if (htmlPart?.partId && email.bodyValues?.[htmlPart.partId]) {
    const rawHtml = email.bodyValues[htmlPart.partId].value;
    const { html, trackerCount } = stripTrackers(rawHtml);

    // Report tracker count to parent
    if (onTrackerCount) {
      // Use a microtask to avoid calling setState during render
      Promise.resolve().then(() => onTrackerCount(trackerCount));
    }

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
    font-size: 14px; line-height: 1.6; color: #1a1a1a;
    margin: 0; padding: 16px; max-width: 100%; overflow-x: hidden;
  }
  img { max-width: 100%; height: auto; }
  a { color: #2563eb; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  blockquote { border-left: 3px solid #d1d5db; margin: 0; padding-left: 12px; color: #6b7280; }
</style>
</head>
<body>${html}</body>
</html>`}
        sandbox="allow-same-origin"
        className="w-full border-0 flex-1"
        style={{ minHeight: '400px' }}
        onLoad={(e) => {
          const iframe = e.currentTarget;
          const height = iframe.contentDocument?.body?.scrollHeight;
          if (height) iframe.style.height = `${height + 32}px`;
        }}
        title="Email content"
      />
    );
  }

  if (textPart?.partId && email.bodyValues?.[textPart.partId]) {
    const text = email.bodyValues[textPart.partId].value;
    return (
      <pre className="text-sm whitespace-pre-wrap font-sans p-4 text-foreground">
        {text}
      </pre>
    );
  }

  return (
    <div className="p-4 text-muted-foreground text-sm italic">No message body</div>
  );
}

// ── Build quoted body for reply / forward ─────────────────────────────────────

function extractPlainText(email: JmapEmail): string {
  const textPart = email.textBody?.[0];
  if (textPart?.partId && email.bodyValues?.[textPart.partId]) {
    return email.bodyValues[textPart.partId].value;
  }
  const htmlPart = email.htmlBody?.[0];
  if (htmlPart?.partId && email.bodyValues?.[htmlPart.partId]) {
    return email.bodyValues[htmlPart.partId].value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
  return '';
}

function buildReplyDraft(email: JmapEmail, mode: 'reply' | 'reply-all', identityEmail?: string): ComposeDraft {
  const fromAddr = email.from?.[0];
  const replyTo = [fromAddr?.email ?? ''].filter(Boolean);

  let cc: string[] = [];
  if (mode === 'reply-all') {
    const allTo = (email.to ?? []).map((a) => a.email);
    const allCc = (email.cc ?? []).map((a) => a.email);
    cc = [...allTo, ...allCc].filter((e) => e !== identityEmail);
  }

  const subject = email.subject
    ? (email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`)
    : 'Re:';

  const originalBody = extractPlainText(email);
  const dateLine = email.receivedAt ? formatFullDate(email.receivedAt) : '';
  const fromLine = fromAddr?.name
    ? `${fromAddr.name} <${fromAddr.email}>`
    : (fromAddr?.email ?? '');

  const quotedBody = `\n\n\nOn ${dateLine}, ${fromLine} wrote:\n${
    originalBody.split('\n').map((l) => `> ${l}`).join('\n')
  }`;

  return {
    mode,
    to: replyTo,
    cc,
    bcc: [],
    subject,
    body: quotedBody,
    inReplyToId: email.messageId?.[0],
    identityEmail,
  };
}

function buildForwardDraft(email: JmapEmail, identityEmail?: string): ComposeDraft {
  const subject = email.subject
    ? (email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`)
    : 'Fwd:';

  const fromLine = (email.from ?? []).map((a) => a.name ? `${a.name} <${a.email}>` : a.email).join(', ');
  const toLine = (email.to ?? []).map((a) => a.email).join(', ');
  const dateLine = email.receivedAt ? formatFullDate(email.receivedAt) : '';
  const originalBody = extractPlainText(email);

  const body = `\n\n---------- Forwarded message ----------\nFrom: ${fromLine}\nDate: ${dateLine}\nSubject: ${email.subject ?? ''}\nTo: ${toLine}\n\n${originalBody}`;

  return {
    mode: 'forward',
    to: [],
    cc: [],
    bcc: [],
    subject,
    body,
    identityEmail,
  };
}

// ── Label menu ────────────────────────────────────────────────────────────────

function LabelMenu({
  accountId,
  emailUid,
  onClose,
}: {
  accountId: string;
  emailUid: string;
  onClose: () => void;
}) {
  const { data: allLabels = [] } = useLabels(accountId);
  const { data: emailLabels = [] } = useEmailLabels(accountId, emailUid);
  const applyLabel = useApplyLabel();

  const appliedIds = new Set(emailLabels.map((l: Label) => l.id));

  const toggle = (label: Label) => {
    applyLabel.mutate({
      accountId,
      emailUid,
      labelId: label.id,
      apply: !appliedIds.has(label.id),
    });
  };

  return (
    <div className="absolute top-8 right-0 z-50 bg-popover border rounded-xl shadow-xl w-48 py-1 overflow-hidden">
      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Labels
      </div>
      {allLabels.map((label: Label) => (
        <button
          key={label.id}
          onClick={() => toggle(label)}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: label.color }}
          />
          <span className="flex-1 text-left truncate">{label.name}</span>
          {appliedIds.has(label.id) && <span className="text-primary text-xs">✓</span>}
        </button>
      ))}
      {allLabels.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
      )}
      <div className="border-t mt-1 pt-1">
        <button
          onClick={onClose}
          className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EmailDetail() {
  const [emailId, setOpenEmailId] = useAtom(openEmailIdAtom);
  const accountId = useAtomValue(activeAccountIdAtom);
  const [, setComposeDraft] = useAtom(composeDraftAtom);
  const byokApiKey = useAtomValue(byokApiKeyAtom);
  const byokProvider = useAtomValue(byokProviderAtom);
  const { data: email, isLoading, isError } = useEmail(emailId);
  const { deleteEmail, markRead, snoozeEmail, moveEmail } = useEmailMutations();
  const { data: accounts = [] } = useAccounts();
  const { data: mailboxes = [] } = useMailboxes(accountId);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [trackerCount, setTrackerCount] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const identityEmail = accounts.find((a) => a.id === accountId)?.email_address;

  // The IMAP UID is stored in the id field (or we use the email's id as uid)
  const emailUid = email?.id ?? null;
  const { data: emailLabels = [] } = useEmailLabels(accountId, emailUid);

  // Reset tracker count, summary, and follow-up state when email changes
  useEffect(() => {
    setTrackerCount(0);
    setSummary(null);
    setSummarizing(false);
    setShowFollowUp(false);
  }, [emailId]);

  // Mark as read when opened (if unread)
  useEffect(() => {
    if (!emailId || !email) return;
    const isRead = email.keywords?.['$seen'] ?? false;
    if (!isRead) {
      markRead.mutate({ emailId, read: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId, email?.id]);

  const handleReply = useCallback(() => {
    if (!email) return;
    setComposeDraft(buildReplyDraft(email, 'reply', identityEmail));
  }, [email, identityEmail, setComposeDraft]);

  const handleReplyAll = useCallback(() => {
    if (!email) return;
    setComposeDraft(buildReplyDraft(email, 'reply-all', identityEmail));
  }, [email, identityEmail, setComposeDraft]);

  const handleForward = useCallback(() => {
    if (!email) return;
    setComposeDraft(buildForwardDraft(email, identityEmail));
  }, [email, identityEmail, setComposeDraft]);

  const handleArchive = useCallback(() => {
    if (!emailId) return;
    const archiveMailbox = mailboxes.find((m) => m.role === 'archive');
    if (!archiveMailbox) return;
    moveEmail.mutate({ emailId, toMailboxId: archiveMailbox.id });
    setOpenEmailId(null);
  }, [emailId, mailboxes, moveEmail, setOpenEmailId]);

  const handleSnooze = useCallback((unsnoozeAt: Date) => {
    if (!emailId) return;
    snoozeEmail.mutate({ emailId, unsnoozeAt });
    setShowSnooze(false);
    // Toast: "Snoozed until [date]"
    const label = unsnoozeAt.toLocaleString([], {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    // Use browser alert as lightweight toast if no toast library is wired up
    console.info(`Snoozed until ${label}`);
  }, [emailId, snoozeEmail]);

  const handleSmartReplySelect = useCallback((text: string) => {
    if (!email) return;
    const draft = buildReplyDraft(email, 'reply', identityEmail);
    // Prepend the selected chip text before the quoted body
    setComposeDraft({ ...draft, body: text + draft.body });
  }, [email, identityEmail, setComposeDraft]);

  const handleSummarize = useCallback(async () => {
    if (!email || summarizing) return;
    const body = extractPlainText(email);
    if (!body || body.length < 100) return;

    setSummarizing(true);
    setSummary(null);
    try {
      const res = await fetch('/api/upinbox/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize',
          emailId: email.id,
          subject: email.subject ?? '',
          body,
          byokApiKey: byokApiKey || undefined,
          byokProvider: byokProvider || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSummary(data.summary ?? data.draft ?? data.text ?? 'No summary returned.');
    } catch (err) {
      setSummary(`Could not summarize: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSummarizing(false);
    }
  }, [email, summarizing, byokApiKey, byokProvider]);

  // Determine if body is substantial enough to summarize (>100 chars plain text)
  const bodyText = email ? extractPlainText(email) : '';
  const isBodySubstantial = bodyText.length >= 100;

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
            <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + (i * 7) % 40}%` }} />
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
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="text-lg font-semibold leading-tight">
              {email.subject || '(no subject)'}
            </h1>
            {/* Tracker badge */}
            {trackerCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 self-start">
                🛡️ {trackerCount} tracker{trackerCount !== 1 ? 's' : ''} stripped
              </span>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0 relative">
            <button
              onClick={handleReply}
              className="px-2 py-1 rounded hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              title="Reply"
            >
              <span>↩</span>
              <span className="hidden sm:inline text-xs">Reply</span>
            </button>
            <button
              onClick={handleReplyAll}
              className="px-2 py-1 rounded hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              title="Reply all"
            >
              <span>↩↩</span>
              <span className="hidden sm:inline text-xs">All</span>
            </button>
            <button
              onClick={handleForward}
              className="px-2 py-1 rounded hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              title="Forward"
            >
              <span>→</span>
              <span className="hidden sm:inline text-xs">Fwd</span>
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            {/* Summarize button — only shown when body is substantial */}
            {isBodySubstantial && (
              <button
                onClick={handleSummarize}
                disabled={summarizing}
                className="px-2 py-1 rounded hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Summarize with AI"
              >
                <span>✨</span>
                <span className="hidden sm:inline text-xs">
                  {summarizing ? 'Summarizing…' : 'Summarize'}
                </span>
              </button>
            )}
            {/* Archive button */}
            <button
              onClick={handleArchive}
              className="px-2 py-1 rounded hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              title="Archive (E)"
            >
              <span>📦</span>
              <span className="hidden sm:inline text-xs">Archive</span>
            </button>
            {/* Snooze button */}
            <div className="relative">
              <button
                onClick={() => setShowSnooze((v) => !v)}
                className="px-2 py-1 rounded hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Snooze (H)"
              >
                <span>🔔</span>
                <span className="hidden sm:inline text-xs">Snooze</span>
              </button>
              {showSnooze && accountId && email && (
                <SnoozeSelector
                  emailId={email.id}
                  accountId={accountId}
                  onSnooze={handleSnooze}
                  onClose={() => setShowSnooze(false)}
                />
              )}
            </div>
            {/* Follow-up button */}
            <div className="relative">
              <button
                onClick={() => setShowFollowUp((v) => !v)}
                className="px-2 py-1 rounded hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                title="Set follow-up reminder"
              >
                <span>🔔</span>
                <span className="hidden sm:inline text-xs">Follow-up</span>
              </button>
              {showFollowUp && accountId && email && (
                <FollowUpSelector
                  emailId={email.id}
                  accountId={accountId}
                  threadSubject={email.subject ?? undefined}
                  onClose={() => setShowFollowUp(false)}
                />
              )}
            </div>
            {/* Label button */}
            <div className="relative">
              <button
                onClick={() => setShowLabelMenu((v) => !v)}
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Labels"
              >
                🏷️
              </button>
              {showLabelMenu && accountId && emailUid && (
                <LabelMenu
                  accountId={accountId}
                  emailUid={emailUid}
                  onClose={() => setShowLabelMenu(false)}
                />
              )}
            </div>
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

        {/* Smart reply chips — between action buttons and From/To rows */}
        <SmartReplyChips
          subject={email.subject}
          onSelect={handleSmartReplySelect}
        />

        {/* AI summary panel */}
        {summary !== null && (
          <div className="relative rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            <button
              onClick={() => setSummary(null)}
              className="absolute top-1.5 right-2 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 text-xs leading-none"
              title="Dismiss summary"
              aria-label="Dismiss summary"
            >
              ✕
            </button>
            <p className="pr-5 leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Label chips */}
        {emailLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {emailLabels.map((label: Label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

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
          {email.hasAttachment && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-8 flex-shrink-0">📎</span>
              <span className="text-xs text-muted-foreground">Has attachment(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <EmailBody email={email} onTrackerCount={setTrackerCount} />
      </div>
    </div>
  );
}
