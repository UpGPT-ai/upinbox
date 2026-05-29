/**
 * DELETE /api/upinbox/send-later/[id]  — cancel a pending scheduled send
 *
 * Query params:
 *   accountId  — required, used to verify ownership before cancelling
 *
 * Only 'pending' sends can be cancelled. Once a send is 'sent' or 'failed'
 * the record is immutable via this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // Verify the scheduled send exists, belongs to an account the user owns,
  // and is still in a cancellable state — all in a single query via JOIN.
  const { data: existing, error: fetchError } = await (supabase as any)
    .schema('upinbox')
    .from('scheduled_sends')
    .select('id, status, accounts!inner(id, user_id)')
    .eq('id', id)
    .eq('account_id', accountId)
    .eq('accounts.user_id', user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Scheduled send not found' }, { status: 404 });
  }

  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot cancel a send with status '${existing.status}'` },
      { status: 409 }
    );
  }

  const { error: updateError } = await (supabase as any)
    .schema('upinbox')
    .from('scheduled_sends')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (updateError) {
    console.error('[send-later DELETE] update error:', updateError);
    return NextResponse.json(
      { error: 'Failed to cancel scheduled send', detail: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
