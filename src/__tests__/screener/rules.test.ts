/**
 * Tests for the screener rules engine
 */

import { describe, it, expect } from 'vitest';
import { evaluateScreenerRules, DEFAULT_SCREENER_RULES } from '@/lib/screener/rules';
import type { ScreenerRule, ScreenerContext } from '@/lib/screener/rules';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
function makeRule(
  overrides: Partial<Omit<ScreenerRule, 'id' | 'user_id' | 'created_at'>> &
    Pick<ScreenerRule, 'trigger' | 'action'>
): ScreenerRule {
  return {
    id: `rule-${++idCounter}`,
    user_id: 'user-1',
    name: 'Test rule',
    priority: 100,
    enabled: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<ScreenerContext> = {}): ScreenerContext {
  return {
    category: 'FYI',
    confidence: 0.8,
    senderEmail: 'alice@example.com',
    senderDomain: 'example.com',
    subject: 'Hello world',
    hasListUnsubscribe: false,
    ...overrides,
  };
}

// ─── Category trigger ─────────────────────────────────────────────────────────

describe('category trigger', () => {
  it('matches when category equals trigger value', () => {
    const rules = [makeRule({ trigger: { type: 'category', category: 'NEWSLETTER' }, action: 'feed-news' })];
    const ctx = makeContext({ category: 'NEWSLETTER' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-news');
    expect(result.matchedRule?.action).toBe('feed-news');
  });

  it('does not match when category differs', () => {
    const rules = [makeRule({ trigger: { type: 'category', category: 'NEWSLETTER' }, action: 'feed-news' })];
    const ctx = makeContext({ category: 'ACTION_REQUIRED' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('inbox'); // default
    expect(result.matchedRule).toBeNull();
  });
});

// ─── Sender domain trigger ────────────────────────────────────────────────────

describe('sender-domain trigger', () => {
  it('matches the sender domain exactly', () => {
    const rules = [makeRule({ trigger: { type: 'sender-domain', domain: 'linkedin.com' }, action: 'feed-social' })];
    const ctx = makeContext({ senderDomain: 'linkedin.com' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-social');
  });

  it('is case-insensitive', () => {
    const rules = [makeRule({ trigger: { type: 'sender-domain', domain: 'LinkedIn.COM' }, action: 'feed-social' })];
    const ctx = makeContext({ senderDomain: 'linkedin.com' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-social');
  });

  it('does not match partial domain', () => {
    const rules = [makeRule({ trigger: { type: 'sender-domain', domain: 'evil.com' }, action: 'trash' })];
    const ctx = makeContext({ senderDomain: 'notevil.com' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('inbox');
  });
});

// ─── Sender email trigger ─────────────────────────────────────────────────────

describe('sender-email trigger', () => {
  it('matches the exact sender email', () => {
    const rules = [makeRule({ trigger: { type: 'sender-email', email: 'boss@company.com' }, action: 'notify-push' })];
    const ctx = makeContext({ senderEmail: 'boss@company.com' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('notify-push');
  });

  it('is case-insensitive', () => {
    const rules = [makeRule({ trigger: { type: 'sender-email', email: 'BOSS@Company.COM' }, action: 'notify-push' })];
    const ctx = makeContext({ senderEmail: 'boss@company.com' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('notify-push');
  });
});

// ─── Keyword-subject trigger ──────────────────────────────────────────────────

describe('keyword-subject trigger', () => {
  it('matches keyword present in subject', () => {
    const rules = [makeRule({ trigger: { type: 'keyword-subject', keyword: 'invoice' }, action: 'feed-receipts' })];
    const ctx = makeContext({ subject: 'Invoice #1234 from Acme Corp' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-receipts');
  });

  it('is case-insensitive', () => {
    const rules = [makeRule({ trigger: { type: 'keyword-subject', keyword: 'INVOICE' }, action: 'feed-receipts' })];
    const ctx = makeContext({ subject: 'Your invoice is ready' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-receipts');
  });

  it('does not match keyword not in subject', () => {
    const rules = [makeRule({ trigger: { type: 'keyword-subject', keyword: 'invoice' }, action: 'feed-receipts' })];
    const ctx = makeContext({ subject: 'Hello, how are you?' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('inbox');
  });
});

// ─── has-list-unsubscribe trigger ─────────────────────────────────────────────

describe('has-list-unsubscribe trigger', () => {
  it('matches when email has list-unsubscribe header', () => {
    const rules = [makeRule({ trigger: { type: 'has-list-unsubscribe' }, action: 'mark-read' })];
    const ctx = makeContext({ hasListUnsubscribe: true });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('mark-read');
  });

  it('does not match when header is absent', () => {
    const rules = [makeRule({ trigger: { type: 'has-list-unsubscribe' }, action: 'mark-read' })];
    const ctx = makeContext({ hasListUnsubscribe: false });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('inbox');
  });
});

// ─── confidence-below trigger ────────────────────────────────────────────────

describe('confidence-below trigger', () => {
  it('matches when confidence is below threshold', () => {
    const rules = [makeRule({ trigger: { type: 'confidence-below', threshold: 0.5 }, action: 'inbox' })];
    const ctx = makeContext({ confidence: 0.3 });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('inbox');
    expect(result.matchedRule).not.toBeNull();
  });

  it('does not match when confidence meets threshold', () => {
    const rules = [
      makeRule({ trigger: { type: 'confidence-below', threshold: 0.5 }, action: 'inbox' }),
      makeRule({ trigger: { type: 'category', category: 'NEWSLETTER' }, action: 'feed-news', priority: 50 }),
    ];
    const ctx = makeContext({ confidence: 0.9, category: 'NEWSLETTER' });
    // confidence is NOT below 0.5, so first rule doesn't match
    // second rule matches by category
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-news');
  });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe('priority ordering', () => {
  it('applies rule with lower priority number first', () => {
    const rules = [
      makeRule({ priority: 200, trigger: { type: 'category', category: 'NEWSLETTER' }, action: 'feed-news' }),
      makeRule({ priority: 50,  trigger: { type: 'category', category: 'NEWSLETTER' }, action: 'inbox' }),
    ];
    const ctx = makeContext({ category: 'NEWSLETTER' });
    // priority 50 fires first
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('inbox');
  });

  it('stops at first matching rule', () => {
    const rules = [
      makeRule({ priority: 1, trigger: { type: 'sender-domain', domain: 'amazon.com' }, action: 'feed-receipts' }),
      makeRule({ priority: 2, trigger: { type: 'category', category: 'RECEIPT' }, action: 'trash' }),
    ];
    const ctx = makeContext({ senderDomain: 'amazon.com', category: 'RECEIPT' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-receipts'); // first match wins
  });
});

// ─── Disabled rules ───────────────────────────────────────────────────────────

describe('disabled rules', () => {
  it('skips disabled rules', () => {
    const rules = [
      makeRule({ enabled: false, trigger: { type: 'category', category: 'NEWSLETTER' }, action: 'trash' }),
      makeRule({ enabled: true, trigger: { type: 'category', category: 'NEWSLETTER' }, action: 'feed-news', priority: 200 }),
    ];
    const ctx = makeContext({ category: 'NEWSLETTER' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('feed-news'); // disabled trash rule skipped
  });
});

// ─── Default result ───────────────────────────────────────────────────────────

describe('default result', () => {
  it('returns action:inbox and matchedRule:null when no rules match', () => {
    const rules = [
      makeRule({ trigger: { type: 'category', category: 'SPAM' }, action: 'trash' }),
    ];
    const ctx = makeContext({ category: 'ACTION_REQUIRED' });
    const result = evaluateScreenerRules(rules, ctx);
    expect(result.action).toBe('inbox');
    expect(result.matchedRule).toBeNull();
  });

  it('returns inbox when no rules provided', () => {
    const result = evaluateScreenerRules([], makeContext());
    expect(result.action).toBe('inbox');
  });
});

// ─── DEFAULT_SCREENER_RULES ───────────────────────────────────────────────────

describe('DEFAULT_SCREENER_RULES', () => {
  it('has rules for all major categories', () => {
    const triggers = DEFAULT_SCREENER_RULES.map((r) => {
      if (r.trigger.type === 'category') return r.trigger.category;
      return r.trigger.type;
    });
    expect(triggers).toContain('NEWSLETTER');
    expect(triggers).toContain('PROMOTIONAL');
    expect(triggers).toContain('RECEIPT');
    expect(triggers).toContain('SOCIAL');
    expect(triggers).toContain('SPAM');
  });

  it('SPAM → trash action', () => {
    const spamRule = DEFAULT_SCREENER_RULES.find(
      (r) => r.trigger.type === 'category' && r.trigger.category === 'SPAM'
    );
    expect(spamRule?.action).toBe('trash');
  });

  it('NEWSLETTER → feed-news action', () => {
    const newsRule = DEFAULT_SCREENER_RULES.find(
      (r) => r.trigger.type === 'category' && r.trigger.category === 'NEWSLETTER'
    );
    expect(newsRule?.action).toBe('feed-news');
  });

  it('rules work with evaluateScreenerRules', () => {
    const fullRules: ScreenerRule[] = DEFAULT_SCREENER_RULES.map((r, i) => ({
      ...r,
      id: `default-${i}`,
      user_id: 'test',
      created_at: new Date().toISOString(),
    }));

    const newsletterResult = evaluateScreenerRules(fullRules, makeContext({ category: 'NEWSLETTER' }));
    expect(newsletterResult.action).toBe('feed-news');

    const spamResult = evaluateScreenerRules(fullRules, makeContext({ category: 'SPAM' }));
    expect(spamResult.action).toBe('trash');

    const receiptResult = evaluateScreenerRules(fullRules, makeContext({ category: 'RECEIPT' }));
    expect(receiptResult.action).toBe('feed-receipts');
  });
});
