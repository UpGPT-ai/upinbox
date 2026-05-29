/**
 * PATCH  /api/upinbox/follow-ups/[id]  — update status of a follow-up reminder
 * DELETE /api/upinbox/follow-ups/[id]  — remove a follow-up reminder
 *
 * Ownership enforced via user_id = auth.uid().
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

const UpdateFollowUpSchema = z.object({
  status: z.enum(['pending', 'done', 'dismissed'], {
    errorMap: () => ({ message: "status must be 'pending', 'done', or 'dismissed'" }),
  }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOwnedFollowUp(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  userId: string
) {
  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('follow_ups')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  return { found: !!data && !error };
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateFollowUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const supabase = await createServerSupabaseClient();

  const { found } = await getOwnedFollowUp(supabase, id, user.id);
  if (!found) {
    return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 });
  }

  try {
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('follow_ups')
      .update({
        status: parsed.data.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, account_id, message_id, thread_subject, remind_at, status, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update follow-up', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ followUp: data });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const supabase = await createServerSupabaseClient();

  const { found } = await getOwnedFollowUp(supabase, id, user.id);
  if (!found) {
    return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 });
  }

  try {
    const { error } = await (supabase as any)
      .schema('upinbox')
      .from('follow_ups')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete follow-up', detail: error.message },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
