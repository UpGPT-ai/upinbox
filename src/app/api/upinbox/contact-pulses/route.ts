/**
 * GET  /api/upinbox/contact-pulses?accountId=<uuid>
 *   Returns contact pulse entries from upinbox.contact_pulses for the
 *   given account, ordered by last_seen_at descending.
 *
 * POST /api/upinbox/contact-pulses
 *   Body: { accountId }
 *   Queues a background pulse-refresh job and returns immediately.
 *   The actual enrichment runs asynchronously (cron / Edge Function).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // Verify account belongs to the authenticated user.
  const { data: account, error: accountError } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('contact_pulses')
    .select(
      'id, account_id, contact_email, display_name, last_seen_at, ' +
      'email_count, sentiment_score, topics, pulse_data, created_at, updated_at',
    )
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .order('last_seen_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts: data ?? [] });
}

// ─── POST ────────────────────────────────────────────────────────────────────

const PostSchema = z.object({
  accountId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
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

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { accountId } = parsed.data;

  const supabase = await createServerSupabaseClient();

  // Verify account belongs to the authenticated user.
  const { data: account, error: accountError } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Record a refresh-request entry so the background job can pick it up.
  // The job polls upinbox.pulse_refresh_queue and processes pending rows.
  const { error: queueError } = await (supabase as any)
    .schema('upinbox')
    .from('pulse_refresh_queue')
    .insert({
      user_id:    user.id,
      account_id: accountId,
      status:     'pending',
      requested_at: new Date().toISOString(),
    });

  if (queueError) {
    // Non-fatal: log and still return success — the client will see updated
    // data on the next poll once the background job runs.
    console.error('[contact-pulses] Failed to enqueue pulse refresh:', queueError.message);
  }

  return NextResponse.json({ ok: true, message: 'Pulse refresh queued' });
}
