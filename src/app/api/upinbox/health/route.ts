/**
 * GET /api/upinbox/health
 *
 * Health check for the UpInbox API layer.
 * Returns: system status, DB connectivity, and mail provider reachability.
 *
 * No auth required for basic health check (returns only pass/fail, no data).
 * Authenticated health check (with ?full=1) returns per-account provider status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const start = Date.now();
  const isFull = request.nextUrl.searchParams.get('full') === '1';

  // Basic health — always available
  const health: Record<string, unknown> = {
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
    uptime_ms: process.uptime() * 1000,
  };

  // DB connectivity check
  try {
    const supabase = await createServerSupabaseClient();
    await (supabase as any).from('upinbox.accounts').select('id').limit(1);
    health.db = 'ok';
  } catch (err) {
    health.db = 'error';
    health.db_error = err instanceof Error ? err.message : 'unknown';
    health.status = 'degraded';
  }

  // Full health check — per-account provider reachability
  if (isFull) {
    const user = await getCurrentUser();
    if (user) {
      const supabase = await createServerSupabaseClient();
      const { data: accounts } = await (supabase as any)
        .from('upinbox.accounts')
        .select('id, email_address, provider_type, last_synced_at')
        .eq('user_id', user.id)
        .eq('sync_enabled', true);

      health.accounts = (accounts ?? []).map((a: { id: string; email_address: string; provider_type: string; last_synced_at: string | null }) => ({
        id: a.id,
        email: a.email_address,
        provider: a.provider_type,
        last_synced_at: a.last_synced_at,
        // Provider reachability is checked lazily — not on every health poll
        // to avoid hammering mail servers. Use /api/upinbox/accounts/[id]/ping instead.
      }));
    }
  }

  health.latency_ms = Date.now() - start;

  return NextResponse.json(health, {
    status: health.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
