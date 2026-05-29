'use server';

/**
 * GET /api/upinbox/unified
 * Fetches inbox emails from ALL accounts for the current user,
 * merges by receivedAt (newest first), returns paginated result.
 *
 * Query params:
 *   limit (default 50), offset (default 0)
 *   search, from, subject, after, before, hasAttachment
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(params.get('limit') ?? '50'), 200);
    const offset = parseInt(params.get('offset') ?? '0');
    const search = params.get('search') ?? undefined;
    const from = params.get('from') ?? undefined;
    const subject = params.get('subject') ?? undefined;
    const after = params.get('after') ? new Date(params.get('after')!) : undefined;
    const before = params.get('before') ? new Date(params.get('before')!) : undefined;
    const hasAttachment = params.get('hasAttachment') === 'true';

    // Load all accounts for this user
    const { data: accounts } = await (supabase as any)
      .schema('upinbox')
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('sync_enabled', true);

    if (!accounts?.length) return NextResponse.json({ emails: [], total: 0, accounts: [] });

    // Fetch inbox emails from each account in parallel
    const perAccountResults = await Promise.allSettled(
      accounts.map(async (account: any) => {
        try {
          const provider = await getMailProvider(account);
          const mailboxes = await provider.listMailboxes();
          const inbox = mailboxes.find((m: any) => m.role === 'inbox');
          if (!inbox) return [];

          const fetchLimit = hasAttachment ? limit * 3 : limit + offset;
          const { ids } = await provider.queryEmails({
            mailboxId: inbox.id,
            limit: fetchLimit,
            offset: 0,
            sortDir: 'desc',
            search,
            from,
            subject,
            before,
            since: after,
            hasAttachment: hasAttachment || undefined,
          });

          if (!ids.length) return [];

          const emails = await provider.getEmails(ids.slice(0, fetchLimit));
          return emails.map((e: any) => ({ ...e, _accountId: account.id, _accountEmail: account.email_address }));
        } catch {
          return [];
        }
      })
    );

    // Merge + sort all results by receivedAt desc
    let merged: any[] = [];
    for (const result of perAccountResults) {
      if (result.status === 'fulfilled') merged = merged.concat(result.value);
    }
    merged.sort((a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime());

    // Client-side hasAttachment filter
    if (hasAttachment) {
      merged = merged.filter((e) => e.hasAttachment);
    }

    const total = merged.length;
    const page = merged.slice(offset, offset + limit);

    return NextResponse.json({
      emails: page,
      total,
      accounts: accounts.map((a: any) => ({ id: a.id, email: a.email_address })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
