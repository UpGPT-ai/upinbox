/**
 * GET /api/upinbox/ai/insights?accountId=<uuid>
 *
 * Returns proactive AI insights derived from the user's inbox state:
 *   - follow_up: reminders due within the next 24 hours
 *   - dormant_contact: contacts not seen in >= 14 days (contact_pulses)
 *   - inbox_spike: (placeholder) rapid growth in unread volume
 *
 * Response shape:
 *   {
 *     insights: Array<{
 *       type:         'follow_up' | 'dormant_contact' | 'inbox_spike',
 *       message:      string,
 *       emailId?:     string,   // Gmail message ID for follow_up items
 *       contactEmail?: string,  // contact address for dormant_contact items
 *       severity:     'info' | 'warning'
 *     }>
 *   }
 *
 * Data sources:
 *   upinbox.follow_up_reminders  — pending reminders with remind_at
 *   upinbox.contact_pulses       — last_seen_at for dormancy detection
 *   upinbox.health_score_history — score trend (reserved for inbox_spike)
 *
 * Errors: 400 missing param | 401 unauth | 404 account not found | 500 db
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightType = 'follow_up' | 'dormant_contact' | 'inbox_spike';
type InsightSeverity = 'info' | 'warning';

interface Insight {
  type: InsightType;
  message: string;
  emailId?: string;
  contactEmail?: string;
  severity: InsightSeverity;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyAccountOwnership(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  accountId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  return !!data && !error;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  const owned = await verifyAccountOwnership(supabase, accountId, user.id);
  if (!owned) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const insights: Insight[] = [];

  try {
    // ── 1. Follow-up reminders due within the next 24 hours ──────────────────
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: followUps, error: fuError } = await (supabase as any)
      .schema('upinbox')
      .from('follow_ups')
      .select('id, message_id, thread_subject, remind_at')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lte('remind_at', in24h.toISOString())
      .order('remind_at', { ascending: true });

    if (!fuError && followUps && followUps.length > 0) {
      if (followUps.length === 1) {
        const fu = followUps[0];
        const subject = fu.thread_subject ?? 'an email';
        insights.push({
          type: 'follow_up',
          message: `Follow-up due soon: "${subject}"`,
          emailId: fu.message_id ?? undefined,
          severity: 'warning',
        });
      } else {
        insights.push({
          type: 'follow_up',
          message: `${followUps.length} follow-ups are due in the next 24 hours`,
          severity: 'warning',
        });
      }
    }

    // ── 2. Dormant contacts (no email in >= 14 days) ──────────────────────────
    const dormantCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const { data: dormant, error: dormantError } = await (supabase as any)
      .schema('upinbox')
      .from('contact_pulses')
      .select('contact_email, display_name, last_seen_at')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .lte('last_seen_at', dormantCutoff.toISOString())
      .order('last_seen_at', { ascending: true })
      .limit(5);

    if (!dormantError && dormant && dormant.length > 0) {
      const top = dormant[0];
      const name = top.display_name ?? top.contact_email;
      const lastSeen = new Date(top.last_seen_at);
      const daysSince = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));

      insights.push({
        type: 'dormant_contact',
        message: `You haven't exchanged email with ${name} in ${daysSince} days`,
        contactEmail: top.contact_email,
        severity: 'info',
      });
    }

    // ── 3. Inbox spike — placeholder using health_score_history ──────────────
    // Pulls the two most recent score samples. If the latest score dropped
    // >= 15 points vs the previous sample we surface an inbox_spike warning.
    const { data: scoreHistory, error: histError } = await (supabase as any)
      .schema('upinbox')
      .from('health_score_history')
      .select('score, recorded_at')
      .eq('account_id', accountId)
      .order('recorded_at', { ascending: false })
      .limit(2);

    if (!histError && scoreHistory && scoreHistory.length === 2) {
      const [latest, previous] = scoreHistory as { score: number; recorded_at: string }[];
      const drop = previous.score - latest.score;
      if (drop >= 15) {
        insights.push({
          type: 'inbox_spike',
          message: `Your inbox health dropped ${drop} points — you may have a surge of unread mail`,
          severity: 'warning',
        });
      }
    }

    return NextResponse.json({ insights });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to compute insights',
        detail: err instanceof Error ? err.message : 'Unknown',
      },
      { status: 500 },
    );
  }
}
