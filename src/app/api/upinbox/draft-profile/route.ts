/**
 * GET  /api/upinbox/draft-profile
 *   Returns the authenticated user's draft-assist profile from
 *   upinbox.draft_profiles (null fields = profile not yet created).
 *
 * POST /api/upinbox/draft-profile
 *   Body: { fullName?, role?, company?, tone?, extraContext? }
 *   Upserts the profile using ON CONFLICT(user_id) DO UPDATE so callers
 *   can send partial payloads to update only the fields they care about.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('draft_profiles')
    .select('full_name, role, company, tone, extra_context, updated_at')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows; profile simply does not exist yet
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data ?? null });
}

// ─── POST ────────────────────────────────────────────────────────────────────

const PostSchema = z.object({
  fullName:     z.string().max(120).optional(),
  role:         z.string().max(120).optional(),
  company:      z.string().max(200).optional(),
  tone:         z.enum(['professional', 'friendly', 'concise', 'formal', 'casual']).optional(),
  extraContext: z.string().max(2000).optional(),
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

  const { fullName, role, company, tone, extraContext } = parsed.data;

  // Build only the columns that were explicitly provided so a partial update
  // does not overwrite unrelated fields with undefined.
  const columns: Record<string, unknown> = {
    user_id:    user.id,
    updated_at: new Date().toISOString(),
  };
  if (fullName     !== undefined) columns.full_name     = fullName;
  if (role         !== undefined) columns.role          = role;
  if (company      !== undefined) columns.company       = company;
  if (tone         !== undefined) columns.tone          = tone;
  if (extraContext !== undefined) columns.extra_context = extraContext;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('draft_profiles')
    .upsert(columns, { onConflict: 'user_id' })
    .select('full_name, role, company, tone, extra_context, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data });
}
