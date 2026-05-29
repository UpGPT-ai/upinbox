/**
 * GET    /api/upinbox/auto-archive?accountId=<uuid>
 *   Returns auto_archive_rules for the given account owned by the current user.
 *
 * POST   /api/upinbox/auto-archive
 *   Body: { accountId, name, criteria, enabled? }
 *   Creates a new auto-archive rule.
 *   criteria shape: { from?:string, subjectContains?:string, olderThanDays?:number, labelId?:string }
 *
 * DELETE /api/upinbox/auto-archive?id=<uuid>&accountId=<uuid>
 *   Deletes the rule by id, verifying account ownership.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

const CriteriaSchema = z.object({
  from: z.string().optional(),
  subjectContains: z.string().optional(),
  olderThanDays: z.number().int().positive().optional(),
  labelId: z.string().optional(),
}).refine(
  (c) => c.from || c.subjectContains || c.olderThanDays || c.labelId,
  { message: 'At least one criterion is required' },
);

const PostBodySchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(120),
  criteria: CriteriaSchema,
  enabled: z.boolean().optional().default(true),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function verifyAccountOwnership(
  supabase: any,
  accountId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();
  return !error && !!data;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

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

  const owned = await verifyAccountOwnership(supabase, accountId, user.id);
  if (!owned) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('auto_archive_rules')
    .select('id, name, criteria, enabled, last_run_at, archived_count, created_at')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[auto-archive] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { accountId, name, criteria, enabled } = parsed.data;

  const supabase = await createServerSupabaseClient();

  const owned = await verifyAccountOwnership(supabase, accountId, user.id);
  if (!owned) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('auto_archive_rules')
    .insert({
      account_id: accountId,
      user_id: user.id,
      name,
      criteria,
      enabled,
      archived_count: 0,
    })
    .select('id, name, criteria, enabled, last_run_at, archived_count, created_at')
    .single();

  if (error) {
    console.error('[auto-archive] POST error:', error);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const accountId = searchParams.get('accountId');

  if (!id || !accountId) {
    return NextResponse.json({ error: 'id and accountId are required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  const owned = await verifyAccountOwnership(supabase, accountId, user.id);
  if (!owned) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { error } = await (supabase as any)
    .schema('upinbox')
    .from('auto_archive_rules')
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[auto-archive] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
