/**
 * POST   /api/upinbox/emails/[id]/snooze  — snooze an email (upsert)
 * DELETE /api/upinbox/emails/[id]/snooze  — unsnooze an email
 *
 * Related:
 *   GET /api/upinbox/snoozes?accountId=... — list active snoozes for an account
 *
 * snoozed_messages schema (upinbox schema):
 *   id           uuid default gen_random_uuid() primary key
 *   account_id   uuid not null references upinbox.accounts(id)
 *   message_id   text not null
 *   unsnooze_at  timestamptz not null
 *   created_at   timestamptz not null default now()
 *   unique(account_id, message_id)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

const PostSnoozeSchema = z.object({
  accountId: z.string().uuid(),
  unsnoozeAt: z.string().datetime({ message: 'unsnoozeAt must be an ISO 8601 datetime string' }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyAccountOwnership(
  userId: string,
  accountId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { ok: false, error: 'Account not found', status: 404 };
  }
  return { ok: true };
}

// ─── POST: snooze (upsert) ────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: messageId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PostSnoozeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { accountId, unsnoozeAt } = parsed.data;

  const ownership = await verifyAccountOwnership(user.id, accountId);
  if (!ownership.ok) {
    return NextResponse.json({ error: ownership.error }, { status: ownership.status });
  }

  const unsnoozeDate = new Date(unsnoozeAt);
  if (unsnoozeDate <= new Date()) {
    return NextResponse.json(
      { error: 'unsnoozeAt must be a future datetime' },
      { status: 422 }
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('snoozed_messages')
      .upsert(
        {
          account_id: accountId,
          message_id: messageId,
          unsnooze_at: unsnoozeAt,
        },
        {
          onConflict: 'account_id,message_id',
          ignoreDuplicates: false,
        }
      )
      .select('id, account_id, message_id, unsnooze_at, created_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to snooze message', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ snooze: data }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// ─── DELETE: unsnooze ─────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: messageId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId query param is required' }, { status: 400 });
  }

  const ownership = await verifyAccountOwnership(user.id, accountId);
  if (!ownership.ok) {
    return NextResponse.json({ error: ownership.error }, { status: ownership.status });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase as any)
      .schema('upinbox')
      .from('snoozed_messages')
      .delete()
      .eq('account_id', accountId)
      .eq('message_id', messageId);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to unsnooze message', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
