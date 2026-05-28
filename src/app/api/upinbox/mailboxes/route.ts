/**
 * GET /api/upinbox/mailboxes?accountId={id}
 *
 * Returns all mailboxes for an account, syncing from the mail provider
 * and upsetting the local cache in upinbox.mailboxes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';

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

  // Fetch account (RLS ensures it belongs to the current user)
  const { data: account, error: accountError } = await (supabase as any)
    .from('upinbox.accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Fetch fresh mailboxes from provider
  let providerMailboxes;
  try {
    const provider = await getMailProvider(account);
    providerMailboxes = await provider.listMailboxes();
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to fetch mailboxes from provider',
        detail: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }

  // Upsert into local cache for fast subsequent loads
  const upsertData = providerMailboxes.map((mb, idx) => ({
    account_id: accountId,
    user_id: user.id,
    provider_mailbox_id: mb.id,
    name: mb.name,
    role: mb.role ?? null,
    sort_order: idx,
    total_emails: mb.totalEmails ?? 0,
    unread_count: mb.unreadEmails ?? 0,
  }));

  if (upsertData.length > 0) {
    await (supabase as any)
      .from('upinbox.mailboxes')
      .upsert(upsertData, {
        onConflict: 'account_id,provider_mailbox_id',
        ignoreDuplicates: false,
      });
  }

  return NextResponse.json({
    mailboxes: providerMailboxes,
    synced_at: new Date().toISOString(),
  });
}
