/**
 * POST /api/upinbox/triage
 *
 * Classifies an email using the Intelligence Router.
 * Stores the result in upinbox.triage_results.
 *
 * Body:
 *   accountId  — required
 *   emailId    — required
 *   subject    — email subject (for heuristic + BYOK classification)
 *   fromEmail  — sender address (for heuristic classification)
 *   bodyText   — plain text excerpt, max 1000 chars (for heuristic)
 *   bodyExcerpt — plain text excerpt, max 800 chars (for BYOK/AI)
 *   headers    — email headers (for list-unsubscribe detection)
 *
 *   # BYOK fields — key flows through, never stored
 *   byokProvider   — 'anthropic' | 'openai' | 'google'
 *   byokApiKey     — user's API key (server logs suppressed for this field)
 *   byokModel      — optional model override
 *
 *   # UpLink fields
 *   useUplink       — boolean
 *   uplinkEndpoint  — default 'http://localhost:11434'
 *   uplinkModel     — optional
 *
 *   # Intelligence API (self-hosted)
 *   licenseJwt     — JWT from self-host license purchase
 *   instanceDomain — the self-hosted domain (validated against JWT)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { classifyEmailWithRouter } from '@/lib/intelligence/router';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TriageRequestSchema = z.object({
  accountId: z.string().uuid(),
  emailId: z.string().min(1),
  subject: z.string().optional(),
  fromEmail: z.string().optional(),
  bodyText: z.string().max(1000).optional(),
  bodyExcerpt: z.string().max(800).optional(),
  headers: z.record(z.string()).optional(),
  // BYOK
  byokProvider: z.enum(['anthropic', 'openai', 'google']).optional(),
  byokApiKey: z.string().optional(),
  byokModel: z.string().optional(),
  // UpLink
  useUplink: z.boolean().optional(),
  uplinkEndpoint: z.string().url().optional(),
  uplinkModel: z.string().optional(),
  // Intelligence API (self-hosted)
  licenseJwt: z.string().optional(),
  instanceDomain: z.string().optional(),
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

  const parsed = TriageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Verify account ownership
  const supabase = await createServerSupabaseClient();
  const { data: account, error: accountError } = await (supabase as any)
    .schema('upinbox').from('accounts')
    .select('id')
    .eq('id', data.accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Check for cached result (triage results are stable — email content doesn't change)
  const { data: cached } = await (supabase as any)
    .schema('upinbox').from('triage_results')
    .select('*')
    .eq('account_id', data.accountId)
    .eq('email_id', data.emailId)
    .single();

  if (cached) {
    return NextResponse.json({ result: cached, cached: true });
  }

  // Build router config from request — BYOK key flows through, never stored
  const routerConfig = {
    byok: data.byokProvider && data.byokApiKey
      ? {
          provider: data.byokProvider,
          apiKey: data.byokApiKey,  // not logged, not stored
          model: data.byokModel ?? '',
        }
      : undefined,
    uplink: data.useUplink
      ? {
          endpoint: data.uplinkEndpoint ?? 'http://localhost:11434',
          model: data.uplinkModel,
        }
      : undefined,
    intelligenceApi: data.licenseJwt && data.instanceDomain
      ? {
          licenseJwt: data.licenseJwt,
          instanceDomain: data.instanceDomain,
        }
      : undefined,
  };

  // Classify
  const result = await classifyEmailWithRouter(
    {
      accountId: data.accountId,
      emailId: data.emailId,
      subject: data.subject,
      fromEmail: data.fromEmail,
      bodyText: data.bodyText,
      bodyExcerpt: data.bodyExcerpt,
      headers: data.headers,
    },
    routerConfig
  );

  // Store result
  const { data: saved, error: saveError } = await (supabase as any)
    .schema('upinbox').from('triage_results')
    .insert({
      user_id: user.id,
      account_id: data.accountId,
      email_id: data.emailId,
      category: result.category,
      confidence: result.confidence,
      signals: result.signals,
      classifier_version: result.classifierVersion,
      classified_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (saveError) {
    // Return the result even if we can't cache it
    return NextResponse.json({ result, cached: false });
  }

  return NextResponse.json({ result: saved, cached: false });
}
