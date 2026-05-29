/**
 * PATCH  /api/upinbox/saved-searches/[id]  — update a saved search
 * DELETE /api/upinbox/saved-searches/[id]  — remove a saved search
 *
 * Ownership enforced via user_id = auth.uid().
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

const UpdateSavedSearchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  query: z.string().min(1).optional(),
  sortOrder: z.enum(['newest', 'oldest', 'unread']).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOwnedSearch(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  userId: string
) {
  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('saved_searches')
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

  const parsed = UpdateSavedSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const supabase = await createServerSupabaseClient();

  const { found } = await getOwnedSearch(supabase, id, user.id);
  if (!found) {
    return NextResponse.json({ error: 'Saved search not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.query !== undefined) updates.query = parsed.data.query;
  if (parsed.data.sortOrder !== undefined) updates.sort_order = parsed.data.sortOrder;

  try {
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('saved_searches')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, query, sort_order, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update saved search', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ savedSearch: data });
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

  const { found } = await getOwnedSearch(supabase, id, user.id);
  if (!found) {
    return NextResponse.json({ error: 'Saved search not found' }, { status: 404 });
  }

  try {
    const { error } = await (supabase as any)
      .schema('upinbox')
      .from('saved_searches')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to delete saved search', detail: error.message },
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
