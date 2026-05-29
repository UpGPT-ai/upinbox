export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';

type SubsystemError = {
  stage: string;
  rowId?: string;
  message: string;
};

const HIGH_ERROR_THRESHOLD = 5;

function logHighErrors(subsystem: string, errors: SubsystemError[]) {
  if (errors.length > HIGH_ERROR_THRESHOLD) {
    console.error(
      `[CRON ERROR HIGH] subsystem=${subsystem} errorCount=${errors.length} sample=${JSON.stringify(
        errors.slice(0, 5)
      )}`
    );
  }
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tickStart = Date.now();
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  let snoozesRestored = 0;
  let sendsFired = 0;
  let remindersFired = 0;

  const snoozeErrors: SubsystemError[] = [];
  const sendErrors: SubsystemError[] = [];
  const reminderErrors: SubsystemError[] = [];

  // 1. Restore snoozed messages where unsnooze_at has passed
  const snoozeStart = Date.now();
  let snoozeCandidateCount = 0;
  try {
    const { data: snoozed, error: snoozeQueryError } = await (supabase as any)
      .schema('upinbox')
      .from('snoozed_messages')
      .select('*')
      .lte('unsnooze_at', now);

    if (snoozeQueryError) throw snoozeQueryError;

    snoozeCandidateCount = (snoozed ?? []).length;

    for (const row of snoozed ?? []) {
      try {
        const { data: account, error: accountError } = await (supabase as any)
          .schema('upinbox')
          .from('email_accounts')
          .select('*')
          .eq('id', row.account_id)
          .single();

        if (accountError || !account) {
          snoozeErrors.push({
            stage: 'load_account',
            rowId: row.id,
            message: accountError ? errMessage(accountError) : 'account_not_found',
          });
          continue;
        }

        const provider = await getMailProvider(account);
        const mailboxes = await provider.listMailboxes();
        const inboxMailbox = mailboxes.find((m) => m.role === 'inbox');
        if (inboxMailbox) {
          await provider.moveEmail(row.message_id, inboxMailbox.id);
        } else {
          snoozeErrors.push({
            stage: 'resolve_inbox',
            rowId: row.id,
            message: 'inbox_mailbox_not_found',
          });
        }

        await (supabase as any)
          .schema('upinbox')
          .from('snoozed_messages')
          .delete()
          .eq('id', row.id);

        snoozesRestored++;
      } catch (e) {
        snoozeErrors.push({
          stage: 'restore_snooze',
          rowId: row?.id,
          message: errMessage(e),
        });
      }
    }
  } catch (e) {
    snoozeErrors.push({ stage: 'query_snoozed', message: errMessage(e) });
  }
  const snoozeDuration = Date.now() - snoozeStart;
  console.log(
    `[cron tick] snoozes: candidates=${snoozeCandidateCount} restored=${snoozesRestored} errors=${snoozeErrors.length} durationMs=${snoozeDuration}`
  );
  logHighErrors('snoozes', snoozeErrors);

  // 2. Fire scheduled sends where send_at has passed and status is pending
  const sendStart = Date.now();
  let sendCandidateCount = 0;
  try {
    const { data: scheduled, error: scheduledQueryError } = await (supabase as any)
      .schema('upinbox')
      .from('scheduled_sends')
      .select('*')
      .eq('status', 'pending')
      .lte('send_at', now);

    if (scheduledQueryError) throw scheduledQueryError;

    sendCandidateCount = (scheduled ?? []).length;

    for (const row of scheduled ?? []) {
      try {
        const { data: account, error: accountError } = await (supabase as any)
          .schema('upinbox')
          .from('email_accounts')
          .select('*')
          .eq('id', row.account_id)
          .single();

        if (accountError || !account) {
          sendErrors.push({
            stage: 'load_account',
            rowId: row.id,
            message: accountError ? errMessage(accountError) : 'account_not_found',
          });
          continue;
        }

        const provider = await getMailProvider(account);

        let newStatus = 'sent';
        try {
          await provider.sendEmail(row.payload);
        } catch (sendErr) {
          newStatus = 'failed';
          sendErrors.push({
            stage: 'provider_send',
            rowId: row.id,
            message: errMessage(sendErr),
          });
        }

        await (supabase as any)
          .schema('upinbox')
          .from('scheduled_sends')
          .update({ status: newStatus })
          .eq('id', row.id);

        if (newStatus === 'sent') sendsFired++;
      } catch (e) {
        sendErrors.push({
          stage: 'process_scheduled_send',
          rowId: row?.id,
          message: errMessage(e),
        });
      }
    }
  } catch (e) {
    sendErrors.push({ stage: 'query_scheduled_sends', message: errMessage(e) });
  }
  const sendDuration = Date.now() - sendStart;
  console.log(
    `[cron tick] sends: candidates=${sendCandidateCount} fired=${sendsFired} errors=${sendErrors.length} durationMs=${sendDuration}`
  );
  logHighErrors('sends', sendErrors);

  // 3. Fire follow-up reminders where remind_at has passed and status is pending
  const reminderStart = Date.now();
  try {
    const { error: reminderError, count } = await (supabase as any)
      .schema('upinbox')
      .from('follow_up_reminders')
      .update({ status: 'fired' })
      .eq('status', 'pending')
      .lte('remind_at', now)
      .select('id', { count: 'exact', head: true });

    if (reminderError) {
      reminderErrors.push({ stage: 'fire_reminders', message: errMessage(reminderError) });
    } else if (typeof count === 'number') {
      remindersFired = count;
    }
  } catch (e) {
    reminderErrors.push({ stage: 'fire_reminders', message: errMessage(e) });
  }
  const reminderDuration = Date.now() - reminderStart;
  console.log(
    `[cron tick] reminders: fired=${remindersFired} errors=${reminderErrors.length} durationMs=${reminderDuration}`
  );
  logHighErrors('reminders', reminderErrors);

  const durationMs = Date.now() - tickStart;
  const ok =
    snoozeErrors.length <= HIGH_ERROR_THRESHOLD &&
    sendErrors.length <= HIGH_ERROR_THRESHOLD &&
    reminderErrors.length <= HIGH_ERROR_THRESHOLD;

  console.log(
    `[cron tick] complete ok=${ok} durationMs=${durationMs} snoozesRestored=${snoozesRestored} sendsFired=${sendsFired} remindersFired=${remindersFired} snoozeErrors=${snoozeErrors.length} sendErrors=${sendErrors.length} reminderErrors=${reminderErrors.length}`
  );

  return NextResponse.json({
    ok,
    durationMs,
    snoozesRestored,
    snoozeErrors,
    sendsFired,
    sendErrors,
    remindersFired,
    reminderErrors,
  });
}
