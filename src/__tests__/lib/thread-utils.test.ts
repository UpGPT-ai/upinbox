/**
 * Tests for thread grouping utilities — normalizeSubject, getThreadSnippet,
 * groupIntoThreads.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSubject,
  getThreadSnippet,
  groupIntoThreads,
} from '@/lib/mail/thread-utils';
import { JmapEmail } from '@/lib/mail/types';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

interface MakeEmailOpts {
  id: string;
  subject?: string;
  receivedAt?: string;
  messageId?: string[];
  inReplyTo?: string[];
  threadId?: string;
  from?: Array<{ email: string; name?: string }>;
  to?: Array<{ email: string; name?: string }>;
  seen?: boolean;
  preview?: string;
  textBody?: Array<{ partId: string; value: string }>;
  htmlBody?: Array<{ partId: string; value: string }>;
}

function makeEmail(opts: MakeEmailOpts): JmapEmail {
  const bodyValues: Record<string, { value: string; isTruncated?: boolean }> = {};

  const textBodyParts = (opts.textBody ?? []).map((b) => {
    bodyValues[b.partId] = { value: b.value };
    return { partId: b.partId, type: 'text/plain' };
  });

  const htmlBodyParts = (opts.htmlBody ?? []).map((b) => {
    bodyValues[b.partId] = { value: b.value };
    return { partId: b.partId, type: 'text/html' };
  });

  const keywords: Record<string, boolean> = {};
  if (opts.seen) keywords['$seen'] = true;

  return {
    id: opts.id,
    blobId: `blob-${opts.id}`,
    threadId: opts.threadId ?? '',
    mailboxIds: {},
    keywords,
    size: 1024,
    receivedAt: opts.receivedAt ?? '2026-01-01T00:00:00.000Z',
    messageId: opts.messageId,
    inReplyTo: opts.inReplyTo,
    subject: opts.subject,
    from: opts.from,
    to: opts.to,
    cc: undefined,
    bcc: undefined,
    replyTo: undefined,
    bodyValues,
    textBody: textBodyParts,
    htmlBody: htmlBodyParts,
    attachments: [],
    hasAttachment: false,
    preview: opts.preview,
  };
}

// ─── normalizeSubject ────────────────────────────────────────────────────────

describe('normalizeSubject', () => {
  it('strips Re: prefix', () => {
    expect(normalizeSubject('Re: Meeting tomorrow')).toBe('Meeting tomorrow');
  });

  it('strips Fwd: prefix', () => {
    expect(normalizeSubject('Fwd: Quarterly report')).toBe('Quarterly report');
  });

  it('strips Fw: prefix', () => {
    expect(normalizeSubject('Fw: Heads up')).toBe('Heads up');
  });

  it('strips multiple nested Re:/Fwd: prefixes', () => {
    expect(normalizeSubject('Re: Re: Fwd: Project status')).toBe('Project status');
  });

  it('strips case-insensitive variants (RE:, re:, FWD:)', () => {
    expect(normalizeSubject('RE: hello')).toBe('hello');
    expect(normalizeSubject('re: hello')).toBe('hello');
    expect(normalizeSubject('FWD: hello')).toBe('hello');
  });

  it('strips bracketed tags before Re:', () => {
    expect(normalizeSubject('[Team] Re: Sprint plan')).toBe('Sprint plan');
    expect(normalizeSubject('[EXTERNAL] Fwd: Invoice')).toBe('Invoice');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSubject('   Re: padded   ')).toBe('padded');
    expect(normalizeSubject('\tRe:\tTabbed\t')).toBe('Tabbed');
  });

  it('preserves regular subjects unchanged', () => {
    expect(normalizeSubject('Meeting tomorrow')).toBe('Meeting tomorrow');
    expect(normalizeSubject('Q4 planning session')).toBe('Q4 planning session');
  });

  it('returns empty string for empty/undefined input', () => {
    expect(normalizeSubject('')).toBe('');
  });

  it('preserves subjects that merely contain "Re" as a word', () => {
    // "Regarding" begins with "Re" but is not the Re: prefix.
    expect(normalizeSubject('Regarding the proposal')).toBe('Regarding the proposal');
  });
});

// ─── getThreadSnippet ────────────────────────────────────────────────────────

describe('getThreadSnippet', () => {
  it('uses preview when available', () => {
    const email = makeEmail({ id: 'e1', preview: 'Hello there friend' });
    expect(getThreadSnippet(email)).toBe('Hello there friend');
  });

  it('returns at most 120 characters', () => {
    const longText = 'A'.repeat(500);
    const email = makeEmail({ id: 'e1', preview: longText });
    const snippet = getThreadSnippet(email);
    expect(snippet.length).toBe(120);
    expect(snippet).toBe('A'.repeat(120));
  });

  it('truncates long plain-text bodies to 120 chars', () => {
    const longText = 'B'.repeat(500);
    const email = makeEmail({
      id: 'e1',
      textBody: [{ partId: '1', value: longText }],
    });
    const snippet = getThreadSnippet(email);
    expect(snippet.length).toBe(120);
  });

  it('strips HTML tags when only an HTML body is present', () => {
    const html = '<p>Hello <b>world</b>!</p><div>How are you?</div>';
    const email = makeEmail({
      id: 'e1',
      htmlBody: [{ partId: '1', value: html }],
    });
    const snippet = getThreadSnippet(email);
    expect(snippet).not.toContain('<');
    expect(snippet).not.toContain('>');
    expect(snippet).toContain('Hello');
    expect(snippet).toContain('world');
    expect(snippet).toContain('How are you?');
  });

  it('strips <style> and <script> blocks from HTML', () => {
    const html =
      '<style>.x{color:red}</style><script>alert(1)</script><p>Actual content</p>';
    const email = makeEmail({
      id: 'e1',
      htmlBody: [{ partId: '1', value: html }],
    });
    const snippet = getThreadSnippet(email);
    expect(snippet).not.toContain('color:red');
    expect(snippet).not.toContain('alert');
    expect(snippet).toContain('Actual content');
  });

  it('prefers plain text over HTML when both are present', () => {
    const email = makeEmail({
      id: 'e1',
      textBody: [{ partId: '1', value: 'PLAIN' }],
      htmlBody: [{ partId: '2', value: '<p>HTML</p>' }],
    });
    expect(getThreadSnippet(email)).toBe('PLAIN');
  });

  it('returns empty string when no body or preview is available', () => {
    const email = makeEmail({ id: 'e1' });
    expect(getThreadSnippet(email)).toBe('');
  });

  it('collapses whitespace in plain text', () => {
    const email = makeEmail({
      id: 'e1',
      textBody: [{ partId: '1', value: 'Line1\n\n\tLine2   spaced' }],
    });
    expect(getThreadSnippet(email)).toBe('Line1 Line2 spaced');
  });
});

// ─── groupIntoThreads ────────────────────────────────────────────────────────

describe('groupIntoThreads', () => {
  it('returns an empty array for empty input', () => {
    expect(groupIntoThreads([])).toEqual([]);
  });

  it('groups emails by inReplyTo chain', () => {
    const original = makeEmail({
      id: 'm1',
      subject: 'Project kickoff',
      messageId: ['<msg-1@example.com>'],
      receivedAt: '2026-01-01T10:00:00.000Z',
      from: [{ email: 'alice@example.com' }],
      to: [{ email: 'bob@example.com' }],
    });
    const reply = makeEmail({
      id: 'm2',
      subject: 'Re: Project kickoff',
      messageId: ['<msg-2@example.com>'],
      inReplyTo: ['<msg-1@example.com>'],
      receivedAt: '2026-01-01T11:00:00.000Z',
      from: [{ email: 'bob@example.com' }],
      to: [{ email: 'alice@example.com' }],
    });
    const reply2 = makeEmail({
      id: 'm3',
      subject: 'Re: Re: Project kickoff',
      messageId: ['<msg-3@example.com>'],
      inReplyTo: ['<msg-2@example.com>'],
      receivedAt: '2026-01-01T12:00:00.000Z',
      from: [{ email: 'alice@example.com' }],
      to: [{ email: 'bob@example.com' }],
    });

    const threads = groupIntoThreads([original, reply, reply2]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(3);
    expect(threads[0].subject).toBe('Project kickoff');
  });

  it('falls back to subject match within 7 days', () => {
    // No inReplyTo or threadId — must group by normalized subject + date window.
    const a = makeEmail({
      id: 'a',
      subject: 'Weekly sync',
      receivedAt: '2026-01-01T00:00:00.000Z',
    });
    const b = makeEmail({
      id: 'b',
      subject: 'Re: Weekly sync',
      receivedAt: '2026-01-03T00:00:00.000Z', // 2 days later — within window
    });

    const threads = groupIntoThreads([a, b]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(2);
  });

  it('does NOT merge same-subject emails when more than 7 days apart', () => {
    const a = makeEmail({
      id: 'a',
      subject: 'Weekly sync',
      receivedAt: '2026-01-01T00:00:00.000Z',
    });
    const b = makeEmail({
      id: 'b',
      subject: 'Re: Weekly sync',
      receivedAt: '2026-01-15T00:00:00.000Z', // 14 days later — outside window
    });

    const threads = groupIntoThreads([a, b]);
    expect(threads).toHaveLength(2);
  });

  it('sorts threads newest first by latest message date', () => {
    const oldThread = makeEmail({
      id: 'old',
      subject: 'Old conversation',
      receivedAt: '2026-01-01T00:00:00.000Z',
    });
    const newThread = makeEmail({
      id: 'new',
      subject: 'New conversation',
      receivedAt: '2026-02-01T00:00:00.000Z',
    });
    const middleThread = makeEmail({
      id: 'middle',
      subject: 'Middle conversation',
      receivedAt: '2026-01-15T00:00:00.000Z',
    });

    const threads = groupIntoThreads([oldThread, newThread, middleThread]);
    expect(threads).toHaveLength(3);
    expect(threads[0].latestMessage.id).toBe('new');
    expect(threads[1].latestMessage.id).toBe('middle');
    expect(threads[2].latestMessage.id).toBe('old');
  });

  it('sorts messages within a thread oldest first', () => {
    const m1 = makeEmail({
      id: 'm1',
      subject: 'Topic',
      messageId: ['<a@x>'],
      receivedAt: '2026-01-01T10:00:00.000Z',
    });
    const m2 = makeEmail({
      id: 'm2',
      subject: 'Re: Topic',
      messageId: ['<b@x>'],
      inReplyTo: ['<a@x>'],
      receivedAt: '2026-01-01T11:00:00.000Z',
    });
    const m3 = makeEmail({
      id: 'm3',
      subject: 'Re: Topic',
      messageId: ['<c@x>'],
      inReplyTo: ['<b@x>'],
      receivedAt: '2026-01-01T12:00:00.000Z',
    });

    // Pass them out of order; expect chronological order within the thread.
    const threads = groupIntoThreads([m3, m1, m2]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(threads[0].latestMessage.id).toBe('m3');
  });

  it('computes hasUnread from keywords.$seen', () => {
    // Thread with all messages seen — hasUnread should be false.
    const allRead = [
      makeEmail({
        id: 'r1',
        subject: 'Read thread',
        messageId: ['<r1@x>'],
        receivedAt: '2026-01-01T10:00:00.000Z',
        seen: true,
      }),
      makeEmail({
        id: 'r2',
        subject: 'Re: Read thread',
        messageId: ['<r2@x>'],
        inReplyTo: ['<r1@x>'],
        receivedAt: '2026-01-01T11:00:00.000Z',
        seen: true,
      }),
    ];
    const readThreads = groupIntoThreads(allRead);
    expect(readThreads).toHaveLength(1);
    expect(readThreads[0].hasUnread).toBe(false);

    // Thread with at least one unseen message — hasUnread should be true.
    const partiallyRead = [
      makeEmail({
        id: 'u1',
        subject: 'Unread thread',
        messageId: ['<u1@x>'],
        receivedAt: '2026-01-02T10:00:00.000Z',
        seen: true,
      }),
      makeEmail({
        id: 'u2',
        subject: 'Re: Unread thread',
        messageId: ['<u2@x>'],
        inReplyTo: ['<u1@x>'],
        receivedAt: '2026-01-02T11:00:00.000Z',
        seen: false,
      }),
    ];
    const unreadThreads = groupIntoThreads(partiallyRead);
    expect(unreadThreads).toHaveLength(1);
    expect(unreadThreads[0].hasUnread).toBe(true);
  });

  it('keeps independent emails in separate threads', () => {
    const a = makeEmail({
      id: 'a',
      subject: 'Apples',
      receivedAt: '2026-01-01T00:00:00.000Z',
    });
    const b = makeEmail({
      id: 'b',
      subject: 'Oranges',
      receivedAt: '2026-01-02T00:00:00.000Z',
    });

    const threads = groupIntoThreads([a, b]);
    expect(threads).toHaveLength(2);
  });

  it('groups by JMAP threadId when present', () => {
    const a = makeEmail({
      id: 'a',
      subject: 'No common headers 1',
      threadId: 'T1',
      receivedAt: '2026-01-01T10:00:00.000Z',
    });
    const b = makeEmail({
      id: 'b',
      subject: 'No common headers 2',
      threadId: 'T1',
      receivedAt: '2026-01-01T11:00:00.000Z',
    });

    const threads = groupIntoThreads([a, b]);
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toHaveLength(2);
  });
});
