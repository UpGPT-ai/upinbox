/**
 * GET  /api/upinbox/subscriptions?accountId=<uuid>
 *   Returns the list of sender subscriptions for the given account.
 *   Currently returns {subscriptions:[]} as a stub — population will come
 *   from email_classifications once that table is wired up.
 *
 * POST /api/upinbox/subscriptions
 *   Body: { accountId, senderEmail, action: 'keep'|'digest'|'unsub' }
 *   Saves the sender rule to user_metadata (upinbox schema).
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

  // TODO: once email_classifications is populated, join here:
  //   .schema('upinbox').from('email_classifications')
  //   .select('sender_email, classification, classified_at')
  //   .eq('account_id', accountId)
  //   .eq('user_id', user.id)
  //   .order('classified_at', { ascending: false })
  //
  // For now return the saved sender rules from user_metadata.
  const { data: meta, error: metaError } = await (supabase as any)
    .schema('upinbox')
    .from('user_metadata')
    .select('subscription_rules')
    .eq('user_id', user.id)
    .single();

  if (metaError && metaError.code !== 'PGRST116') {
    // PGRST116 = no rows — that is fine (user has no metadata yet)
    return NextResponse.json({ error: metaError.message }, { status: 500 });
  }

  const rules: Record<string, string> = meta?.subscription_rules ?? {};

  // Filter rules that belong to this account's sender addresses.
  // Full join with email_classifications pending (TODO above).
  const subscriptions = Object.entries(rules).map(([senderEmail, action]) => ({
    senderEmail,
    action,
  }));

  return NextResponse.json({ subscriptions });
}

// ─── POST ────────────────────────────────────────────────────────────────────

const PostSchema = z.object({
  accountId: z.string().uuid(),
  senderEmail: z.string().email(),
  action: z.enum(['keep', 'digest', 'unsub']),
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

  const { accountId, senderEmail, action } = parsed.data;

  const supabase = await createServerSupabaseClient();

  // Verify account ownership.
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

  // Read existing metadata so we can merge into the JSONB column.
  const { data: existing } = await (supabase as any)
    .schema('upinbox')
    .from('user_metadata')
    .select('subscription_rules')
    .eq('user_id', user.id)
    .single();

  const currentRules: Record<string, string> = existing?.subscription_rules ?? {};
  const updatedRules = { ...currentRules, [senderEmail]: action };

  const { error: upsertError } = await (supabase as any)
    .schema('upinbox')
    .from('user_metadata')
    .upsert(
      { user_id: user.id, subscription_rules: updatedRules, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, senderEmail, action });
}
