/**
 * GET  /api/upinbox/mailbox-order
 *   → { order: Record<accountId, mailboxId[]> }
 *
 * PATCH /api/upinbox/mailbox-order
 *   Body: { accountId: string; orderedIds: string[] }
 *   → { ok: true }
 *
 * Mailbox order is stored in auth.user_metadata under the key
 * `upinboxMailboxOrder` — a map of accountId → ordered mailbox ID array.
 * Using user_metadata keeps the order private, cross-device, and migration-free.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const order: Record<string, string[]> =
    (user.user_metadata?.upinboxMailboxOrder as Record<string, string[]>) ?? {};

  return NextResponse.json({ order });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId, orderedIds } = await req.json() as {
    accountId?: string;
    orderedIds?: string[];
  };

  if (!accountId || !Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'accountId and orderedIds required' }, { status: 400 });
  }

  // Merge new order for this account into existing order map
  const existing: Record<string, string[]> =
    (user.user_metadata?.upinboxMailboxOrder as Record<string, string[]>) ?? {};

  const updated = { ...existing, [accountId]: orderedIds };

  // Must use service role to update user_metadata server-side
  const adminClient = createServiceSupabaseClient();
  const { error } = await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      upinboxMailboxOrder: updated,
    },
  });

  if (error) {
    console.error('[mailbox-order PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
