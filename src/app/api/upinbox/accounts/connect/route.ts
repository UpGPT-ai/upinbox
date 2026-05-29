/**
 * POST /api/upinbox/accounts/connect
 *
 * Pre-flight check called by the connect-account wizard BEFORE it kicks off the
 * OAuth flow (or shows the IMAP/JMAP credentials form).
 *
 * Purpose:
 *   1. Gate on the EMAIL capability — no point opening a Google/Microsoft OAuth
 *      consent screen if the user isn't entitled to use UpInbox at all.
 *   2. Gate on the per-plan account-count limit — a user on the base EMAIL
 *      capability gets 1 account; MULTI_ACCOUNT or TEAM gets unlimited.
 *
 * On success returns `{ ok: true, allowed: true }` and the client proceeds to
 * the OAuth/credentials step. The actual account row is created by the existing
 * POST /api/upinbox/accounts route once the wizard finishes.
 *
 * On failure returns the structured `EntitlementResult` (or an equivalent
 * 402 with upgrade hint when the account cap is reached), letting the wizard
 * render the right upsell card without an extra round-trip.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEmailEntitlement } from '@/lib/billing/upinbox-entitlement';
import { getMaxAccounts, getAccountUpgradeMessage, CAPABILITY } from '@/lib/billing/capabilities';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 1. Capability gate — caller must have the EMAIL capability.
  const result = await requireEmailEntitlement(request);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 403 });
  }

  const ctx = result.ctx;
  const userId = ctx?.userId;
  if (!userId) {
    // Defensive — requireEmailEntitlement should always populate ctx on ok:true.
    return NextResponse.json(
      { ok: false, error: 'Authentication context missing' },
      { status: 401 }
    );
  }

  // 2. Account-count gate — count this user's existing accounts and compare
  //    against the per-plan max derived from their capabilities.
  const capabilities = ctx?.license?.capabilities ?? [];
  const maxAccounts = getMaxAccounts(capabilities);

  const supabase = await createServerSupabaseClient();
  const { count, error: countErr } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countErr) {
    return NextResponse.json(
      { ok: false, error: countErr.message },
      { status: 500 }
    );
  }

  const currentCount = count ?? 0;

  if (currentCount >= maxAccounts) {
    return NextResponse.json(
      {
        ok: false,
        allowed: false,
        error: getAccountUpgradeMessage(capabilities) ?? 'Account limit reached',
        currentCount,
        maxAccounts,
        upgrade: {
          url: 'https://upgpt.ai/account/subscribe?capability=multi_account',
          label: 'Add multi-account capability',
          description:
            'Connect more inboxes by adding the multi-account capability to your UpGPT subscription.',
          capability: CAPABILITY.MULTI_ACCOUNT,
        },
      },
      { status: 402 }
    );
  }

  // 3. All clear — wizard can proceed to OAuth / credential entry.
  return NextResponse.json({
    ok: true,
    allowed: true,
    currentCount,
    maxAccounts,
  });
}
