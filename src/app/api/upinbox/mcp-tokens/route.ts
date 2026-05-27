/**
 * MCP Tokens API
 *
 * GET  /api/upinbox/mcp-tokens          — list tokens (never returns plaintext)
 * POST /api/upinbox/mcp-tokens          — create token (returns plaintext ONCE)
 *
 * Token format: upinbox_mcp_{32 random bytes as base64url}
 * Storage: SHA-256 hash only. Plaintext is never stored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { z } from 'zod';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET — list tokens ────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: tokens, error } = await supabase
    .schema('upinbox')
    .from('mcp_tokens')
    .select('id, description, scopes, last_used_at, expires_at, created_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[mcp-tokens] list error:', error);
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
  }

  return NextResponse.json({ tokens: tokens ?? [] });
}

// ─── POST — create token ──────────────────────────────────────────────────────

const CreateSchema = z.object({
  description: z.string().max(200).optional(),
  scopes: z.array(z.enum(['read', 'write', 'delete'])).min(1),
  expiresInDays: z.number().int().min(1).max(730).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { description, scopes, expiresInDays } = parsed.data;

  // Generate token: upinbox_mcp_ + 32 random bytes as base64url
  const rawBytes = crypto.randomBytes(32);
  const plaintext = `upinbox_mcp_${rawBytes.toString('base64url')}`;

  // Store only the SHA-256 hash
  const tokenHash = crypto.createHash('sha256').update(plaintext).digest('hex');

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: record, error: insertError } = await supabase
    .schema('upinbox')
    .from('mcp_tokens')
    .insert({
      user_id: user.id,
      token_hash: tokenHash,
      description: description ?? null,
      scopes,
      expires_at: expiresAt,
    })
    .select('id, description, scopes, last_used_at, expires_at, created_at')
    .single();

  if (insertError || !record) {
    console.error('[mcp-tokens] create error:', insertError);
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 });
  }

  // Return plaintext ONCE — never stored, never retrievable again
  return NextResponse.json({ token: plaintext, record }, { status: 201 });
}
