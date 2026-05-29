/**
 * Recurring event expansion using the `rrule` package.
 *
 * Takes a stored CalendarEventRow (which may have a recurrence_rule string)
 * and returns all occurrences that fall within [windowStart, windowEnd].
 * If the event has no recurrence_rule, returns the event itself (if it falls
 * within the window) or an empty array.
 */

import { RRule, RRuleSet } from 'rrule';

export interface CalendarEventLike {
  id: string;
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  recurrence_rule?: string | null;
  [key: string]: unknown;
}

/**
 * Expand a single event into all occurrences within the given window.
 * Returns cloned event objects with updated start_at / end_at.
 * The `id` of each occurrence is suffixed with the occurrence index to keep
 * ScheduleX happy (it requires unique IDs).
 */
export function expandRecurring<T extends CalendarEventLike>(
  event: T,
  windowStart: Date,
  windowEnd: Date,
): T[] {
  if (!event.recurrence_rule) {
    // Non-recurring: include if it overlaps the window
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    if (end < windowStart || start > windowEnd) return [];
    return [event];
  }

  try {
    const rruleStr = event.recurrence_rule.startsWith('RRULE:')
      ? event.recurrence_rule
      : `RRULE:${event.recurrence_rule}`;

    const dtstart = new Date(event.start_at);
    const durationMs = new Date(event.end_at).getTime() - dtstart.getTime();

    // Parse the full RRULE string (may contain EXDATE, RDATE lines)
    const rruleSet = rruleSetFromString(rruleStr, dtstart);

    const occurrences = rruleSet.between(windowStart, windowEnd, true);

    return occurrences.map((occStart, idx) => {
      const occEnd = new Date(occStart.getTime() + durationMs);
      return {
        ...event,
        id: `${event.id}_r${idx}`,
        start_at: occStart.toISOString(),
        end_at: occEnd.toISOString(),
      };
    });
  } catch {
    // If RRULE is malformed, fall back to returning the base event
    return [event];
  }
}

function rruleSetFromString(rruleStr: string, dtstart: Date): RRuleSet {
  const set = new RRuleSet();

  const lines = rruleStr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('RRULE:')) {
      const rule = RRule.fromString(`DTSTART:${formatRRuleDt(dtstart)}\n${line}`);
      set.rrule(rule);
    } else if (line.startsWith('EXDATE:')) {
      const dates = parseExdate(line.slice('EXDATE:'.length));
      dates.forEach((d) => set.exdate(d));
    } else if (line.startsWith('RDATE:')) {
      const dates = parseExdate(line.slice('RDATE:'.length));
      dates.forEach((d) => set.rdate(d));
    }
  }

  // Ensure at least one RRULE is present
  if (set.rrules().length === 0) {
    const rule = RRule.fromString(`DTSTART:${formatRRuleDt(dtstart)}\n${rruleStr}`);
    set.rrule(rule);
  }

  return set;
}

function formatRRuleDt(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function parseExdate(value: string): Date[] {
  // VALUE=DATE-TIME: or bare list of timestamps
  const bare = value.replace(/^VALUE=[^:]+:/i, '');
  return bare
    .split(',')
    .map((s) => {
      try {
        const clean = s.trim().replace(/Z$/, '');
        const y = clean.slice(0, 4);
        const mo = clean.slice(4, 6);
        const d = clean.slice(6, 8);
        const h = clean.slice(9, 11) || '00';
        const mi = clean.slice(11, 13) || '00';
        const sec = clean.slice(13, 15) || '00';
        return new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}Z`);
      } catch {
        return null;
      }
    })
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
}
