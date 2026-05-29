/**
 * GET  /api/upinbox/saved-searches        — list caller's saved searches
 * POST /api/upinbox/saved-searches        — create a saved search
 *
 * Table: upinbox.saved_searches
 *   id          uuid PK  default gen_random_uuid()
 *   user_id     uuid NOT NULL  — auth.uid()
 *   name        text NOT NULL
 *   query       text NOT NULL
 *   sort_order  text NOT NULL  default 'newest'  — 'newest'|'oldest'|'unread'
 *   created_at  timestamptz NOT NULL default now()
 *   updated_at  timestamptz NOT NULL default now()
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateSavedSearchSchema = z.object({
  name: z.string().min(1, { message: 'name is required' }).max(255),
  query: z.string().min(1, { message: 'query is required' }),
  sortOrder: z.enum(['newest', 'oldest', 'unread']).optional().default('newest'),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('saved_searches')
      .select('id, name, query, sort_order, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch saved searches', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ savedSearches: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSavedSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { name, query, sortOrder } = parsed.data;

  const supabase = await createServerSupabaseClient();

  try {
    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('saved_searches')
      .insert({
        user_id: user.id,
        name,
        query,
        sort_order: sortOrder,
      })
      .select('id, name, query, sort_order, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create saved search', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ savedSearch: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
