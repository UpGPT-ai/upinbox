/**
 * GET /api/upinbox/health
 *
 * Health check for the UpInbox API layer.
 * Returns: server identity, subsystem status, capabilities, and build metadata.
 *
 * Always returns HTTP 200 — operational tools should inspect the `subsystems`
 * map for per-component status rather than relying on the HTTP status code.
 *
 * No auth required for basic health check (returns only status, no user data).
 * Authenticated health check (with ?full=1) returns per-account provider status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVER_VERSION = '1.0.0';
const SERVER_NAME = 'UpInbox';

const CAPABILITIES = [
  'email',
  'mcp',
  'byok',
  'tracker-stripper',
  'snooze',
  'send-later',
  'follow-ups',
  'health-score',
  'auto-archive',
  'deep-clean',
] as const;

type DbStatus = 'ok' | 'degraded' | 'down';
type CronStatus = 'ok' | 'unknown';
type PushStatus = 'ok' | 'not-configured';

/**
 * Probe the database with a lightweight query, bounded by a 2s timeout.
 * Returns:
 *   - 'ok'       — query completed successfully
 *   - 'degraded' — query returned an error (auth, RLS, transient)
 *   - 'down'     — connection failed or timed out
 */
async function checkDatabase(): Promise<DbStatus> {
  const TIMEOUT_MS = 2000;
  try {
    const supabase = await createServerSupabaseClient();
    const probe = (async () => {
      // Lightweight existence probe — `SELECT id ... LIMIT 1` is the
      // PostgREST equivalent of `SELECT 1`.
      const { error } = await (supabase as any)
        .schema('upinbox')
        .from('accounts')
        .select('id')
        .limit(1);
      return error;
    })();

    const timeout = new Promise<'__timeout__'>((resolve) =>
      setTimeout(() => resolve('__timeout__'), TIMEOUT_MS)
    );

    const result = await Promise.race([probe, timeout]);
    if (result === '__timeout__') return 'down';
    if (result) return 'degraded';
    return 'ok';
  } catch {
    return 'down';
  }
}

/**
 * Cron health is reported by the cron runner itself (heartbeat table).
 * Without that wiring, we report 'unknown' rather than guessing.
 */
function checkCron(): CronStatus {
  // Placeholder: when a cron heartbeat table/env signal exists, read it here.
  return 'unknown';
}

/**
 * Web push is opt-in. We report 'ok' iff a VAPID public key is configured.
 */
function checkPush(): PushStatus {
  return process.env.VAPID_PUBLIC_KEY ? 'ok' : 'not-configured';
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const isFull = request.nextUrl.searchParams.get('full') === '1';

  const [database, cron, push] = [
    await checkDatabase(),
    checkCron(),
    checkPush(),
  ];

  const subsystems = { database, cron, push };

  const build: { commit?: string; builtAt?: string } = {};
  const commit =
    process.env.GIT_COMMIT ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_COMMIT;
  const builtAt = process.env.BUILD_TIME ?? process.env.NEXT_PUBLIC_BUILT_AT;
  if (commit) build.commit = commit;
  if (builtAt) build.builtAt = builtAt;

  const ok = database !== 'down';

  const health: Record<string, unknown> = {
    ok,
    serverVersion: SERVER_VERSION,
    serverName: SERVER_NAME,
    timestamp: new Date().toISOString(),
    subsystems,
    capabilities: [...CAPABILITIES],
    build,
  };

  // Full health check — per-account provider reachability (authenticated)
  if (isFull) {
    const user = await getCurrentUser();
    if (user) {
      try {
        const supabase = await createServerSupabaseClient();
        const { data: accounts } = await (supabase as any)
          .schema('upinbox')
          .from('accounts')
          .select('id, email_address, provider_type, last_synced_at')
          .eq('user_id', user.id)
          .eq('sync_enabled', true);

        health.accounts = (accounts ?? []).map(
          (a: {
            id: string;
            email_address: string;
            provider_type: string;
            last_synced_at: string | null;
          }) => ({
            id: a.id,
            email: a.email_address,
            provider: a.provider_type,
            last_synced_at: a.last_synced_at,
            // Provider reachability is checked lazily — not on every health poll
            // to avoid hammering mail servers. Use /api/upinbox/accounts/[id]/ping instead.
          })
        );
      } catch {
        // Swallow — `subsystems.database` already reflects DB state.
        health.accounts = [];
      }
    }
  }

  health.latency_ms = Date.now() - start;

  // Always 200 — operational tools inspect `subsystems` for component status.
  return NextResponse.json(health, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
