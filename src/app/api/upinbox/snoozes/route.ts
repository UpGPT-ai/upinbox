/**
 * GET /api/upinbox/snoozes?accountId=...
 *
 * Returns all active snoozes (unsnooze_at > now()) for the given account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // Verify account ownership
  const { data: account, error: accountError } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  try {
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('snoozed_messages')
      .select('id, account_id, message_id, unsnooze_at, created_at')
      .eq('account_id', accountId)
      .gt('unsnooze_at', new Date().toISOString())
      .order('unsnooze_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch snoozes', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ snoozes: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
