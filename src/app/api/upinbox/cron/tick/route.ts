export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  let snoozesRestored = 0;
  let sendsFired = 0;
  let remindersFired = 0;

  // 1. Restore snoozed messages where unsnooze_at has passed
  try {
    const { data: snoozed, error: snoozeQueryError } = await (supabase as any)
      .schema('upinbox')
      .from('snoozed_messages')
      .select('*')
      .lte('unsnooze_at', now);

    if (snoozeQueryError) throw snoozeQueryError;

    for (const row of snoozed ?? []) {
      try {
        const { data: account, error: accountError } = await (supabase as any)
          .schema('upinbox')
          .from('email_accounts')
          .select('*')
          .eq('id', row.account_id)
          .single();

        if (accountError || !account) continue;

        const provider = await getMailProvider(account);
        // Resolve the inbox mailbox ID, then move the snoozed message back
        const mailboxes = await provider.listMailboxes();
        const inboxMailbox = mailboxes.find((m) => m.role === 'inbox');
        if (inboxMailbox) {
          await provider.moveEmail(row.message_id, inboxMailbox.id);
        }

        await (supabase as any)
          .schema('upinbox')
          .from('snoozed_messages')
          .delete()
          .eq('id', row.id);

        snoozesRestored++;
      } catch {
        // continue processing remaining rows
      }
    }
  } catch {
    // non-fatal: continue to next operation
  }

  // 2. Fire scheduled sends where send_at has passed and status is pending
  try {
    const { data: scheduled, error: scheduledQueryError } = await (supabase as any)
      .schema('upinbox')
      .from('scheduled_sends')
      .select('*')
      .eq('status', 'pending')
      .lte('send_at', now);

    if (scheduledQueryError) throw scheduledQueryError;

    for (const row of scheduled ?? []) {
      try {
        const { data: account, error: accountError } = await (supabase as any)
          .schema('upinbox')
          .from('email_accounts')
          .select('*')
          .eq('id', row.account_id)
          .single();

        if (accountError || !account) continue;

        const provider = await getMailProvider(account);

        let newStatus = 'sent';
        try {
          await provider.sendEmail(row.payload);
        } catch {
          newStatus = 'failed';
        }

        await (supabase as any)
          .schema('upinbox')
          .from('scheduled_sends')
          .update({ status: newStatus })
          .eq('id', row.id);

        if (newStatus === 'sent') sendsFired++;
      } catch {
        // continue processing remaining rows
      }
    }
  } catch {
    // non-fatal: continue to next operation
  }

  // 3. Fire follow-up reminders where remind_at has passed and status is pending
  try {
    const { error: reminderError, count } = await (supabase as any)
      .schema('upinbox')
      .from('follow_up_reminders')
      .update({ status: 'fired' })
      .eq('status', 'pending')
      .lte('remind_at', now)
      .select('id', { count: 'exact', head: true });

    if (!reminderError && typeof count === 'number') {
      remindersFired = count;
    }
  } catch {
    // non-fatal
  }

  return NextResponse.json({ ok: true, snoozesRestored, sendsFired, remindersFired });
}
