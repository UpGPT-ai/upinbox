export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export interface ResponseRateAnalytics {
  avgResponseHrsOut: number;
  avgResponseHrsIn: number;
  unrepliedSent: number;
  fastestReply: string;
  slowestReply: string;
}

/**
 * GET /api/upinbox/analytics/response-rate?accountId=<id>
 *
 * Returns response-time analytics for a mailbox account:
 *   - avgResponseHrsOut  — average hours the user takes to reply to inbound emails
 *   - avgResponseHrsIn   — average hours contacts take to reply to the user's sent emails
 *   - unrepliedSent      — count of outbound emails that never received a reply
 *   - fastestReply       — human-readable duration of the fastest inbound reply received
 *   - slowestReply       — human-readable duration of the slowest inbound reply received
 *
 * TODO: replace placeholder data with real IMAP thread analysis:
 *   1. Pull scheduled_sends rows for accountId where status = 'sent'
 *   2. Fetch thread metadata from upinbox.email_threads (join on thread_id)
 *   3. For each sent message: find the earliest reply message with a different sender
 *   4. Compute delta between sent_at and reply received_at
 *   5. avgResponseHrsIn  = mean(delta) for threads that have a reply
 *   6. unrepliedSent     = count(threads with no reply older than 24 h)
 *   7. avgResponseHrsOut = mean(delta between inbound received_at and user's reply sent_at)
 *   8. fastestReply / slowestReply = min/max of inbound-reply deltas, formatted
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json(
      { error: 'accountId query parameter is required' },
      { status: 400 },
    );
  }

  // TODO: implement real IMAP thread analysis (see notes above)
  const placeholder: ResponseRateAnalytics = {
    avgResponseHrsOut: 0,
    avgResponseHrsIn: 0,
    unrepliedSent: 0,
    fastestReply: '--',
    slowestReply: '--',
  };

  return NextResponse.json(placeholder);
}
