/**
 * Self-host License API
 *
 * POST /api/upinbox/license/issue    — issue a license JWT (admin only, Stripe-gated)
 * POST /api/upinbox/license/verify   — verify a license JWT (self-hosted instances call this)
 * GET  /api/upinbox/license/info     — decode license JWT without verification (for display)
 *
 * The license JWT is domain-bound. Self-hosted instances verify it:
 *   1. JWT signature valid (HMAC-SHA256 with license signing key)
 *   2. instanceDomain matches the instance's INSTANCE_DOMAIN env var
 *   3. Not expired
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient, verifyServiceAuth } from '@/lib/supabase-server';
import { issueLicenseJwt, verifyLicenseJwt, decodeLicenseJwtUnsafe } from '@/lib/billing/license-jwt';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action') ?? 'info';

  if (action === 'info') {
    const jwt = request.nextUrl.searchParams.get('jwt');
    if (!jwt) return NextResponse.json({ error: 'jwt is required' }, { status: 400 });

    const payload = decodeLicenseJwtUnsafe(jwt);
    if (!payload) return NextResponse.json({ error: 'Invalid JWT format' }, { status: 400 });

    // Return decoded payload without sensitive fields
    return NextResponse.json({
      licenseId: payload.licenseId,
      tier: payload.tier,
      maxUsers: payload.maxUsers,
      features: payload.features,
      instanceDomain: payload.instanceDomain,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      orgName: payload.orgName,
      isExpired: new Date(payload.expiresAt) < new Date(),
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action') ?? 'verify';

  if (action === 'issue') return handleIssue(request);
  if (action === 'verify') return handleVerify(request);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ─── POST issue (admin only) ──────────────────────────────────────────────────

const IssueSchema = z.object({
  tier: z.enum(['community', 'business', 'enterprise']),
  maxUsers: z.number().int().min(1).default(999999),
  instanceDomain: z.string().min(1),
  orgName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  stripePaymentId: z.string().optional(), // for audit trail
  expiresInDays: z.number().int().min(1).max(730).default(365),
});

async function handleIssue(request: NextRequest) {
  // Service role auth — only callable by internal admin tools
  if (!verifyServiceAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = IssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { tier, maxUsers, instanceDomain, orgName, contactEmail, stripePaymentId, expiresInDays } = parsed.data;

  const TIER_FEATURES: Record<string, string[]> = {
    community: ['byok', 'mcp', 'usx', 'screener'],
    business:  ['byok', 'mcp', 'usx', 'screener', 'intelligence-api', 'custom-domain', 'teams'],
    enterprise: ['byok', 'mcp', 'usx', 'screener', 'intelligence-api', 'custom-domain', 'teams', 'sso', 'scim', 'sla'],
  };

  const jwt = await issueLicenseJwt(
    {
      tier,
      maxUsers,
      features: TIER_FEATURES[tier],
      instanceDomain,
      orgName,
      contactEmail,
    },
    expiresInDays
  );

  // Log to DB for audit trail
  const supabase = createServiceSupabaseClient();
  await (supabase as any).from('upinbox.issued_licenses').insert({
    tier,
    max_users: maxUsers,
    instance_domain: instanceDomain,
    org_name: orgName,
    contact_email: contactEmail,
    stripe_payment_id: stripePaymentId,
    expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
    issued_at: new Date().toISOString(),
  });

  return NextResponse.json({ jwt, tier, instanceDomain, expiresInDays }, { status: 201 });
}

// ─── POST verify ──────────────────────────────────────────────────────────────

const VerifySchema = z.object({
  jwt: z.string().min(1),
  instanceDomain: z.string().optional(),
});

async function handleVerify(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }

  const { jwt, instanceDomain } = parsed.data;
  const payload = await verifyLicenseJwt(jwt, instanceDomain);

  if (!payload) {
    return NextResponse.json(
      { valid: false, error: 'Invalid, expired, or domain-mismatched license' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    valid: true,
    tier: payload.tier,
    maxUsers: payload.maxUsers,
    features: payload.features,
    instanceDomain: payload.instanceDomain,
    expiresAt: payload.expiresAt,
    orgName: payload.orgName,
  });
}
