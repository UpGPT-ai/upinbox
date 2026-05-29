import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  buildApiParams,
  type ParsedQuery,
} from '@/lib/mail/search-operators';

describe('parseSearchQuery', () => {
  it('extracts from: operator', () => {
    const result = parseSearchQuery('from:alice@example.com');
    expect(result.from).toBe('alice@example.com');
    expect(result.raw).toBe('');
  });

  it('extracts from: operator with quoted value', () => {
    const result = parseSearchQuery('from:"Alice Smith"');
    expect(result.from).toBe('Alice Smith');
    expect(result.raw).toBe('');
  });

  it('extracts has:attachment as boolean', () => {
    const result = parseSearchQuery('has:attachment');
    expect(result.hasAttachment).toBe(true);
    expect(result.raw).toBe('');
  });

  it('does not set hasAttachment when not present', () => {
    const result = parseSearchQuery('hello world');
    expect(result.hasAttachment).toBeUndefined();
  });

  it('extracts larger:5mb and converts to bytes', () => {
    const result = parseSearchQuery('larger:5mb');
    expect(result.largerThanBytes).toBe(5 * 1024 * 1024);
    expect(result.raw).toBe('');
  });

  it('extracts larger: with kb, mb, gb suffixes', () => {
    expect(parseSearchQuery('larger:200kb').largerThanBytes).toBe(200 * 1024);
    expect(parseSearchQuery('larger:1gb').largerThanBytes).toBe(
      1024 * 1024 * 1024,
    );
    expect(parseSearchQuery('larger:1024').largerThanBytes).toBe(1024);
  });

  it('extracts older_than:7d as integer days', () => {
    const result = parseSearchQuery('older_than:7d');
    expect(result.olderThanDays).toBe(7);
    expect(Number.isInteger(result.olderThanDays)).toBe(true);
    expect(result.raw).toBe('');
  });

  it('extracts older_than: with w, m, y suffixes', () => {
    expect(parseSearchQuery('older_than:2w').olderThanDays).toBe(14);
    expect(parseSearchQuery('older_than:3m').olderThanDays).toBe(90);
    expect(parseSearchQuery('older_than:1y').olderThanDays).toBe(365);
  });

  it('extracts newer_than:30d as integer days', () => {
    const result = parseSearchQuery('newer_than:30d');
    expect(result.newerThanDays).toBe(30);
  });

  it('extracts is:unread', () => {
    const result = parseSearchQuery('is:unread');
    expect(result.isUnread).toBe(true);
    expect(result.raw).toBe('');
  });

  it('extracts is:flagged', () => {
    const result = parseSearchQuery('is:flagged');
    expect(result.isFlagged).toBe(true);
    expect(result.raw).toBe('');
  });

  it('treats is:starred as alias for is:flagged', () => {
    const result = parseSearchQuery('is:starred');
    expect(result.isFlagged).toBe(true);
  });

  it('preserves freetext in .raw', () => {
    const result = parseSearchQuery('quarterly budget review');
    expect(result.raw).toBe('quarterly budget review');
    expect(result.from).toBeUndefined();
    expect(result.subject).toBeUndefined();
  });

  it('preserves freetext alongside operators', () => {
    const result = parseSearchQuery('from:alice@example.com budget review');
    expect(result.from).toBe('alice@example.com');
    expect(result.raw).toBe('budget review');
  });

  it('handles multiple operators in one query', () => {
    const result = parseSearchQuery(
      'from:alice@example.com subject:"Q4 report" has:attachment larger:5mb older_than:30d is:unread budget',
    );
    expect(result.from).toBe('alice@example.com');
    expect(result.subject).toBe('Q4 report');
    expect(result.hasAttachment).toBe(true);
    expect(result.largerThanBytes).toBe(5 * 1024 * 1024);
    expect(result.olderThanDays).toBe(30);
    expect(result.isUnread).toBe(true);
    expect(result.raw).toBe('budget');
  });

  it('returns empty raw when query is empty', () => {
    const result = parseSearchQuery('');
    expect(result.raw).toBe('');
  });

  it('extracts to: and label: operators', () => {
    const result = parseSearchQuery('to:bob@example.com label:inbox');
    expect(result.to).toBe('bob@example.com');
    expect(result.label).toBe('inbox');
  });

  it('extracts has:link', () => {
    const result = parseSearchQuery('has:link');
    expect(result.hasLink).toBe(true);
  });
});

describe('buildApiParams', () => {
  it('converts ParsedQuery to URLSearchParams', () => {
    const parsed: ParsedQuery = {
      raw: 'budget',
      from: 'alice@example.com',
      subject: 'Q4 report',
      hasAttachment: true,
      largerThanBytes: 5 * 1024 * 1024,
      olderThanDays: 30,
      isUnread: true,
    };
    const params = buildApiParams(parsed);
    expect(params).toBeInstanceOf(URLSearchParams);
    expect(params.get('q')).toBe('budget');
    expect(params.get('from')).toBe('alice@example.com');
    expect(params.get('subject')).toBe('Q4 report');
    expect(params.get('has_attachment')).toBe('1');
    expect(params.get('larger_than_bytes')).toBe(String(5 * 1024 * 1024));
    expect(params.get('older_than_days')).toBe('30');
    expect(params.get('is_unread')).toBe('1');
  });

  it('omits unset fields', () => {
    const parsed: ParsedQuery = { raw: '' };
    const params = buildApiParams(parsed);
    expect(params.toString()).toBe('');
    expect(params.has('q')).toBe(false);
    expect(params.has('from')).toBe(false);
    expect(params.has('to')).toBe(false);
    expect(params.has('subject')).toBe(false);
    expect(params.has('label')).toBe(false);
    expect(params.has('has_attachment')).toBe(false);
    expect(params.has('has_link')).toBe(false);
    expect(params.has('is_unread')).toBe(false);
    expect(params.has('is_flagged')).toBe(false);
    expect(params.has('larger_than_bytes')).toBe(false);
    expect(params.has('older_than_days')).toBe(false);
    expect(params.has('newer_than_days')).toBe(false);
  });

  it('omits false boolean fields', () => {
    const parsed: ParsedQuery = {
      raw: '',
      hasAttachment: false,
      hasLink: false,
      isUnread: false,
      isFlagged: false,
    };
    const params = buildApiParams(parsed);
    expect(params.has('has_attachment')).toBe(false);
    expect(params.has('has_link')).toBe(false);
    expect(params.has('is_unread')).toBe(false);
    expect(params.has('is_flagged')).toBe(false);
  });

  it('includes largerThanBytes when set to 0', () => {
    // Edge case: largerThanBytes is checked via !== undefined, so 0 should be included
    const parsed: ParsedQuery = { raw: '', largerThanBytes: 0 };
    const params = buildApiParams(parsed);
    expect(params.get('larger_than_bytes')).toBe('0');
  });

  it('round-trips parseSearchQuery → buildApiParams', () => {
    const parsed = parseSearchQuery(
      'from:alice@example.com has:attachment is:unread budget',
    );
    const params = buildApiParams(parsed);
    expect(params.get('from')).toBe('alice@example.com');
    expect(params.get('has_attachment')).toBe('1');
    expect(params.get('is_unread')).toBe('1');
    expect(params.get('q')).toBe('budget');
  });
});
