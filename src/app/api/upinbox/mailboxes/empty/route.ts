/**
 * POST /api/upinbox/mailboxes/empty
 *
 * Permanently deletes ALL messages in a mailbox (server-side IMAP EXPUNGE).
 * Used for "Empty Folder" / "Empty Trash" — operates on the full mailbox,
 * not just the current page of loaded emails.
 *
 * Body: { accountId: string; mailboxId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { accountId, mailboxId } = await req.json() as { accountId?: string; mailboxId?: string };
    if (!accountId || !mailboxId) {
      return NextResponse.json({ error: 'accountId and mailboxId required' }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createServerSupabaseClient();

    // Verify account ownership via RLS
    const { data: account, error: accountError } = await (supabase as any)
      .schema('upinbox').from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const provider = await getMailProvider(account);
    // ImapProvider exposes emptyMailbox; cast to access it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count: number = await (provider as any).emptyMailbox(mailboxId);

    return NextResponse.json({ ok: true, deleted: count });
  } catch (err: unknown) {
    console.error('[empty-mailbox]', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
