/**
 * GET  /api/upinbox/signatures?accountId=<uuid>  — list signatures for an account
 * POST /api/upinbox/signatures                    — create a new signature
 *
 * Body (POST): { accountId, name, html, isDefault?, useOnReply? }
 *
 * Ownership is enforced by joining accounts through user_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET: list signatures ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'Missing accountId query parameter' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // Verify the user owns this account before exposing its signatures
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
    .from('signatures')
    .select('id, account_id, name, html, is_default, use_on_reply, created_at, updated_at')
    .eq('account_id', accountId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[signatures] list error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signatures: data });
}

// ─── POST: create a signature ─────────────────────────────────────────────────

const CreateSignatureSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(255),
  html: z.string().min(1),
  isDefault: z.boolean().optional().default(false),
  useOnReply: z.boolean().optional().default(false),
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

  const parsed = CreateSignatureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { accountId, name, html, isDefault, useOnReply } = parsed.data;

  const supabase = await createServerSupabaseClient();

  // Verify account ownership
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

  // If this signature is marked as default, clear existing defaults for this account
  if (isDefault) {
    await (supabase as any)
      .schema('upinbox')
      .from('signatures')
      .update({ is_default: false })
      .eq('account_id', accountId);
  }

  const { data: signature, error } = await (supabase as any)
    .schema('upinbox')
    .from('signatures')
    .insert({
      account_id: accountId,
      name,
      html,
      is_default: isDefault,
      use_on_reply: useOnReply,
    })
    .select('id, account_id, name, html, is_default, use_on_reply, created_at, updated_at')
    .single();

  if (error) {
    console.error('[signatures] create error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signature }, { status: 201 });
}
