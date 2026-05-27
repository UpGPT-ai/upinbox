/**
 * Tests for metadata feature extractor
 * Verifies the privacy guarantee: only structural features, never raw content.
 */

import { describe, it, expect } from 'vitest';
import { extractMetadataFeatures } from '@/lib/intelligence/metadata-features';

describe('extractMetadataFeatures', () => {
  it('counts subject words correctly', () => {
    const f = extractMetadataFeatures({ subject: 'Q3 budget review needed' });
    expect(f.subjectWordCount).toBe(4);
  });

  it('counts body words correctly', () => {
    const f = extractMetadataFeatures({ bodyText: 'Hello world this is a test' });
    expect(f.bodyWordCount).toBe(6);
  });

  it('detects list-unsubscribe header', () => {
    const f = extractMetadataFeatures({ headers: { 'list-unsubscribe': '<mailto:unsub@example.com>' } });
    expect(f.listUnsubscribePresent).toBe(true);
  });

  it('listUnsubscribePresent = false when header absent', () => {
    const f = extractMetadataFeatures({ headers: {} });
    expect(f.listUnsubscribePresent).toBe(false);
  });

  it('detects URLs in body', () => {
    const f = extractMetadataFeatures({ bodyText: 'Visit https://example.com and https://other.com now' });
    expect(f.hasUrls).toBe(true);
    expect(f.urlCount).toBe(2);
  });

  it('hasUrls = false when no URLs', () => {
    const f = extractMetadataFeatures({ bodyText: 'Just some text without any links' });
    expect(f.hasUrls).toBe(false);
    expect(f.urlCount).toBe(0);
  });

  it('classifies personal email sender as personal', () => {
    const f = extractMetadataFeatures({ fromEmail: 'alice@gmail.com' });
    expect(f.senderDomainType).toBe('personal');
  });

  it('classifies business sender as business', () => {
    const f = extractMetadataFeatures({ fromEmail: 'ceo@acme.com' });
    expect(f.senderDomainType).toBe('business');
  });

  it('classifies noreply as bulk', () => {
    const f = extractMetadataFeatures({ fromEmail: 'noreply@company.com' });
    expect(f.senderDomainType).toBe('bulk');
  });

  it('detects greeting in body', () => {
    const f = extractMetadataFeatures({ bodyText: 'Hi Bob,\n\nI hope this finds you well.' });
    expect(f.hasGreeting).toBe(true);
  });

  it('detects salutation in body', () => {
    const f = extractMetadataFeatures({ bodyText: 'Please see attached.\n\nBest regards,\nAlice' });
    expect(f.hasSalutation).toBe(true);
  });

  it('computes capsRatio correctly', () => {
    const f = extractMetadataFeatures({ bodyText: 'HELLO world' }); // 5 caps, 10 letters
    expect(f.capsRatio).toBeCloseTo(0.5, 1);
  });

  it('capsRatio = 0 for all-lowercase body', () => {
    const f = extractMetadataFeatures({ bodyText: 'hello world' });
    expect(f.capsRatio).toBeCloseTo(0, 2);
  });

  // ── PRIVACY GUARANTEE ────────────────────────────────────────────────────────
  it('NEVER includes the raw subject text in output', () => {
    const secret = 'SuperSecretSubject12345';
    const f = extractMetadataFeatures({ subject: secret });
    const json = JSON.stringify(f);
    expect(json).not.toContain(secret);
  });

  it('NEVER includes the raw body text in output', () => {
    const secret = 'SecretBodyContent67890';
    const f = extractMetadataFeatures({ bodyText: secret });
    const json = JSON.stringify(f);
    expect(json).not.toContain(secret);
  });

  it('NEVER includes the from email address in output', () => {
    const secret = 'alice@verysecret.com';
    const f = extractMetadataFeatures({ fromEmail: secret });
    const json = JSON.stringify(f);
    expect(json).not.toContain(secret);
  });

  it('handles empty input without throwing', () => {
    expect(() => extractMetadataFeatures({})).not.toThrow();
  });
});
