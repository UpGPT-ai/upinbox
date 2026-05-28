/**
 * MCP Token management — single token operations
 *
 * DELETE /api/upinbox/mcp-tokens/[id]  — revoke (soft delete via revoked_at)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Soft-delete: set revoked_at. RLS + user_id check prevents revoking others' tokens.
  const { error } = await supabase
    .schema('upinbox')
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if (error) {
    console.error('[mcp-tokens] revoke error:', error);
    return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
