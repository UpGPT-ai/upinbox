/**
 * GET   /api/upinbox/emails/[id]?accountId={accountId}  — fetch full email body
 * PATCH /api/upinbox/emails/[id]                         — update keywords/flags
 * DELETE /api/upinbox/emails/[id]                        — trash or permanently delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// All properties for full email view (including body)
const FULL_PROPERTIES = [
  'id',
  'threadId',
  'mailboxIds',
  'from',
  'to',
  'cc',
  'bcc',
  'replyTo',
  'subject',
  'receivedAt',
  'sentAt',
  'keywords',
  'hasAttachment',
  'attachments',
  'bodyValues',
  'htmlBody',
  'textBody',
  'bodyStructure',
  'size',
  'headers',
];

async function getAccountAndProvider(userId: string, accountId: string | null) {
  if (!accountId) return { error: 'accountId is required', status: 400 } as const;

  const supabase = await createServerSupabaseClient();
  const { data: account, error } = await supabase
    .from('upinbox.accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();

  if (error || !account) return { error: 'Account not found', status: 404 } as const;

  const provider = await getMailProvider(account);
  return { provider, account };
}

// ─── GET: full email body ─────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get('accountId');
  const result = await getAccountAndProvider(user.id, accountId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  try {
    const emails = await result.provider.getEmails([params.id], FULL_PROPERTIES);
    if (!emails.length) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Mark as read automatically
    await result.provider.setKeywords(params.id, { '$seen': true }).catch(() => {
      // Non-fatal — best effort
    });

    return NextResponse.json({ email: emails[0] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch email', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 502 }
    );
  }
}

// ─── PATCH: update keywords ───────────────────────────────────────────────────

const PatchEmailSchema = z.object({
  accountId: z.string().uuid(),
  keywords: z.record(z.boolean()),
  mailboxId: z.string().optional(), // for move operation
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PatchEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const result = await getAccountAndProvider(user.id, parsed.data.accountId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  try {
    const { keywords, mailboxId } = parsed.data;

    if (Object.keys(keywords).length > 0) {
      await result.provider.setKeywords(params.id, keywords);
    }
    if (mailboxId) {
      await result.provider.moveEmail(params.id, mailboxId);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update email', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 502 }
    );
  }
}

// ─── DELETE: trash or destroy ─────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get('accountId');
  const result = await getAccountAndProvider(user.id, accountId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  try {
    await result.provider.deleteEmail(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete email', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 502 }
    );
  }
}
