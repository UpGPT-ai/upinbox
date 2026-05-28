/**
 * Billing API routes for hosted UpInbox.
 *
 * GET  /api/upinbox/billing              — current subscription info
 * POST /api/upinbox/billing/checkout     — create Stripe checkout session
 * POST /api/upinbox/billing/portal       — create Stripe customer portal session
 * POST /api/upinbox/billing/webhook      — Stripe webhook handler
 *
 * Self-hosted license issuance is at /api/upinbox/license
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser, createServiceSupabaseClient } from '@/lib/supabase-server';
import { STRIPE_PRICE_IDS, PRICING } from '@/lib/billing/tiers';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  // Dynamic import to avoid loading Stripe on self-hosted instances without billing
  // In production, use: import Stripe from 'stripe'; const stripe = new Stripe(key)
  return { key }; // Placeholder — real integration uses the stripe npm package
}

// ─── GET: subscription status ─────────────────────────────────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const { data } = await (supabase as any)
    .from('upinbox.subscriptions')
    .select('tier, status, current_period_end, cancel_at_period_end, stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (!data) {
    // No subscription = free tier
    return NextResponse.json({
      tier: 'free',
      status: 'active',
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }

  return NextResponse.json({
    tier: data.tier,
    status: data.status,
    current_period_end: data.current_period_end,
    cancel_at_period_end: data.cancel_at_period_end,
    has_stripe: !!data.stripe_customer_id,
  });
}

// ─── POST: dispatch by action ──────────────────────────────────────────────────

const CheckoutSchema = z.object({
  plan: z.enum(['plus_monthly', 'plus_annual', 'business_monthly', 'business_annual']),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'checkout') return handleCheckout(request);
  if (action === 'portal') return handlePortal(request);
  if (action === 'webhook') return handleWebhook(request);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

async function handleCheckout(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { plan, success_url, cancel_url } = parsed.data;
  const priceId = STRIPE_PRICE_IDS[plan];

  if (!priceId) {
    return NextResponse.json({ error: `Price ID not configured for plan: ${plan}` }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  // In a real implementation, use the Stripe SDK:
  // const session = await stripe.checkout.sessions.create({...})
  // return NextResponse.json({ url: session.url })

  // Placeholder response for open source build:
  return NextResponse.json({
    checkout_url: `https://billing.upinbox.ai/checkout?plan=${plan}&user=${user.id}`,
    plan,
    price_id: priceId,
    success_url: success_url ?? `${appUrl}/inbox?upgrade=success`,
    cancel_url: cancel_url ?? `${appUrl}/settings/billing`,
    note: 'Stripe integration requires STRIPE_SECRET_KEY in .env',
  });
}

async function handlePortal(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

  // Placeholder — real: stripe.billingPortal.sessions.create({customer: stripeCustomerId})
  return NextResponse.json({
    portal_url: `https://billing.upinbox.ai/portal?user=${user.id}`,
    return_url: `${appUrl}/settings/billing`,
    note: 'Stripe integration requires STRIPE_SECRET_KEY in .env',
  });
}

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

  // In production:
  // const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  // switch (event.type) { case 'checkout.session.completed': ... }

  // For self-hosted / open source: parse and handle manually
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = event.type as string;
  const supabase = createServiceSupabaseClient();

  if (eventType === 'checkout.session.completed') {
    const session = event.data as Record<string, unknown>;
    const metadata = session.metadata as Record<string, string> | undefined;
    const userId = metadata?.user_id;
    const plan = metadata?.plan;

    if (userId && plan) {
      const tier = plan.startsWith('business') ? 'business' : 'plus';
      await (supabase as any).from('upinbox.subscriptions').upsert({
        user_id: userId,
        tier,
        status: 'active',
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        current_period_end: null,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }
  }

  if (eventType === 'customer.subscription.deleted') {
    const sub = (event.data as Record<string, unknown>);
    const customerId = sub.customer as string;

    if (customerId) {
      await (supabase as any).from('upinbox.subscriptions')
        .update({ tier: 'free', status: 'canceled' })
        .eq('stripe_customer_id', customerId);
    }
  }

  return NextResponse.json({ received: true });
}
