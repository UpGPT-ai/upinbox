/**
 * GET  /api/upinbox/screener/rules   — list screener rules for current user
 * POST /api/upinbox/screener/rules   — create/update/reorder rules
 * GET  /api/upinbox/screener/feed    — get emails for a specific feed
 * POST /api/upinbox/screener/process — apply screener to a batch of emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { DEFAULT_SCREENER_RULES, evaluateScreenerRules } from '@/lib/screener/rules';
import { getMailProvider } from '@/lib/mail/providers';
import type { ScreenerRule, ScreenerAction } from '@/lib/screener/rules';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = request.nextUrl.searchParams.get('action') ?? 'rules';

  if (action === 'rules') return getRules(user.id);
  if (action === 'feed') return getFeed(request, user.id);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const action = request.nextUrl.searchParams.get('action') ?? 'process';

  if (action === 'rules') return upsertRules(request, user.id);
  if (action === 'process') return processEmailBatch(request, user.id);
  if (action === 'seed-defaults') return seedDefaultRules(user.id);

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ─── GET rules ───────────────────────────────────────────────────────────────

async function getRules(userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: rules, error } = await (supabase as any)
    .from('upinbox.screener_rules')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Seed defaults if user has no rules yet
  if (!rules || rules.length === 0) {
    await seedDefaultRulesInternal(userId);
    const { data: seeded } = await (supabase as any)
      .from('upinbox.screener_rules')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: true });
    return NextResponse.json({ rules: seeded ?? [] });
  }

  return NextResponse.json({ rules });
}

// ─── GET feed ─────────────────────────────────────────────────────────────────

async function getFeed(request: NextRequest, userId: string) {
  const accountId = request.nextUrl.searchParams.get('accountId');
  const feedType = request.nextUrl.searchParams.get('feed'); // 'news' | 'promos' | 'receipts' | 'social'
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '50'), 200);

  if (!accountId || !feedType) {
    return NextResponse.json({ error: 'accountId and feed are required' }, { status: 400 });
  }

  const FEED_TO_CATEGORIES: Record<string, string[]> = {
    news: ['NEWSLETTER'],
    promos: ['PROMOTION'],
    receipts: ['RECEIPT'],
    social: ['SOCIAL'],
    archive: ['AUTOMATED', 'EXPIRED'],
  };

  const categories = FEED_TO_CATEGORIES[feedType];
  if (!categories) {
    return NextResponse.json({ error: `Unknown feed type: ${feedType}` }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // Fetch triage results for this account with matching categories
  type TriageRow = { email_id: string; category: string; confidence: number; classified_at: string };
  const { data: triageResults } = await (supabase as any)
    .from('upinbox.triage_results')
    .select('email_id, category, confidence, classified_at')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .in('category', categories)
    .order('classified_at', { ascending: false })
    .limit(limit) as { data: TriageRow[] | null };

  if (!triageResults || triageResults.length === 0) {
    return NextResponse.json({ emails: [], total: 0 });
  }

  // Fetch the actual emails from the provider
  const { data: account } = await (supabase as any)
    .from('upinbox.accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const emailIds = triageResults.map((r) => r.email_id);

  try {
    const provider = await getMailProvider(account);
    const emails = await provider.getEmails(
      emailIds,
      ['id', 'threadId', 'from', 'subject', 'receivedAt', 'keywords', 'hasAttachment', 'preview']
    );

    // Attach triage category to each email
    const triageMap = new Map(triageResults.map((r) => [r.email_id, r]));
    const enriched = emails.map((email) => ({
      ...email,
      _triage: triageMap.get(email.id) ?? null,
    }));

    return NextResponse.json({ emails: enriched, total: enriched.length });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch emails', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 502 }
    );
  }
}

// ─── POST process email batch ─────────────────────────────────────────────────

const ProcessSchema = z.object({
  accountId: z.string().uuid(),
  emailIds: z.array(z.string()).min(1).max(100),
  // Optional BYOK config — flows through, not stored
  byokProvider: z.enum(['anthropic', 'openai', 'google']).optional(),
  byokApiKey: z.string().optional(),
  byokModel: z.string().optional(),
  useUplink: z.boolean().optional(),
  uplinkEndpoint: z.string().url().optional(),
  licenseJwt: z.string().optional(),
  instanceDomain: z.string().optional(),
});

async function processEmailBatch(request: NextRequest, userId: string) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = ProcessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { accountId, emailIds } = parsed.data;

  const supabase = await createServerSupabaseClient();

  // Verify account
  const { data: account } = await (supabase as any)
    .from('upinbox.accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Load screener rules
  const { data: rules } = await (supabase as any)
    .from('upinbox.screener_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
    .order('priority', { ascending: true });

  // Fetch triage results for these emails (classified separately)
  type TriageRow2 = { email_id: string; category: string; confidence: number; signals: unknown };
  const { data: triageResults } = await (supabase as any)
    .from('upinbox.triage_results')
    .select('email_id, category, confidence, signals')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .in('email_id', emailIds) as { data: TriageRow2[] | null };

  const triageMap = new Map(
    (triageResults ?? []).map((r: TriageRow2) => [r.email_id, r])
  );

  // Apply screener rules to each email
  const results: Array<{
    emailId: string;
    action: ScreenerAction;
    ruleId: string | null;
    category: string | null;
    confidence: number | null;
  }> = [];

  for (const emailId of emailIds) {
    const triage = triageMap.get(emailId);
    const { action, matchedRule } = evaluateScreenerRules(rules ?? [], {
      category: triage?.category,
      confidence: triage?.confidence,
    });

    results.push({
      emailId,
      action,
      ruleId: matchedRule?.id ?? null,
      category: triage?.category ?? null,
      confidence: triage?.confidence ?? null,
    });
  }

  // Store screener decisions in DB
  if (results.length > 0) {
    await (supabase as any).from('upinbox.screener_decisions').upsert(
      results.map((r) => ({
        user_id: userId,
        account_id: accountId,
        email_id: r.emailId,
        action: r.action,
        rule_id: r.ruleId,
        decided_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,account_id,email_id' }
    );
  }

  return NextResponse.json({ results, processed: results.length });
}

// ─── POST seed defaults ───────────────────────────────────────────────────────

async function seedDefaultRules(userId: string) {
  await seedDefaultRulesInternal(userId);
  return NextResponse.json({ ok: true, seeded: DEFAULT_SCREENER_RULES.length });
}

async function seedDefaultRulesInternal(userId: string) {
  const supabase = await createServerSupabaseClient();
  await (supabase as any).from('upinbox.screener_rules').insert(
    DEFAULT_SCREENER_RULES.map((rule) => ({
      ...rule,
      user_id: userId,
      trigger: rule.trigger as Record<string, unknown>,
    }))
  );
}

// ─── POST upsert rules ────────────────────────────────────────────────────────

const UpsertRuleSchema = z.object({
  rules: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    priority: z.number().int().min(0),
    enabled: z.boolean(),
    trigger: z.record(z.unknown()),
    action: z.string(),
  })),
});

async function upsertRules(request: NextRequest, userId: string) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = UpsertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = await createServerSupabaseClient();
  const { rules } = parsed.data;

  const upsertData = rules.map((r) => ({
    ...r,
    user_id: userId,
    id: r.id ?? crypto.randomUUID(),
  }));

  const { data, error } = await (supabase as any)
    .from('upinbox.screener_rules')
    .upsert(upsertData, { onConflict: 'id' })
    .select('*');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data });
}
