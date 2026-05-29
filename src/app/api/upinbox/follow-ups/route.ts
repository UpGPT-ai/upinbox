/**
 * GET  /api/upinbox/follow-ups?accountId=...  — list pending follow-up reminders for an account
 * POST /api/upinbox/follow-ups               — create a follow-up reminder
 *
 * Table: upinbox.follow_ups
 *   id              uuid PK  default gen_random_uuid()
 *   user_id         uuid NOT NULL  — auth.uid()
 *   account_id      uuid NOT NULL  FK → upinbox.accounts(id)
 *   message_id      text NOT NULL  — Gmail message ID
 *   thread_subject  text NOT NULL
 *   remind_at       timestamptz NOT NULL
 *   status          text NOT NULL  default 'pending'  — 'pending'|'done'|'dismissed'
 *   created_at      timestamptz NOT NULL default now()
 *   updated_at      timestamptz NOT NULL default now()
 *
 * GET returns only status='pending' records where remind_at > now().
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateFollowUpSchema = z.object({
  accountId: z.string().uuid({ message: 'accountId must be a valid UUID' }),
  messageId: z.string().min(1, { message: 'messageId is required' }),
  threadSubject: z.string().min(1, { message: 'threadSubject is required' }).max(998),
  remindAt: z.string().datetime({ message: 'remindAt must be a valid ISO 8601 datetime' }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyAccountOwnership(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  accountId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  return !!data && !error;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

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

  const owned = await verifyAccountOwnership(supabase, accountId, user.id);
  if (!owned) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  try {
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('follow_ups')
      .select('id, account_id, message_id, thread_subject, remind_at, status, created_at, updated_at')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gt('remind_at', new Date().toISOString())
      .order('remind_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch follow-ups', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ followUps: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateFollowUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { accountId, messageId, threadSubject, remindAt } = parsed.data;

  // Reject remindAt in the past
  if (new Date(remindAt) <= new Date()) {
    return NextResponse.json(
      { error: 'remindAt must be a future datetime' },
      { status: 422 }
    );
  }

  const supabase = await createServerSupabaseClient();

  const owned = await verifyAccountOwnership(supabase, accountId, user.id);
  if (!owned) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  try {
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('follow_ups')
      .insert({
        user_id: user.id,
        account_id: accountId,
        message_id: messageId,
        thread_subject: threadSubject,
        remind_at: remindAt,
        status: 'pending',
      })
      .select('id, account_id, message_id, thread_subject, remind_at, status, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create follow-up', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ followUp: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
