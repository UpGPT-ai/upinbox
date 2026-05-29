/**
 * date-extractor.ts
 * Extracts meeting proposals from email text and builds Google Calendar URLs.
 */

export interface ExtractedDate {
  raw: string;
  date: string;
  time?: string;
  isProposal: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Returns today's date at midnight (local time).
 */
function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the next occurrence of a named weekday (e.g. "Monday").
 * If the weekday is today, returns 7 days from today.
 */
function nextWeekday(name: string, fromDate: Date = today()): Date {
  const target = DAYS_OF_WEEK.indexOf(name.toLowerCase());
  if (target === -1) return fromDate;
  const current = fromDate.getDay();
  const diff = ((target - current + 7) % 7) || 7;
  const result = new Date(fromDate);
  result.setDate(result.getDate() + diff);
  return result;
}

/**
 * Formats a Date to "YYYY-MM-DD".
 */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Normalises a 12-hour time string like "3pm", "3:30 PM", "15:00" to "HH:MM".
 * Returns undefined when unrecognised.
 */
function normaliseTime(raw: string): string | undefined {
  const cleaned = raw.trim().toLowerCase();
  // 24-hour "15:00"
  const h24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = h24[2];
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${m}`;
  }
  // 12-hour "3pm", "3:30pm", "3:30 pm"
  const h12 = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (h12) {
    let h = parseInt(h12[1], 10);
    const m = h12[2] ?? '00';
    const meridiem = h12[3];
    if (meridiem === 'pm' && h !== 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  return undefined;
}

/**
 * Attempts to parse a month+day string like "June 5", "May 12th".
 * Uses the current year (or next year if the date has already passed).
 */
function parseMonthDay(month: string, day: string): Date | undefined {
  const mIndex = MONTHS.indexOf(month.toLowerCase());
  if (mIndex === -1) return undefined;
  const d = parseInt(day, 10);
  if (isNaN(d) || d < 1 || d > 31) return undefined;
  const now = today();
  let year = now.getFullYear();
  const candidate = new Date(year, mIndex, d);
  if (candidate < now) {
    year += 1;
  }
  return new Date(year, mIndex, d);
}

// ---------------------------------------------------------------------------
// Pattern registry
// ---------------------------------------------------------------------------

interface MatchPattern {
  /** Regex to find the raw span in text (with named groups where useful). */
  regex: RegExp;
  /** Whether matching this pattern implies a meeting proposal. */
  isProposal: boolean;
  /** Resolve raw match groups to { date, time? }. Return null to skip. */
  resolve(match: RegExpMatchArray): { date: string; time?: string } | null;
}

const PATTERNS: MatchPattern[] = [
  // ISO date: 2026-06-15
  {
    regex: /\b(\d{4}-\d{2}-\d{2})\b/g,
    isProposal: false,
    resolve(m) {
      const d = new Date(m[1] + 'T00:00:00');
      if (isNaN(d.getTime())) return null;
      return { date: toDateStr(d) };
    },
  },
  // Relative: tomorrow
  {
    regex: /\b(tomorrow)\b/gi,
    isProposal: true,
    resolve() {
      const d = today();
      d.setDate(d.getDate() + 1);
      return { date: toDateStr(d) };
    },
  },
  // Relative: next week
  {
    regex: /\b(next\s+week)\b/gi,
    isProposal: true,
    resolve() {
      const d = today();
      d.setDate(d.getDate() + 7);
      return { date: toDateStr(d) };
    },
  },
  // "next Monday / next Tuesday / ..."
  {
    regex: new RegExp(`\\b(next)\\s+(${DAYS_OF_WEEK.join('|')})\\b`, 'gi'),
    isProposal: true,
    resolve(m) {
      const base = today();
      base.setDate(base.getDate() + 7); // force next-week band
      const d = nextWeekday(m[2], base);
      return { date: toDateStr(d) };
    },
  },
  // Proposal phrases: "let's meet on Monday", "how about Tuesday", "free on Wednesday"
  // Also captures optional time: "let's meet on Monday at 3pm"
  {
    regex: new RegExp(
      `(?:let'?s?\\s+meet\\s+on|how\\s+about|free\\s+on|available\\s+on|works\\s+for\\s+(?:me\\s+on|you\\s+on))\\s+(${DAYS_OF_WEEK.join('|')})(?:\\s+at\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)))?\\.?`,
      'gi',
    ),
    isProposal: true,
    resolve(m) {
      const d = nextWeekday(m[1]);
      const time = m[2] ? normaliseTime(m[2]) : undefined;
      return { date: toDateStr(d), ...(time ? { time } : {}) };
    },
  },
  // "call at 3pm" / "meeting at 10:30am" (no specific day — use tomorrow as default)
  {
    regex: /\b(?:call|meeting|chat|sync|catch\s+up)\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi,
    isProposal: true,
    resolve(m) {
      const d = today();
      d.setDate(d.getDate() + 1); // default to tomorrow
      const time = normaliseTime(m[1]);
      return { date: toDateStr(d), ...(time ? { time } : {}) };
    },
  },
  // Month + day: "June 5", "May 12th"
  {
    regex: new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'),
    isProposal: false,
    resolve(m) {
      const d = parseMonthDay(m[1], m[2]);
      if (!d) return null;
      return { date: toDateStr(d) };
    },
  },
  // "Monday the 5th", "Tuesday the 12th"
  {
    regex: new RegExp(`\\b(${DAYS_OF_WEEK.join('|')})\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'),
    isProposal: true,
    resolve(m) {
      // We have a weekday + ordinal. Use the next occurrence of that weekday.
      const d = nextWeekday(m[1]);
      return { date: toDateStr(d) };
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts all date/time references from `text`.
 * Each result contains the raw matched string, a normalised date ("YYYY-MM-DD"),
 * an optional time ("HH:MM"), and whether it appears to be a meeting proposal.
 */
export function extractDates(text: string): ExtractedDate[] {
  const results: ExtractedDate[] = [];
  const seenRaw = new Set<string>();

  for (const pattern of PATTERNS) {
    // Reset regex state for global patterns
    pattern.regex.lastIndex = 0;
    let match: RegExpMatchArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const raw = match[0];
      if (seenRaw.has(raw.toLowerCase())) continue;
      const resolved = pattern.resolve(match);
      if (!resolved) continue;
      seenRaw.add(raw.toLowerCase());
      results.push({
        raw,
        date: resolved.date,
        ...(resolved.time ? { time: resolved.time } : {}),
        isProposal: pattern.isProposal,
      });
    }
  }

  return results;
}

/**
 * Builds a Google Calendar "create event" URL for the given title and date.
 *
 * @param title       Event title / subject.
 * @param dateStr     Date string "YYYY-MM-DD".
 * @param durationMin Duration in minutes (default 60).
 * @returns           Full Google Calendar URL that opens the new-event form.
 */
export function buildCalendarUrl(title: string, dateStr: string, durationMin = 60): string {
  // Google Calendar expects dates in YYYYMMDD or YYYYMMDDTHHmmssZ format.
  const [year, month, day] = dateStr.split('-');
  const startDate = `${year}${month}${day}`;

  // Compute end date (add durationMin minutes from midnight)
  const startMs = new Date(`${dateStr}T00:00:00`).getTime();
  const endMs = startMs + durationMin * 60 * 1000;
  const endD = new Date(endMs);
  const endDate = `${endD.getFullYear()}${String(endD.getMonth() + 1).padStart(2, '0')}${String(endD.getDate()).padStart(2, '0')}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startDate}/${endDate}`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
