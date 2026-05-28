/**
 * POST /api/upinbox/emails/send
 *
 * Send an email directly via SMTP (no draft intermediate).
 * Body: { accountId, to, cc?, bcc?, subject, body, isHtml?, inReplyTo?, references? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { ImapProvider } from '@/lib/mail/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    accountId: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml?: boolean;
    inReplyTo?: string;
    references?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { accountId, to, cc, bcc, subject, body: emailBody, isHtml, inReplyTo, references } = body;

  if (!accountId || !to?.length || !subject) {
    return NextResponse.json(
      { error: 'accountId, to[], and subject are required' },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data: account, error: accountError } = await (supabase as any)
    .schema('upinbox').from('accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  try {
    const provider = await ImapProvider.create(account);
    await provider.sendDirect({
      to,
      cc,
      bcc,
      subject,
      body: emailBody ?? '',
      isHtml,
      inReplyTo,
      references,
    });

    return NextResponse.json({ ok: true, sentAt: new Date().toISOString() });
  } catch (err) {
    console.error('[upinbox/send]', err);
    return NextResponse.json(
      {
        error: 'Failed to send email',
        detail: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
