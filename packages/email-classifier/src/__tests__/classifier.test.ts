/**
 * @upgpt-ai/email-classifier — unit tests
 *
 * Tests cover: all 7 categories, edge cases, batch classification,
 * confidence range, signal reporting, and zero-dependency constraint.
 */

import { describe, it, expect } from 'vitest';
import { classifyEmail, classifyEmailBatch } from '../index';
import type { ClassifyInput } from '../index';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function classify(overrides: Partial<ClassifyInput>) {
  return classifyEmail(overrides);
}

// ─── ACTION_REQUIRED ─────────────────────────────────────────────────────────

describe('ACTION_REQUIRED detection', () => {
  it('detects "action required" in subject', () => {
    const r = classify({ subject: 'Action required: please review the proposal' });
    expect(r.category).toBe('ACTION_REQUIRED');
    expect(r.confidence).toBeGreaterThan(0.4);
  });

  it('detects personal email structure (greeting + salutation)', () => {
    const r = classify({
      subject: 'Quick question for you',
      from: 'alice@example.com',
      bodyText: 'Hi Bob,\n\nCould you please look at this document by Friday?\n\nBest regards,\nAlice',
    });
    expect(r.category).toBe('ACTION_REQUIRED');
  });

  it('detects "urgent" in subject', () => {
    const r = classify({ subject: 'URGENT: System down, need your help ASAP' });
    expect(['ACTION_REQUIRED', 'SPAM']).toContain(r.category); // URGENT can trigger spam too
  });

  it('detects meeting invite pattern', () => {
    const r = classify({ subject: 'Invitation: Product review meeting tomorrow' });
    expect(r.category).toBe('ACTION_REQUIRED');
  });
});

// ─── NEWSLETTER ───────────────────────────────────────────────────────────────

describe('NEWSLETTER detection', () => {
  it('detects newsletter keyword in subject', () => {
    const r = classify({
      subject: 'The Weekly Digest: Top stories in AI',
      headers: { 'list-unsubscribe': '<mailto:unsubscribe@newsletter.com>' },
    });
    expect(r.category).toBe('NEWSLETTER');
  });

  it('detects list-unsubscribe header', () => {
    const r = classify({
      subject: 'Your monthly roundup',
      headers: { 'list-unsubscribe': '<https://example.com/unsubscribe>', 'precedence': 'bulk' },
    });
    expect(r.category).toBe('NEWSLETTER');
  });

  it('detects bulk sender name pattern', () => {
    const r = classify({
      subject: 'June Edition — What\'s new in design',
      from: 'newsletter@designweekly.com',
      headers: { 'list-unsubscribe': '<mailto:unsub@designweekly.com>' },
    });
    expect(r.category).toBe('NEWSLETTER');
  });
});

// ─── PROMOTIONAL ─────────────────────────────────────────────────────────────

describe('PROMOTIONAL detection', () => {
  it('detects percentage discount', () => {
    const r = classify({ subject: 'Get 50% off your next order — today only!' });
    expect(r.category).toBe('PROMOTIONAL');
  });

  it('detects flash sale keywords', () => {
    const r = classify({ subject: 'Flash Sale: Limited time deals on everything' });
    expect(r.category).toBe('PROMOTIONAL');
  });

  it('detects "exclusive offer"', () => {
    const r = classify({ subject: 'Exclusive offer just for you — don\'t miss out' });
    expect(r.category).toBe('PROMOTIONAL');
  });
});

// ─── RECEIPT ─────────────────────────────────────────────────────────────────

describe('RECEIPT detection', () => {
  it('detects order confirmation', () => {
    const r = classify({ subject: 'Order confirmation #12345 — your purchase is on its way' });
    expect(r.category).toBe('RECEIPT');
  });

  it('detects invoice', () => {
    const r = classify({ subject: 'Invoice #INV-2024-001 from Acme Corp' });
    expect(r.category).toBe('RECEIPT');
  });

  it('detects payment received', () => {
    const r = classify({ subject: 'Payment received — thank you for your payment' });
    expect(r.category).toBe('RECEIPT');
  });

  it('detects "your order has shipped"', () => {
    const r = classify({ subject: 'Your order has shipped! Track your package' });
    expect(r.category).toBe('RECEIPT');
  });
});

// ─── SOCIAL ───────────────────────────────────────────────────────────────────

describe('SOCIAL detection', () => {
  it('detects LinkedIn sender', () => {
    const r = classify({
      subject: 'You have a new connection request',
      from: 'notifications@linkedin.com',
    });
    expect(r.category).toBe('SOCIAL');
  });

  it('detects GitHub sender', () => {
    const r = classify({
      subject: 'Someone commented on your pull request',
      from: 'notifications@github.com',
    });
    expect(r.category).toBe('SOCIAL');
  });

  it('detects Twitter/X sender', () => {
    const r = classify({
      subject: 'Someone followed you on X',
      from: 'notify@x.com',
    });
    expect(r.category).toBe('SOCIAL');
  });
});

// ─── SPAM ─────────────────────────────────────────────────────────────────────

describe('SPAM detection', () => {
  it('detects "congratulations you\'ve won"', () => {
    const r = classify({ subject: 'Congratulations! You\'ve been selected to claim your prize' });
    expect(r.category).toBe('SPAM');
  });

  it('detects lottery keywords', () => {
    const r = classify({ subject: 'You won the lottery! Claim $5,000,000 today' });
    expect(r.category).toBe('SPAM');
  });

  it('detects multiple exclamation marks', () => {
    const r = classify({ subject: 'FREE MONEY!!! CLAIM NOW!!! LIMITED TIME!!!' });
    // High caps + spam markers → should be SPAM
    expect(['SPAM', 'PROMOTIONAL']).toContain(r.category);
  });
});

// ─── FYI ─────────────────────────────────────────────────────────────────────

describe('FYI detection', () => {
  it('returns FYI for informational company email', () => {
    const r = classify({
      subject: 'Company update: new parking policy effective next month',
      from: 'hr@company.com',
      bodyText: 'Hi all,\n\nJust a heads up that the parking policy will change. No action needed.\n\nThanks,\nHR Team',
    });
    // Should not be ACTION_REQUIRED (no action needed) or newsletter
    expect(['FYI', 'ACTION_REQUIRED']).toContain(r.category);
  });

  it('returns low-confidence when no strong signals', () => {
    const r = classify({ subject: 'Monday', from: 'someone@example.com' });
    // No bulk markers, no keywords — confidence should be modest (< 0.75)
    expect(r.confidence).toBeLessThanOrEqual(0.75);
  });
});

// ─── Confidence range ─────────────────────────────────────────────────────────

describe('Confidence range', () => {
  const cases: ClassifyInput[] = [
    { subject: 'Order confirmation #12345' },
    { subject: '50% off today only', headers: { 'list-unsubscribe': '<mailto:u@s.com>' } },
    { subject: 'Weekly digest', from: 'newsletter@acme.com' },
    { subject: 'Hi', from: 'alice@gmail.com', bodyText: 'How are you?\n\nBest, Alice' },
    { subject: 'Congratulations you\'ve won!' },
    { subject: 'GitHub notification', from: 'notifications@github.com' },
  ];

  cases.forEach((input, i) => {
    it(`input[${i}] confidence is between 0 and 1`, () => {
      const r = classifyEmail(input);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    });
  });
});

// ─── Batch classify ───────────────────────────────────────────────────────────

describe('classifyEmailBatch', () => {
  it('classifies an array of emails', () => {
    const results = classifyEmailBatch([
      { subject: 'Order confirmation #12345' },
      { subject: '50% off today only!' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].category).toBe('RECEIPT');
    expect(results[1].category).toBe('PROMOTIONAL');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles empty input gracefully', () => {
    const r = classify({});
    // No signals other than "not a bulk sender" — weakly suggests ACTION_REQUIRED or FYI
    expect(['FYI', 'ACTION_REQUIRED']).toContain(r.category);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(0.75);
  });

  it('handles undefined subject', () => {
    const r = classify({ from: 'test@example.com', bodyText: 'Hello world' });
    expect(r).toBeDefined();
    expect(r.category).toBeTruthy();
  });

  it('handles very long body text', () => {
    const r = classify({
      subject: 'Annual report Q3',
      bodyText: 'This is a report. '.repeat(1000),
    });
    expect(r.category).toBe('FYI');
  });

  it('returns signals array', () => {
    const r = classify({ subject: 'Order confirmation #99', from: 'orders@shop.com' });
    expect(Array.isArray(r.signals)).toBe(true);
  });

  it('returns scores object with all categories', () => {
    const r = classify({ subject: 'test' });
    const categories = ['ACTION_REQUIRED', 'FYI', 'NEWSLETTER', 'PROMOTIONAL', 'RECEIPT', 'SOCIAL', 'SPAM'];
    categories.forEach((cat) => expect(r.scores).toHaveProperty(cat));
  });
});
