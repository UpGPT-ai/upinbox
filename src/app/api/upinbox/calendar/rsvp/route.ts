import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';
import { parseInviteFromEmail, sendRsvpReply, type RsvpAction } from '@/lib/calendar/rsvp';
import type { UpInboxAccount } from '@/lib/mail/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { emailId, accountId, action } = body ?? {};

  if (!emailId || !accountId || !action) {
    return NextResponse.json({ error: 'emailId, accountId, action required' }, { status: 400 });
  }
  const validActions: RsvpAction[] = ['accepted', 'declined', 'tentative'];
  if (!validActions.includes(action as RsvpAction)) {
    return NextResponse.json({ error: `action must be one of: ${validActions.join(', ')}` }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // Fetch account
  const { data: account } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Fetch email + body values
  const provider = await getMailProvider(account as UpInboxAccount);
  const [email] = await provider.getEmails([emailId]);
  if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

  // Parse invite
  const invite = parseInviteFromEmail(email);
  if (!invite) return NextResponse.json({ error: 'No calendar invite found in this email' }, { status: 422 });

  // Send RSVP via SMTP
  const displayName = user.user_metadata?.full_name ?? user.email ?? null;
  await sendRsvpReply(account as UpInboxAccount, invite, displayName, action as RsvpAction);

  // Update rsvp_status in calendar_events (if the event is synced)
  await (supabase as any)
    .schema('upinbox')
    .from('calendar_events')
    .update({ rsvp_status: action, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('uid', invite.uid);

  return NextResponse.json({ ok: true, uid: invite.uid, action });
}
