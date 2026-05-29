import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const start = params.get('start');
  const end = params.get('end');
  const accountId = params.get('accountId');

  const supabase = await createServerSupabaseClient();
  let query = (supabase as any)
    .schema('upinbox')
    .from('calendar_events')
    .select('id, summary, description, location, start_at, end_at, all_day, organizer_email, organizer_name, account_id, status')
    .eq('user_id', user.id)
    .order('start_at', { ascending: true });

  if (start) query = query.gte('end_at', start);
  if (end) query = query.lte('start_at', end);
  if (accountId) query = query.eq('account_id', accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
