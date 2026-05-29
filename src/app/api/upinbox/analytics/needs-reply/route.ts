export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

export interface NeedsReplyEmail {
  id: string;
  subject: string;
  to: string;
  sentAt: string; // ISO-8601
}

export interface NeedsReplyResponse {
  emails: NeedsReplyEmail[];
}

/**
 * GET /api/upinbox/analytics/needs-reply?accountId=<id>&days=7
 *
 * Returns outbound emails sent by the user that have received no reply
 * within the specified number of days.
 *
 * Query params:
 *   accountId  — required; the upinbox account UUID
 *   days       — optional, default 7; look-back window in days
 *
 * TODO: implement real query:
 *   1. Resolve cutoff = now() - interval '<days> days'
 *   2. SELECT id, subject, to_address, sent_at
 *        FROM upinbox.scheduled_sends
 *       WHERE account_id = $accountId
 *         AND status = 'sent'
 *         AND sent_at <= cutoff            -- sent at least <days> ago
 *         AND thread_id NOT IN (
 *               SELECT DISTINCT thread_id
 *                 FROM upinbox.email_messages
 *                WHERE direction = 'inbound'
 *                  AND account_id = $accountId
 *             )
 *   3. Map rows to NeedsReplyEmail shape
 *   4. Return sorted by sentAt ASC (oldest first, most urgent)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');
  const daysParam = searchParams.get('days');
  const days = daysParam ? parseInt(daysParam, 10) : 7;

  if (!accountId) {
    return NextResponse.json(
      { error: 'accountId query parameter is required' },
      { status: 400 },
    );
  }

  if (isNaN(days) || days < 1) {
    return NextResponse.json(
      { error: 'days must be a positive integer' },
      { status: 400 },
    );
  }

  // TODO: replace with real scheduled_sends + thread analysis (see notes above)
  const response: NeedsReplyResponse = { emails: [] };

  return NextResponse.json(response);
}
