/**
 * Billing API routes for hosted UpInbox.
 *
 * GET  /api/upinbox/billing              — current UpGPT capability-based billing info
 * POST /api/upinbox/billing/checkout     — redirect to UpGPT checkout
 * POST /api/upinbox/billing/portal       — redirect to UpGPT billing portal
 * POST /api/upinbox/billing/webhook      — Stripe webhook handler (legacy bridge)
 *
 * Self-hosted license issuance is at /api/upinbox/license
 *
 * NOTE: UpInbox does NOT have its own tiers. All entitlement lives on UpGPT.ai
 * as a capability set. This route surfaces those capabilities so the UI can
 * render the correct state without reasoning about plan strings locally.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { getAuthContext } from '@/lib/billing/upinbox-entitlement';
import { CAPABILITY, getMaxAccounts } from '@/lib/billing/capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPGPT_SUBSCRIBE_URL = 'https://upgpt.ai/account/subscribe';
const UPGPT_MANAGE_URL = 'https://upgpt.ai/account/billing';

// ─── GET: UpGPT capability-based billing info ─────────────────────────────────

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext(request);

  if (!ctx) {
    return NextResponse.json({
      authenticated: false,
      capabilities: [],
      plan: null,
      subscribeUrl: UPGPT_SUBSCRIBE_URL,
      manageUrl: UPGPT_MANAGE_URL,
      hasEmail: false,
      hasMcp: false,
      hasByok: false,
      accountsConnected: 0,
      accountsLimit: 0,
    });
  }

  const capabilities = ctx.license?.capabilities ?? [];
  const plan = ctx.license?.plan ?? null;

  // Count connected email accounts for this user.
  const supabase = await createServerSupabaseClient();
  const { count } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId);

  const accountsConnected = typeof count === 'number' ? count : 0;
  const accountsLimit = getMaxAccounts(capabilities);

  return NextResponse.json({
    authenticated: true,
    capabilities,
    plan,
    subscribeUrl: UPGPT_SUBSCRIBE_URL,
    manageUrl: UPGPT_MANAGE_URL,
    hasEmail: capabilities.includes(CAPABILITY.EMAIL),
    hasMcp: capabilities.includes(CAPABILITY.MCP),
    hasByok: capabilities.includes(CAPABILITY.BYOK),
    accountsConnected,
    accountsLimit,
  });
}

// ─── POST: dispatch by action ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'checkout') return handleCheckout(request);
  if (action === 'portal') return handlePortal(request);
  if (action === 'webhook') return handleWebhook(request);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

/**
 * Checkout is handled on UpGPT.ai. We never run a local checkout flow because
 * UpInbox does not sell anything directly — capabilities are purchased from
 * the UpGPT account page.
 */
async function handleCheckout(request: NextRequest) {
  const ctx = await getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    redirectUrl: UPGPT_SUBSCRIBE_URL,
    message: 'UpInbox capabilities are purchased on UpGPT.ai.',
  });
}

/**
 * Billing management lives on UpGPT.ai. We forward the user there rather than
 * running a local Stripe customer portal session, because the customer record
 * is owned by UpGPT, not UpInbox.
 */
async function handlePortal(request: NextRequest) {
  const ctx = await getAuthContext(request);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    redirectUrl: UPGPT_MANAGE_URL,
    message: 'Manage your UpGPT subscription on UpGPT.ai.',
  });
}

/**
 * Legacy webhook bridge — kept so existing Stripe events do not 404 during the
 * UpGPT migration. New capability changes should be delivered by the UpGPT.ai
 * entitlement webhook at /api/webhooks/upgpt, not here.
 */
async function handleWebhook(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const body = await request.text();

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = event.type as string;
  const supabase = createServiceSupabaseClient();

  // Best-effort acknowledgement so Stripe stops retrying. Capability state is
  // authoritative on UpGPT.ai, so we do not mutate any local entitlement here.
  if (
    eventType === 'checkout.session.completed' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'customer.subscription.deleted'
  ) {
    const session = (event.data as Record<string, unknown>) ?? {};
    const customerId = session.customer as string | undefined;

    if (customerId) {
      await (supabase as any)
        .schema('upinbox')
        .from('billing_events')
        .insert({
          event_type: eventType,
          stripe_customer_id: customerId,
          payload: event,
          received_at: new Date().toISOString(),
        })
        .then(() => undefined, () => undefined);
    }
  }

  return NextResponse.json({ received: true });
}
