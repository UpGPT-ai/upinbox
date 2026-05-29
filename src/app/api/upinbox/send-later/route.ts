/**
 * POST /api/upinbox/send-later  — schedule an email for future delivery
 * GET  /api/upinbox/send-later?accountId=...  — list pending scheduled sends
 *
 * Actual sending is handled by a cron job, not this route.
 *
 * Table: upinbox.scheduled_sends
 *   id          uuid PK default gen_random_uuid()
 *   account_id  uuid FK → upinbox.accounts(id)
 *   send_at     timestamptz NOT NULL
 *   payload     jsonb NOT NULL  — full send options
 *   status      text NOT NULL default 'pending'  — 'pending'|'sent'|'failed'|'cancelled'
 *   created_at  timestamptz NOT NULL default now()
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

const ScheduleSendSchema = z.object({
  accountId: z.string().uuid({ message: 'accountId must be a valid UUID' }),
  sendAt: z.string().datetime({ message: 'sendAt must be a valid ISO 8601 datetime' }),
  to: z.array(z.string().email()).min(1, { message: 'At least one recipient required' }),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1, { message: 'subject is required' }),
  body: z.string().min(1, { message: 'body is required' }),
  isHtml: z.boolean().optional().default(false),
  inReplyTo: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verify the caller owns the account and return it.
 * Returns null (with a ready NextResponse) if ownership fails.
 */
async function verifyAccountOwnership(
  userId: string,
  accountId: string
): Promise<{ account: Record<string, unknown>; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> } | { response: NextResponse }> {
  const supabase = await createServerSupabaseClient();

  const { data: account, error } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (error || !account) {
    return {
      response: NextResponse.json({ error: 'Account not found' }, { status: 404 }),
    };
  }

  return { account: account as Record<string, unknown>, supabase };
}

// ─── POST: schedule a send ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ScheduleSendSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { accountId, sendAt, ...sendOpts } = parsed.data;

  // Reject sends scheduled in the past (allow 30s clock skew)
  const sendAtDate = new Date(sendAt);
  if (sendAtDate.getTime() < Date.now() - 30_000) {
    return NextResponse.json(
      { error: 'sendAt must be in the future' },
      { status: 422 }
    );
  }

  const result = await verifyAccountOwnership(user.id, accountId);
  if ('response' in result) return result.response;
  const { supabase } = result;

  const payload = {
    to: sendOpts.to,
    cc: sendOpts.cc ?? [],
    bcc: sendOpts.bcc ?? [],
    subject: sendOpts.subject,
    body: sendOpts.body,
    isHtml: sendOpts.isHtml ?? false,
    ...(sendOpts.inReplyTo ? { inReplyTo: sendOpts.inReplyTo } : {}),
  };

  const { data: row, error: insertError } = await (supabase as any)
    .schema('upinbox')
    .from('scheduled_sends')
    .insert({
      account_id: accountId,
      send_at: sendAt,
      payload,
      status: 'pending',
    })
    .select('id, send_at')
    .single();

  if (insertError || !row) {
    console.error('[send-later POST] insert error:', insertError);
    return NextResponse.json(
      { error: 'Failed to schedule send', detail: insertError?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { id: row.id, sendAt: row.send_at },
    { status: 201 }
  );
}

// ─── GET: list pending scheduled sends ───────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const result = await verifyAccountOwnership(user.id, accountId);
  if ('response' in result) return result.response;
  const { supabase } = result;

  const { data: rows, error } = await (supabase as any)
    .schema('upinbox')
    .from('scheduled_sends')
    .select('id, account_id, send_at, payload, status, created_at')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .order('send_at', { ascending: true });

  if (error) {
    console.error('[send-later GET] query error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled sends', detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ scheduledSends: rows ?? [] });
}
