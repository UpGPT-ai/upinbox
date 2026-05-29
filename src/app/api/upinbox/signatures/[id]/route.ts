/**
 * PATCH  /api/upinbox/signatures/[id]  — update a signature
 * DELETE /api/upinbox/signatures/[id]  — delete a signature
 *
 * Body (PATCH): { name?, html?, isDefault?, useOnReply? }
 *
 * Ownership is enforced by joining through the accounts table on user_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Shared: verify signature ownership ──────────────────────────────────────

async function getOwnedSignature(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  signatureId: string,
  userId: string
): Promise<{ id: string; account_id: string } | null> {
  // Join through accounts to enforce user ownership
  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('signatures')
    .select('id, account_id, accounts!inner(user_id)')
    .eq('id', signatureId)
    .eq('accounts.user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

// ─── PATCH: update a signature ────────────────────────────────────────────────

const UpdateSignatureSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  html: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  useOnReply: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const parsed = UpdateSignatureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  const supabase = await createServerSupabaseClient();

  const signature = await getOwnedSignature(supabase, id, user.id);
  if (!signature) {
    return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
  }

  // If promoting to default, demote any existing default for the same account
  if (updates.isDefault === true) {
    await (supabase as any)
      .schema('upinbox')
      .from('signatures')
      .update({ is_default: false })
      .eq('account_id', signature.account_id)
      .neq('id', id);
  }

  // Map camelCase input to snake_case columns
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.html !== undefined) dbUpdates.html = updates.html;
  if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault;
  if (updates.useOnReply !== undefined) dbUpdates.use_on_reply = updates.useOnReply;
  dbUpdates.updated_at = new Date().toISOString();

  const { data: updated, error } = await (supabase as any)
    .schema('upinbox')
    .from('signatures')
    .update(dbUpdates)
    .eq('id', id)
    .select('id, account_id, name, html, is_default, use_on_reply, created_at, updated_at')
    .single();

  if (error) {
    console.error('[signatures] update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signature: updated });
}

// ─── DELETE: remove a signature ───────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();

  const signature = await getOwnedSignature(supabase, id, user.id);
  if (!signature) {
    return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
  }

  const { error } = await (supabase as any)
    .schema('upinbox')
    .from('signatures')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[signatures] delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
