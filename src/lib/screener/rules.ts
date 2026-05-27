/**
 * UpInbox Screener Rules
 *
 * The Screener is a smart inbox gate: it processes all incoming email,
 * auto-archives low-signal mail, surfaces ACTION_REQUIRED prominently,
 * and groups related mail into feeds (newsletters, receipts, promos).
 *
 * Rules are applied in priority order:
 *   1. Allow list (sender always passes through)
 *   2. Block list (sender always archived)
 *   3. Category-based routing (from triage results)
 *   4. Default (pass through to inbox)
 *
 * Rules are stored in upinbox.screener_rules per user.
 */

export type ScreenerAction =
  | 'inbox'          // Show in inbox (default)
  | 'archive'        // Auto-archive (skip inbox)
  | 'feed-news'      // Route to Newsletter feed
  | 'feed-promos'    // Route to Promotions feed
  | 'feed-receipts'  // Route to Receipts feed
  | 'feed-social'    // Route to Social feed
  | 'trash'          // Auto-trash
  | 'mark-read'      // Pass through but mark as read
  | 'notify-push';   // Force push notification regardless of other settings

export type ScreenerTrigger =
  | { type: 'sender-domain'; domain: string }
  | { type: 'sender-email'; email: string }
  | { type: 'category'; category: string }
  | { type: 'keyword-subject'; keyword: string }
  | { type: 'has-list-unsubscribe' }
  | { type: 'confidence-below'; threshold: number };

export interface ScreenerRule {
  id: string;
  user_id: string;
  name: string;
  priority: number;     // lower = higher priority
  enabled: boolean;
  trigger: ScreenerTrigger;
  action: ScreenerAction;
  created_at: string;
}

/**
 * Default rules applied to all new accounts.
 * Users can disable, modify, or reorder these.
 */
export const DEFAULT_SCREENER_RULES: Omit<ScreenerRule, 'id' | 'user_id' | 'created_at'>[] = [
  {
    name: 'Auto-archive newsletters',
    priority: 100,
    enabled: true,
    trigger: { type: 'category', category: 'NEWSLETTER' },
    action: 'feed-news',
  },
  {
    name: 'Auto-archive promotions',
    priority: 110,
    enabled: true,
    trigger: { type: 'category', category: 'PROMOTIONAL' },
    action: 'feed-promos',
  },
  {
    name: 'Route receipts to feed',
    priority: 120,
    enabled: true,
    trigger: { type: 'category', category: 'RECEIPT' },
    action: 'feed-receipts',
  },
  {
    name: 'Route social notifications',
    priority: 130,
    enabled: true,
    trigger: { type: 'category', category: 'SOCIAL' },
    action: 'feed-social',
  },
  {
    name: 'Trash spam',
    priority: 140,
    enabled: true,
    trigger: { type: 'category', category: 'SPAM' },
    action: 'trash',
  },
  {
    name: 'Archive bulk with unsubscribe link',
    priority: 200,
    enabled: false,  // Off by default — opt-in
    trigger: { type: 'has-list-unsubscribe' },
    action: 'archive',
  },
];

/**
 * Evaluate which action to take for an email.
 * Returns the first matching rule's action, or 'inbox' if none match.
 */
export function evaluateScreenerRules(
  rules: ScreenerRule[],
  context: {
    category?: string;
    confidence?: number;
    fromEmail?: string;
    fromDomain?: string;
    subject?: string;
    hasListUnsubscribe?: boolean;
  }
): { action: ScreenerAction; matchedRule: ScreenerRule | null } {
  const activeRules = rules
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of activeRules) {
    if (matchesTrigger(rule.trigger, context)) {
      return { action: rule.action, matchedRule: rule };
    }
  }

  return { action: 'inbox', matchedRule: null };
}

function matchesTrigger(
  trigger: ScreenerTrigger,
  ctx: {
    category?: string;
    confidence?: number;
    fromEmail?: string;
    fromDomain?: string;
    subject?: string;
    hasListUnsubscribe?: boolean;
  }
): boolean {
  switch (trigger.type) {
    case 'category':
      return ctx.category === trigger.category;
    case 'sender-email':
      return ctx.fromEmail?.toLowerCase() === trigger.email.toLowerCase();
    case 'sender-domain':
      return ctx.fromDomain?.toLowerCase() === trigger.domain.toLowerCase();
    case 'keyword-subject':
      return (ctx.subject ?? '').toLowerCase().includes(trigger.keyword.toLowerCase());
    case 'has-list-unsubscribe':
      return ctx.hasListUnsubscribe === true;
    case 'confidence-below':
      return (ctx.confidence ?? 1) < trigger.threshold;
    default:
      return false;
  }
}

/** Map feed action to display label */
export const FEED_LABELS: Partial<Record<ScreenerAction, string>> = {
  'feed-news': 'Newsletters',
  'feed-promos': 'Promotions',
  'feed-receipts': 'Receipts',
  'feed-social': 'Social',
};

/** Feed action → email category */
export const FEED_CATEGORIES: Partial<Record<ScreenerAction, string[]>> = {
  'feed-news': ['NEWSLETTER'],
  'feed-promos': ['PROMOTION'],
  'feed-receipts': ['RECEIPT'],
  'feed-social': ['SOCIAL'],
};
