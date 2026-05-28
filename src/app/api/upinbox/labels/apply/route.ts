'use server';

/**
 * POST /api/upinbox/labels/apply
 * Body: { accountId, emailUid, labelId, apply: boolean }
 * Adds or removes a label from an email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, emailUid, labelId, apply } = await req.json();
    if (!accountId || !emailUid || !labelId) {
      return NextResponse.json({ error: 'accountId, emailUid, labelId required' }, { status: 400 });
    }

    // Verify account ownership
    const { data: acct } = await (supabase as any)
      .schema('upinbox')
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();
    if (!acct) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (apply !== false) {
      // Upsert
      await (supabase as any)
        .schema('upinbox')
        .from('email_labels')
        .upsert({ email_imap_uid: emailUid, account_id: accountId, label_id: labelId });
    } else {
      // Remove
      await (supabase as any)
        .schema('upinbox')
        .from('email_labels')
        .delete()
        .eq('email_imap_uid', emailUid)
        .eq('account_id', accountId)
        .eq('label_id', labelId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
