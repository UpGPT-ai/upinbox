/**
 * GET  /api/upinbox/deep-clean?accountId=<uuid>
 *   Verify ownership of the account, then scan for cleanup candidates.
 *   Returns counts per category plus a total.
 *
 * POST /api/upinbox/deep-clean
 *   Body: { accountId: string; selectedActions: { oldEmails: boolean; newsletters: boolean; largeAttachments: boolean } }
 *   Creates undo vault entries for each deleted message, then deletes them.
 *   Returns { cleaned: number }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Resolve and verify that accountId belongs to the current user. */
async function resolveAccount(
  supabase: any,
  userId: string,
  accountId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as { id: string };
}

// ─── GET: scan ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
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

  const account = await resolveAccount(supabase, user.id, accountId);
  if (!account) {
    return NextResponse.json({ error: 'Account not found or access denied' }, { status: 404 });
  }

  // TODO(deep-clean): Replace stub counts with real IMAP scan calls.
  //   - oldEmails: search mailbox for messages older than 365 days with no reply
  //     IMAP criteria: BEFORE <date-1yr-ago> NOT ANSWERED
  //   - newsletters: search for List-Unsubscribe header presence or known bulk senders
  //     IMAP criteria: HEADER List-Unsubscribe ""
  //   - largeAttachments: search for messages with RFC822.SIZE > 5_000_000
  //     IMAP criteria: LARGER 5000000
  //   Use the account's encrypted_credentials (decrypted via src/lib/mail/crypto/credentials.ts)
  //   to open an authenticated IMAP session (src/lib/mail/providers).
  //   Cache counts in upinbox.deep_clean_scans (accountId, scannedAt, counts JSONB) to avoid
  //   hammering IMAP on every wizard open.

  const oldEmails = 0;
  const newsletters = 0;
  const largeAttachments = 0;
  const totalCandidates = oldEmails + newsletters + largeAttachments;

  return NextResponse.json({
    oldEmails,
    newsletters,
    largeAttachments,
    totalCandidates,
  });
}

// ─── POST: execute ────────────────────────────────────────────────────────────

const PostBodySchema = z.object({
  accountId: z.string().uuid(),
  selectedActions: z.object({
    oldEmails: z.boolean(),
    newsletters: z.boolean(),
    largeAttachments: z.boolean(),
  }),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof PostBodySchema>;
  try {
    const raw = await request.json();
    body = PostBodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { accountId, selectedActions } = body;

  const supabase = await createServerSupabaseClient();

  const account = await resolveAccount(supabase, user.id, accountId);
  if (!account) {
    return NextResponse.json({ error: 'Account not found or access denied' }, { status: 404 });
  }

  // TODO(deep-clean): Replace stub with real IMAP + undo vault flow.
  //
  //   Step 1 — Collect UIDs to delete (mirror the GET scan, but return UIDs).
  //     const uids = await collectCandidateUids(account, selectedActions);
  //     UIDs come from IMAP SEARCH for whichever selectedActions flags are true.
  //
  //   Step 2 — Write undo vault entries BEFORE deletion.
  //     For each uid, insert a row into upinbox.undo_vault:
  //       { account_id, user_id, message_uid, raw_eml (base64), expires_at: now+30d }
  //     Use IMAP FETCH uid RFC822 to grab raw EML before marking \Deleted.
  //     Batch in chunks of 50 to avoid memory pressure.
  //     Schema (to create):
  //       CREATE TABLE IF NOT EXISTS upinbox.undo_vault (
  //         id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  //         account_id  uuid NOT NULL REFERENCES upinbox.accounts(id) ON DELETE CASCADE,
  //         user_id     uuid NOT NULL,
  //         message_uid text NOT NULL,
  //         raw_eml     text NOT NULL,          -- base64-encoded RFC822
  //         deleted_at  timestamptz DEFAULT now(),
  //         expires_at  timestamptz NOT NULL,   -- deleted_at + 30 days
  //         restored_at timestamptz
  //       );
  //       CREATE INDEX ON upinbox.undo_vault (account_id, expires_at);
  //
  //   Step 3 — Delete via IMAP.
  //     IMAP STORE uid +FLAGS (\Deleted) then EXPUNGE.
  //     Count successes.
  //
  //   Step 4 — Return { cleaned: <count> }.

  // Stub: simulate a successful clean of 0 messages.
  const cleaned = 0;

  // Stub undo vault insert (no-op until real UIDs are collected).
  // When real: insert rows into upinbox.undo_vault here before IMAP EXPUNGE.
  const _undoVaultInsert = await (supabase as any)
    .schema('upinbox')
    .from('undo_vault')
    .insert([])   // empty — replaced when UIDs are collected
    .select('id');
  // Ignore insert errors on empty array; table may not exist yet.

  return NextResponse.json({ cleaned });
}
