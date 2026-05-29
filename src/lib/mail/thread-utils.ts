/**
 * Thread utilities — group flat email lists into conversation threads.
 *
 * Algorithm:
 *  1. Build a map of messageId → email for fast lookups.
 *  2. Primary grouping: follow inReplyTo chains to cluster replies.
 *  3. Fallback grouping: match emails with the same normalized subject
 *     that arrived within SUBJECT_WINDOW_MS of each other.
 *  4. Threads are sorted newest-first; messages within a thread oldest-first.
 *  5. hasUnread is true when any message is missing the '$seen' keyword.
 */

import { JmapEmail, JmapEmailAddress } from '@/lib/mail/types';

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface ThreadedEmail {
  /** Stable thread identifier — either the JMAP threadId of the root message,
   *  or a synthetic id derived from the root messageId / subject key. */
  threadId: string;
  subject: string;
  messages: JmapEmail[];
  latestMessage: JmapEmail;
  participantCount: number;
  /** Unique participant email addresses across all messages in the thread. */
  participants: JmapEmailAddress[];
  hasUnread: boolean;
  latestDate: string;   // ISO timestamp of the most-recent message
  /** First 120 chars of plain text from the latest message. */
  snippet: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Two messages with the same normalised subject are merged into the same
 *  thread only when they arrived within this window of each other. */
const SUBJECT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Max characters returned by getThreadSnippet. */
const SNIPPET_LENGTH = 120;

// ─── normalizeSubject ─────────────────────────────────────────────────────────

/**
 * Strip common reply/forward prefixes from an email subject so that
 * "Re: Re: Fwd: Meeting tomorrow" normalizes to "Meeting tomorrow".
 *
 * Handles:
 *  - Re:, RE:, re:
 *  - Fwd:, FWD:, fw:, Fw:, FW:
 *  - Bracketed prefixes such as [Team] Re: …
 *  - Multiple nested prefixes
 */
export function normalizeSubject(subject: string): string {
  if (!subject) return '';

  let normalized = subject.trim();

  // Strip bracketed tags like "[Team]", "[EXTERNAL]" that often appear before Re/Fwd
  const BRACKET_RE = /^\[[^\]]*\]\s*/i;
  // Strip Re:/Fwd: variants (with optional whitespace)
  const PREFIX_RE = /^(?:re|fwd?)\s*:\s*/i;

  let changed = true;
  while (changed) {
    changed = false;

    const withoutBracket = normalized.replace(BRACKET_RE, '');
    if (withoutBracket !== normalized) {
      normalized = withoutBracket;
      changed = true;
    }

    const withoutPrefix = normalized.replace(PREFIX_RE, '');
    if (withoutPrefix !== normalized) {
      normalized = withoutPrefix;
      changed = true;
    }
  }

  return normalized.trim();
}

// ─── getThreadSnippet ─────────────────────────────────────────────────────────

/**
 * Extract a short plain-text preview from an email.
 *
 * Priority:
 *  1. Use email.preview if present (already plain text).
 *  2. Find the first text/plain body part and read its value.
 *  3. Find the first text/html body part, strip tags, and use that.
 *
 * Returns the first SNIPPET_LENGTH characters with surrounding whitespace
 * collapsed.
 */
export function getThreadSnippet(email: JmapEmail): string {
  // 1. Use the pre-computed preview field.
  if (email.preview) {
    return email.preview.slice(0, SNIPPET_LENGTH);
  }

  // 2. Try plain text body parts.
  for (const part of email.textBody) {
    const bodyValue = email.bodyValues[part.partId];
    if (bodyValue?.value) {
      return collapseWhitespace(bodyValue.value).slice(0, SNIPPET_LENGTH);
    }
  }

  // 3. Fall back to HTML body parts — strip tags first.
  for (const part of email.htmlBody) {
    const bodyValue = email.bodyValues[part.partId];
    if (bodyValue?.value) {
      const plain = stripHtml(bodyValue.value);
      return collapseWhitespace(plain).slice(0, SNIPPET_LENGTH);
    }
  }

  return '';
}

// ─── groupIntoThreads ─────────────────────────────────────────────────────────

/**
 * Group a flat array of emails into conversation threads.
 *
 * Returns threads sorted newest-first. Within each thread, messages are
 * sorted oldest-first (chronological reading order).
 */
export function groupIntoThreads(emails: JmapEmail[]): ThreadedEmail[] {
  if (!emails.length) return [];

  // ── Step 1: Build a messageId → email lookup map ──────────────────────────
  // JMAP messageId is an array (RFC 5322 allows multiple Message-IDs, though
  // in practice there is always exactly one).
  const messageIdMap = new Map<string, JmapEmail>();
  for (const email of emails) {
    for (const mid of email.messageId ?? []) {
      messageIdMap.set(mid, email);
    }
  }

  // ── Step 2: Union-Find structure for grouping ─────────────────────────────
  // We use a simple parent map where parent[email.id] === root email.id.
  const parent = new Map<string, string>();

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression
    let cur = id;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(idA: string, idB: string): void {
    const rootA = find(idA);
    const rootB = find(idB);
    if (rootA !== rootB) {
      // Keep the smaller (lexicographically) id as root for determinism.
      if (rootA < rootB) {
        parent.set(rootB, rootA);
      } else {
        parent.set(rootA, rootB);
      }
    }
  }

  // Initialise each email as its own root.
  for (const email of emails) {
    parent.set(email.id, email.id);
  }

  // ── Step 3: Primary grouping — inReplyTo chains ───────────────────────────
  // Local map: JMAP threadId → first email.id seen with that threadId.
  const jmapThreadIdToEmailId = new Map<string, string>();

  for (const email of emails) {
    for (const replyToId of email.inReplyTo ?? []) {
      const parent_email = messageIdMap.get(replyToId);
      if (parent_email) {
        union(email.id, parent_email.id);
      }
    }

    // Also union by JMAP threadId when present — the server already computed it.
    if (email.threadId) {
      const existing = jmapThreadIdToEmailId.get(email.threadId);
      if (existing !== undefined) {
        union(email.id, existing);
      } else {
        jmapThreadIdToEmailId.set(email.threadId, email.id);
      }
    }
  }

  // ── Step 4: Fallback grouping — normalized subject + date window ──────────
  // Build a map: normalizedSubject → list of emails in chronological order.
  const subjectMap = new Map<string, JmapEmail[]>();
  for (const email of emails) {
    const key = normalizeSubject(email.subject ?? '').toLowerCase();
    if (!key) continue;
    if (!subjectMap.has(key)) subjectMap.set(key, []);
    subjectMap.get(key)!.push(email);
  }

  for (const [, group] of subjectMap) {
    // Sort by receivedAt so we can apply the time-window check.
    const sorted = [...group].sort(
      (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gap =
        new Date(curr.receivedAt).getTime() - new Date(prev.receivedAt).getTime();
      if (gap <= SUBJECT_WINDOW_MS) {
        union(prev.id, curr.id);
      }
    }
  }

  // ── Step 5: Collect emails into buckets keyed by root id ──────────────────
  const buckets = new Map<string, JmapEmail[]>();
  for (const email of emails) {
    const root = find(email.id);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root)!.push(email);
  }

  // ── Step 6: Build ThreadedEmail objects ───────────────────────────────────
  const threads: ThreadedEmail[] = [];

  for (const [rootId, messages] of buckets) {
    // Sort messages oldest-first within the thread.
    messages.sort(
      (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    );

    const latestMessage = messages[messages.length - 1];
    const latestDate = latestMessage.receivedAt;

    // Derive threadId: prefer the JMAP threadId of the root/latest message.
    const threadId =
      latestMessage.threadId || messages[0].threadId || rootId;

    const subject = normalizeSubject(latestMessage.subject ?? messages[0].subject ?? '');

    // Collect all unique participants across all messages.
    const participantEmailSet = new Set<string>();
    const participantMap = new Map<string, JmapEmailAddress>();
    for (const msg of messages) {
      for (const addr of [
        ...(msg.from ?? []),
        ...(msg.to ?? []),
        ...(msg.cc ?? []),
      ]) {
        if (!participantEmailSet.has(addr.email)) {
          participantEmailSet.add(addr.email);
          participantMap.set(addr.email, addr);
        }
      }
    }
    const participants = Array.from(participantMap.values());

    // hasUnread: true if any message lacks the '$seen' keyword.
    const hasUnread = messages.some(
      (msg) => !msg.keywords['$seen']
    );

    const snippet = getThreadSnippet(latestMessage);

    threads.push({
      threadId,
      subject,
      messages,
      latestMessage,
      participantCount: participants.length,
      participants,
      hasUnread,
      latestDate,
      snippet,
    });
  }

  // ── Step 7: Sort threads newest-first ─────────────────────────────────────
  threads.sort(
    (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
  );

  return threads;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode common HTML entities to produce plain text.
 * This is intentionally lightweight — it handles the most common cases
 * without pulling in a full HTML parser.
 */
function stripHtml(html: string): string {
  return html
    // Remove <style> and <script> blocks entirely (content not useful).
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    // Replace block-level tags with a space so words don't run together.
    .replace(/<\/?(p|div|br|li|tr|td|th|h[1-6]|blockquote)[^>]*>/gi, ' ')
    // Strip all remaining tags.
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities.
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

/**
 * Collapse runs of whitespace (including newlines and tabs) into single spaces
 * and trim the result.
 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
