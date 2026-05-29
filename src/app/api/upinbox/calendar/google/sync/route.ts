import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { syncGoogleCalendars } from '@/lib/calendar/google-sync';
import { encryptString, decryptString } from '@/lib/mail/crypto/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerSupabaseClient();

  const { data: tokenRows } = await (supabase as any)
    .schema('upinbox')
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', user.id);

  if (!tokenRows?.length) {
    return NextResponse.json({ error: 'No Google Calendar connected', connected: false }, { status: 404 });
  }

  let totalSynced = 0;
  const errors: string[] = [];

  for (const row of tokenRows) {
    try {
      const synced = await syncGoogleCalendars(
        user.id,
        row,
        supabase,
        decryptString,
        encryptString,
      );
      totalSynced += synced;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Sync failed');
    }
  }

  return NextResponse.json({
    synced: totalSynced,
    accounts: tokenRows.length,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const { data } = await (supabase as any)
    .schema('upinbox')
    .from('google_calendar_tokens')
    .select('id, alias, token_expiry, calendar_ids, last_synced_at, created_at')
    .eq('user_id', user.id);

  return NextResponse.json({ connected: !!data?.length, accounts: data ?? [] });
}
