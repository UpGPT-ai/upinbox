/**
 * Tests for src/lib/calendar/date-extractor.ts
 *
 * Verifies that extractDates() can detect a variety of meeting-proposal
 * patterns in email text, and that buildCalendarUrl() produces a valid
 * Google Calendar "create event" URL.
 */

import { describe, it, expect } from 'vitest';
import { extractDates, buildCalendarUrl } from '@/lib/calendar/date-extractor';

describe('extractDates', () => {
  it('detects "let\'s meet on Friday"', () => {
    const results = extractDates("Let's meet on Friday to discuss the proposal.");
    expect(results.length).toBeGreaterThan(0);
    const friday = results.find((r) => /friday/i.test(r.raw));
    expect(friday).toBeDefined();
    expect(friday?.isProposal).toBe(true);
    expect(friday?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('detects ISO format dates', () => {
    const results = extractDates('The kickoff is scheduled for 2026-06-15.');
    expect(results.length).toBeGreaterThan(0);
    const iso = results.find((r) => r.raw === '2026-06-15');
    expect(iso).toBeDefined();
    expect(iso?.date).toBe('2026-06-15');
  });

  it('detects relative dates (tomorrow, next week)', () => {
    const tomorrowResults = extractDates('Can we chat tomorrow?');
    expect(tomorrowResults.some((r) => /tomorrow/i.test(r.raw))).toBe(true);
    const tomorrowMatch = tomorrowResults.find((r) => /tomorrow/i.test(r.raw));
    expect(tomorrowMatch?.isProposal).toBe(true);
    expect(tomorrowMatch?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const nextWeekResults = extractDates('Let me get back to you next week.');
    expect(nextWeekResults.some((r) => /next\s+week/i.test(r.raw))).toBe(true);
    const nextWeekMatch = nextWeekResults.find((r) => /next\s+week/i.test(r.raw));
    expect(nextWeekMatch?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('detects time patterns (3pm, 14:30)', () => {
    // The date-extractor surfaces times only when attached to a meeting
    // phrase (e.g. "call at 3pm", "let's meet on Monday at 3pm").
    const pmResults = extractDates("Let's hop on a call at 3pm.");
    const pmMatch = pmResults.find((r) => r.time !== undefined);
    expect(pmMatch).toBeDefined();
    expect(pmMatch?.time).toBe('15:00');

    const combinedResults = extractDates("Let's meet on Monday at 2:30 pm.");
    const combined = combinedResults.find((r) => r.time !== undefined);
    expect(combined).toBeDefined();
    expect(combined?.time).toBe('14:30');
  });

  it('returns empty array for non-date text', () => {
    const results = extractDates(
      'Hello, just wanted to follow up on the items we discussed earlier. Thanks!',
    );
    expect(results).toEqual([]);
  });
});

describe('buildCalendarUrl', () => {
  it('produces a valid Google Calendar URL', () => {
    const url = buildCalendarUrl('Project Sync', '2026-06-15');
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);

    // The URL should be parseable as a real URL.
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('calendar.google.com');
    expect(parsed.pathname).toBe('/calendar/render');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
  });

  it('includes title and dates parameters', () => {
    const url = buildCalendarUrl('Project Sync', '2026-06-15');
    const parsed = new URL(url);

    expect(parsed.searchParams.get('text')).toBe('Project Sync');

    const dates = parsed.searchParams.get('dates');
    expect(dates).toBeTruthy();
    // dates should be "YYYYMMDD/YYYYMMDD"
    expect(dates).toMatch(/^\d{8}\/\d{8}$/);
    expect(dates?.startsWith('20260615/')).toBe(true);
  });
});
