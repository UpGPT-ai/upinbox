/**
 * POST /api/upinbox/auto-archive/run?accountId=<uuid>
 *
 * Executes all enabled auto-archive rules for the given account.
 * For each rule, queries the mail provider for matching emails then
 * moves them to the Archive mailbox.
 *
 * Returns: { archived: number, rulesRun: number }
 *
 * Intentionally capped at 200 emails per rule per run to avoid
 * runaway batch operations. Run again to process more.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';
import type { UpInboxAccount } from '@/lib/mail/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Max emails archived per rule per run — guards against runaway batches.
const MAX_PER_RULE = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuleCriteria {
  from?: string;
  subjectContains?: string;
  olderThanDays?: number;
  labelId?: string;
}

interface AutoArchiveRule {
  id: string;
  name: string;
  criteria: RuleCriteria;
  enabled: boolean;
  archived_count: number;
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // ── Verify account ownership and load credentials ──────────────────────────
  const { data: account, error: accountError } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select(
      'id, email_address, provider_type, encrypted_credentials, jmap_session_url, display_name',
    )
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // ── Fetch enabled rules ────────────────────────────────────────────────────
  const { data: rules, error: rulesError } = await (supabase as any)
    .schema('upinbox')
    .from('auto_archive_rules')
    .select('id, name, criteria, enabled, archived_count')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .eq('enabled', true);

  if (rulesError) {
    console.error('[auto-archive/run] fetch rules error:', rulesError);
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ archived: 0, rulesRun: 0 });
  }

  // ── Resolve archive mailbox via provider ───────────────────────────────────
  let provider: Awaited<ReturnType<typeof getMailProvider>>;
  try {
    provider = await getMailProvider(account as UpInboxAccount);
  } catch (err) {
    console.error('[auto-archive/run] getMailProvider error:', err);
    return NextResponse.json({ error: 'Failed to connect to mail provider' }, { status: 502 });
  }

  const mailboxes = await provider.listMailboxes();
  const archiveMailbox = mailboxes.find((mb) => mb.role === 'archive');
  if (!archiveMailbox) {
    return NextResponse.json(
      { error: 'No archive mailbox found for this account' },
      { status: 422 },
    );
  }

  const archiveMailboxId = archiveMailbox.id;

  // ── Execute rules ──────────────────────────────────────────────────────────
  let totalArchived = 0;
  let rulesRun = 0;
  const now = new Date();

  for (const rule of rules as AutoArchiveRule[]) {
    const { criteria } = rule;
    let ruleArchived = 0;

    try {
      // Build query options from rule criteria
      const queryOpts: Parameters<typeof provider.queryEmails>[0] = {
        limit: MAX_PER_RULE,
      };

      if (criteria.from) {
        queryOpts.from = criteria.from;
      }
      if (criteria.subjectContains) {
        queryOpts.subject = criteria.subjectContains;
      }
      if (criteria.olderThanDays && criteria.olderThanDays > 0) {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - criteria.olderThanDays);
        queryOpts.before = cutoff;
      }
      // labelId maps to mailboxId filter in JMAP terms
      if (criteria.labelId) {
        queryOpts.mailboxId = criteria.labelId;
      }

      // Exclude emails that are already in the archive mailbox
      const { ids } = await provider.queryEmails(queryOpts);

      if (ids.length > 0) {
        // Fetch minimal email metadata to check they are not already archived
        const emails = await provider.getEmails(ids, ['id', 'mailboxIds']);
        const toArchive = emails.filter(
          (e) => !e.mailboxIds || !Object.keys(e.mailboxIds ?? {}).includes(archiveMailboxId),
        );

        // Move each matching email to archive
        await Promise.allSettled(
          toArchive.map(async (email) => {
            try {
              await provider.moveEmail(email.id, archiveMailboxId);
              ruleArchived++;
            } catch (err) {
              console.warn(
                `[auto-archive/run] failed to archive email ${email.id} for rule ${rule.id}:`,
                err,
              );
            }
          }),
        );
      }

      rulesRun++;
      totalArchived += ruleArchived;

      // Update rule stats in DB (last_run_at + cumulative archived_count)
      await (supabase as any)
        .schema('upinbox')
        .from('auto_archive_rules')
        .update({
          last_run_at: now.toISOString(),
          archived_count: (rule.archived_count ?? 0) + ruleArchived,
        })
        .eq('id', rule.id)
        .eq('user_id', user.id);
    } catch (err) {
      console.error(`[auto-archive/run] rule ${rule.id} (${rule.name}) failed:`, err);
      // Continue with remaining rules — partial success is still useful
    }
  }

  return NextResponse.json({ archived: totalArchived, rulesRun });
}
