/**
 * GET /api/upinbox/emails
 *
 * Query params:
 *   accountId  — required
 *   mailboxId  — optional, filter to a specific mailbox
 *   limit      — default 50, max 200
 *   page       — default 0
 *   filter     — 'all' | 'unread' | 'flagged' (default: 'all')
 *   before     — ISO date string for pagination
 *   ids        — comma-separated list of specific email IDs to fetch
 *
 * Returns a page of emails from the mail provider (not DB cache).
 * Email bodies are fetched on-demand via GET /api/upinbox/emails/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Lightweight properties for list view — body fetched separately
const LIST_PROPERTIES = [
  'id',
  'threadId',
  'mailboxIds',
  'from',
  'to',
  'subject',
  'receivedAt',
  'sentAt',
  'keywords',
  'hasAttachment',
  'preview',
  'size',
];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const accountId = params.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  // Parse query params
  const limit = Math.min(
    parseInt(params.get('limit') ?? String(DEFAULT_LIMIT), 10),
    MAX_LIMIT
  );
  const page = parseInt(params.get('page') ?? '0', 10);
  const filter = (params.get('filter') ?? 'all') as 'all' | 'unread' | 'flagged';
  const before = params.get('before') ?? undefined;
  const mailboxId = params.get('mailboxId') ?? undefined;
  const specificIds = params.get('ids')?.split(',').filter(Boolean);

  const supabase = await createServerSupabaseClient();

  // Verify account ownership (RLS)
  const { data: account, error: accountError } = await (supabase as any)
    .from('upinbox.accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  try {
    const provider = await getMailProvider(account);

    // Fetch specific IDs (used by triage, thread view)
    if (specificIds && specificIds.length > 0) {
      const emails = await provider.getEmails(specificIds, LIST_PROPERTIES);
      return NextResponse.json({ emails, total: emails.length });
    }

    // Build filter keywords
    const hasKeyword: Record<string, boolean> = {};
    if (filter === 'unread') hasKeyword['$seen'] = false;
    if (filter === 'flagged') hasKeyword['$flagged'] = true;

    // Query email IDs
    const { ids, total } = await provider.queryEmails({
      mailboxId,
      limit,
      position: page * limit,
      before: before ? new Date(before) : undefined,
      hasKeyword: Object.keys(hasKeyword).length > 0 ? hasKeyword : undefined,
      sort: [{ property: 'receivedAt', isAscending: false }],
    });

    if (ids.length === 0) {
      return NextResponse.json({ emails: [], total, page, limit });
    }

    // Fetch email headers for the page
    const emails = await provider.getEmails(ids, LIST_PROPERTIES);

    return NextResponse.json({
      emails,
      total,
      page,
      limit,
      has_more: (page + 1) * limit < total,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to fetch emails',
        detail: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
