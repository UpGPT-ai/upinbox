/**
 * search-operators.ts
 *
 * Advanced search operator parser for UpInbox.
 *
 * Supported operators:
 *   from:        — sender address or name fragment
 *   to:          — recipient address or name fragment
 *   subject:     — subject line fragment
 *   has:attachment
 *   has:link
 *   larger:Xmb   — message size (supports kb, mb, gb suffixes; bare numbers = bytes)
 *   older_than:Nd — relative age (supports d, w, m, y)
 *   newer_than:Nd — relative age (supports d, w, m, y)
 *   label:       — mailbox / label name
 *   is:unread
 *   is:flagged
 *   is:starred   — alias for is:flagged
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedQuery {
  /** Remaining freetext after all operators have been extracted. */
  raw: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  hasLink?: boolean;
  /** Message size threshold in bytes (from larger:Xmb). */
  largerThanBytes?: number;
  /** Messages older than this many days. */
  olderThanDays?: number;
  /** Messages newer than this many days. */
  newerThanDays?: number;
  label?: string;
  isUnread?: boolean;
  isFlagged?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Converts a size string like "5mb", "200kb", "1gb", or bare "1024" to bytes.
 * Returns NaN if the string is not parseable.
 */
function parseSizeToBytes(value: string): number {
  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(kb|mb|gb|b)?$/);
  if (!match) return NaN;
  const n = parseFloat(match[1]);
  switch (match[2]) {
    case 'gb': return Math.round(n * 1024 * 1024 * 1024);
    case 'mb': return Math.round(n * 1024 * 1024);
    case 'kb': return Math.round(n * 1024);
    default:   return Math.round(n);   // bare number = bytes
  }
}

/**
 * Converts a relative age string like "7d", "2w", "3m", "1y" to days.
 * Returns NaN if the string is not parseable.
 */
function parseAgeToDays(value: string): number {
  const match = value.trim().toLowerCase().match(/^(\d+)(d|w|m|y)?$/);
  if (!match) return NaN;
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 'y': return n * 365;
    case 'm': return n * 30;
    case 'w': return n * 7;
    default:  return n;   // bare number or 'd' = days
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses a Gmail-style search string into a structured ParsedQuery.
 *
 * Operator values may be quoted ("hello world") or unquoted (single token).
 * All matched operators are removed from the string; the remainder becomes `raw`.
 *
 * Examples:
 *   "from:alice@example.com is:unread budget"
 *   → { from: "alice@example.com", isUnread: true, raw: "budget" }
 *
 *   "subject:\"Q4 report\" larger:5mb older_than:30d"
 *   → { subject: "Q4 report", largerThanBytes: 5242880, olderThanDays: 30, raw: "" }
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const result: ParsedQuery = { raw: '' };
  let remaining = query;

  // ── Value-carrying operators ───────────────────────────────────────────────
  // Matches: operator:"quoted value" OR operator:unquotedtoken
  // We process them in a single pass with one regex that captures all known keys.
  const VALUE_OPERATOR_RE =
    /\b(from|to|subject|label|larger|older_than|newer_than):(?:"([^"]*)"|([\S]+))/gi;

  const valueMatches: Array<[string, string, string]> = []; // [fullMatch, key, value]
  let m: RegExpExecArray | null;
  while ((m = VALUE_OPERATOR_RE.exec(remaining)) !== null) {
    const key = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2] : m[3]; // quoted or unquoted
    valueMatches.push([m[0], key, value]);
  }

  for (const [fullMatch, key, value] of valueMatches) {
    // Remove this operator token from the string
    remaining = remaining.replace(fullMatch, '');

    switch (key) {
      case 'from':        result.from     = value; break;
      case 'to':          result.to       = value; break;
      case 'subject':     result.subject  = value; break;
      case 'label':       result.label    = value; break;
      case 'larger': {
        const bytes = parseSizeToBytes(value);
        if (!isNaN(bytes)) result.largerThanBytes = bytes;
        break;
      }
      case 'older_than': {
        const days = parseAgeToDays(value);
        if (!isNaN(days)) result.olderThanDays = days;
        break;
      }
      case 'newer_than': {
        const days = parseAgeToDays(value);
        if (!isNaN(days)) result.newerThanDays = days;
        break;
      }
    }
  }

  // ── Boolean flag operators ─────────────────────────────────────────────────

  // has:attachment
  if (/\bhas:attachment\b/i.test(remaining)) {
    result.hasAttachment = true;
    remaining = remaining.replace(/\bhas:attachment\b/gi, '');
  }

  // has:link
  if (/\bhas:link\b/i.test(remaining)) {
    result.hasLink = true;
    remaining = remaining.replace(/\bhas:link\b/gi, '');
  }

  // is:unread
  if (/\bis:unread\b/i.test(remaining)) {
    result.isUnread = true;
    remaining = remaining.replace(/\bis:unread\b/gi, '');
  }

  // is:flagged | is:starred (alias)
  if (/\bis:(?:flagged|starred)\b/i.test(remaining)) {
    result.isFlagged = true;
    remaining = remaining.replace(/\bis:(?:flagged|starred)\b/gi, '');
  }

  // ── Collapse leftover whitespace ───────────────────────────────────────────
  result.raw = remaining.replace(/\s{2,}/g, ' ').trim();

  return result;
}

// ─── API param builder ────────────────────────────────────────────────────────

/**
 * Converts a ParsedQuery into URLSearchParams understood by
 * /api/upinbox/emails.
 *
 * Param names mirror the column names / filter keys accepted by the
 * server-side email list handler.
 */
export function buildApiParams(parsed: ParsedQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (parsed.raw)              params.set('q',              parsed.raw);
  if (parsed.from)             params.set('from',           parsed.from);
  if (parsed.to)               params.set('to',             parsed.to);
  if (parsed.subject)          params.set('subject',        parsed.subject);
  if (parsed.label)            params.set('label',          parsed.label);
  if (parsed.hasAttachment)    params.set('has_attachment', '1');
  if (parsed.hasLink)          params.set('has_link',       '1');
  if (parsed.isUnread)         params.set('is_unread',      '1');
  if (parsed.isFlagged)        params.set('is_flagged',     '1');
  if (parsed.largerThanBytes !== undefined) {
    params.set('larger_than_bytes', String(parsed.largerThanBytes));
  }
  if (parsed.olderThanDays !== undefined) {
    params.set('older_than_days', String(parsed.olderThanDays));
  }
  if (parsed.newerThanDays !== undefined) {
    params.set('newer_than_days', String(parsed.newerThanDays));
  }

  return params;
}
