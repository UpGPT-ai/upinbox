/**
 * GET /api/upinbox/health-score?accountId=<uuid>
 *
 * Returns an inbox health score (0–100) for the given account.
 *
 * Score starts at 100 and is adjusted down by engagement proxies:
 *   - High unread count relative to total inbox  (-up to 30)
 *   - Large absolute unread backlog              (-up to 20)
 *   - Large inbox size (inbox bloat)             (-up to 20)
 *   - Account not recently synced                (-up to 15)
 *   - No primary account flag                   (- 5)
 *
 * Returns:
 *   { score, label, unreadCount, inboxCount, shareUrl }
 *
 * Errors: 400 missing param | 401 unauth | 403 wrong owner | 500 db error
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Score thresholds ─────────────────────────────────────────────────────────

function computeLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Needs attention';
  return 'Critical';
}

function buildTips(
  unreadCount: number,
  inboxCount: number,
  unreadRatio: number,
  staleDays: number | null,
  isPrimary: boolean
): string[] {
  const tips: string[] = [];

  if (!isPrimary) {
    tips.push('Mark this as your primary account so your most important mail is always front and center.');
  }
  if (staleDays !== null && staleDays > 2) {
    tips.push(`This account hasn't synced in ${staleDays} day${staleDays === 1 ? '' : 's'}. Check your connection settings.`);
  }
  if (unreadRatio > 0.5) {
    tips.push('More than half your inbox is unread. Try the Screener to auto-triage low-signal mail.');
  }
  if (unreadCount > 500) {
    tips.push('You have a large unread backlog. Use bulk-archive or snooze to clear it in batches.');
  }
  if (inboxCount > 2000) {
    tips.push('Your inbox is very large. Archiving older threads can speed up search and sync.');
  }

  return tips;
}

// ─── Score computation ────────────────────────────────────────────────────────

function computeScore(params: {
  unreadCount: number;
  inboxCount: number;
  lastSyncedAt: string | null;
  isPrimary: boolean;
}): number {
  const { unreadCount, inboxCount, lastSyncedAt, isPrimary } = params;

  let score = 100;

  // Unread ratio penalty (0–30 points)
  if (inboxCount > 0) {
    const ratio = unreadCount / inboxCount;
    // Linear: 0% unread = -0, 100% unread = -30
    score -= Math.round(ratio * 30);
  }

  // Absolute unread backlog penalty (0–20 points)
  // 0 unread = -0, 1000+ unread = -20 (capped)
  const unreadPenalty = Math.min(20, Math.floor((unreadCount / 1000) * 20));
  score -= unreadPenalty;

  // Inbox bloat penalty (0–20 points)
  // 0 messages = -0, 5000+ = -20 (capped)
  const bloatPenalty = Math.min(20, Math.floor((inboxCount / 5000) * 20));
  score -= bloatPenalty;

  // Stale sync penalty (0–15 points)
  if (lastSyncedAt) {
    const ageMs = Date.now() - new Date(lastSyncedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      score -= 15;
    } else if (ageDays > 2) {
      score -= Math.round((ageDays / 7) * 15);
    }
  } else {
    // Never synced
    score -= 15;
  }

  // Not primary penalty (5 points)
  if (!isPrimary) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Param validation
  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId || accountId.trim() === '') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // Fetch account — ownership enforced by eq('user_id', user.id)
  const { data: account, error: accountError } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id, email_address, is_primary, last_synced_at, sync_enabled')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (accountError) {
    console.error('[health-score] account fetch error', accountError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!account) {
    // Either doesn't exist or belongs to another user — same 403 to avoid enumeration
    return NextResponse.json({ error: 'Account not found' }, { status: 403 });
  }

  // Fetch mailbox stats (upinbox schema may cache message counts)
  // We query the mailboxes table for inbox + unread counts.
  // Fall back to 0 if the table has no rows yet (fresh account).
  const { data: mailboxes, error: mailboxError } = await (supabase as any)
    .schema('upinbox')
    .from('mailboxes')
    .select('role, total_emails, unread_count')
    .eq('account_id', accountId);

  if (mailboxError) {
    console.error('[health-score] mailbox fetch error', mailboxError);
    return NextResponse.json({ error: 'Database error fetching mailbox data' }, { status: 500 });
  }

  // Aggregate INBOX role mailbox(es); some providers split inbox into sub-mailboxes
  type MailboxRow = { role: string; total_emails: number; unread_count: number };
  const inboxMailboxes: MailboxRow[] = (mailboxes ?? []).filter(
    (m: MailboxRow) => m.role === 'inbox' || m.role === 'INBOX'
  );

  const inboxCount = inboxMailboxes.reduce(
    (sum: number, m: MailboxRow) => sum + (m.total_emails ?? 0),
    0
  );
  const unreadCount = inboxMailboxes.reduce(
    (sum: number, m: MailboxRow) => sum + (m.unread_count ?? 0),
    0
  );

  // Compute stale days for tips
  let staleDays: number | null = null;
  if (account.last_synced_at) {
    const ageMs = Date.now() - new Date(account.last_synced_at).getTime();
    staleDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  }

  const unreadRatio = inboxCount > 0 ? unreadCount / inboxCount : 0;

  const score = computeScore({
    unreadCount,
    inboxCount,
    lastSyncedAt: account.last_synced_at ?? null,
    isPrimary: account.is_primary ?? false,
  });

  const label = computeLabel(score);
  const tips = buildTips(
    unreadCount,
    inboxCount,
    unreadRatio,
    staleDays,
    account.is_primary ?? false
  );

  // Share URL — links directly to this account's health view
  const origin = request.nextUrl.origin;
  const shareUrl = `${origin}/mail/health?accountId=${encodeURIComponent(accountId)}&score=${score}`;

  return NextResponse.json({
    score,
    label,
    unreadCount,
    inboxCount,
    shareUrl,
    tips,
  });
}
