import { describe, it, expect } from 'vitest';
import { TRACKER_DOMAINS, isTrackerDomain } from '@/lib/tracker-domains';

describe('TRACKER_DOMAINS', () => {
  it('includes mailchimp.com', () => {
    expect(TRACKER_DOMAINS).toContain('mailchimp.com');
  });

  it('includes hubspot.com', () => {
    expect(TRACKER_DOMAINS).toContain('hubspot.com');
  });

  it('includes marketo.com', () => {
    expect(TRACKER_DOMAINS).toContain('marketo.com');
  });

  it('includes mailtrack.io', () => {
    expect(TRACKER_DOMAINS).toContain('mailtrack.io');
  });
});

describe('isTrackerDomain', () => {
  it('returns true for direct tracker domain URLs', () => {
    expect(isTrackerDomain('https://mailchimp.com/track?id=123')).toBe(true);
    expect(isTrackerDomain('https://hubspot.com/pixel.gif')).toBe(true);
    expect(isTrackerDomain('https://marketo.com/open')).toBe(true);
    expect(isTrackerDomain('https://mailtrack.io/trace/mail/abc')).toBe(true);
  });

  it('returns true for subdomains of tracker domains', () => {
    expect(isTrackerDomain('https://click.mailchimp.com/track?id=123')).toBe(true);
    expect(isTrackerDomain('https://email.hubspot.com/e?a=1')).toBe(true);
    expect(isTrackerDomain('https://t.marketo.com/r/?lid=1')).toBe(true);
    expect(isTrackerDomain('https://pixel.mailtrack.io/trace/mail/xyz')).toBe(true);
  });

  it('returns false for non-tracker URLs', () => {
    expect(isTrackerDomain('https://github.com/anthropics/claude-code')).toBe(false);
    expect(isTrackerDomain('https://anthropic.com/news')).toBe(false);
    expect(isTrackerDomain('https://example.com/path')).toBe(false);
    expect(isTrackerDomain('https://google.com')).toBe(false);
  });

  it('handles malformed URLs without throwing', () => {
    expect(() => isTrackerDomain('not-a-url')).not.toThrow();
    expect(() => isTrackerDomain('')).not.toThrow();
    expect(() => isTrackerDomain('http://')).not.toThrow();
    expect(() => isTrackerDomain('://broken')).not.toThrow();
    expect(isTrackerDomain('not-a-url')).toBe(false);
    expect(isTrackerDomain('')).toBe(false);
  });

  it('is case-insensitive on hostname', () => {
    expect(isTrackerDomain('https://MAILCHIMP.COM/track')).toBe(true);
    expect(isTrackerDomain('https://HubSpot.com/pixel')).toBe(true);
    expect(isTrackerDomain('https://Click.MailChimp.Com/track')).toBe(true);
    expect(isTrackerDomain('https://MARKETO.com/open')).toBe(true);
  });
});
