import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { expandRecurring } from '@/lib/calendar/recurrence';

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
    .select('id, summary, description, location, start_at, end_at, all_day, organizer_email, organizer_name, account_id, status, rsvp_status, attendees, recurrence_rule, video_url, source, google_event_id')
    .eq('user_id', user.id)
    .order('start_at', { ascending: true });

  // Fetch a wider window to capture recurring events that originate outside the window
  const windowStart = start ? new Date(start) : new Date();
  const windowEnd = end ? new Date(end) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const extendedStart = new Date(windowStart);
  extendedStart.setFullYear(extendedStart.getFullYear() - 1); // look back 1yr for recurrence base events

  if (start) query = query.gte('end_at', extendedStart.toISOString());
  if (end) query = query.lte('start_at', windowEnd.toISOString());
  if (accountId) query = query.eq('account_id', accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Expand recurring events within the requested window
  const expanded = (data ?? []).flatMap((ev: any) =>
    expandRecurring(ev, windowStart, windowEnd)
  );

  // Sort by start_at after expansion
  expanded.sort((a: any, b: any) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  return NextResponse.json(expanded);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.summary || !body?.start_at || !body?.end_at) {
    return NextResponse.json({ error: 'summary, start_at, end_at required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  const row = {
    user_id: user.id,
    account_id: body.account_id ?? null,
    source_email_id: '',
    uid: `upinbox-${user.id}-${Date.now()}`,
    summary: String(body.summary).slice(0, 500),
    description: body.description ?? null,
    location: body.location ?? null,
    start_at: body.start_at,
    end_at: body.end_at,
    all_day: body.all_day ?? false,
    organizer_email: user.email ?? null,
    organizer_name: user.user_metadata?.full_name ?? null,
    status: 'confirmed',
    recurrence_rule: null,
    raw_ics: '',
    attendees: body.attendees ?? [],
    source: 'manual',
    rsvp_status: 'accepted',
    video_url: body.video_url ?? null,
  };

  const { data, error } = await (supabase as any)
    .schema('upinbox')
    .from('calendar_events')
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
