import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { getMailProvider } from '@/lib/mail/providers';
import ICAL from 'ical.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CalendarAttendeeRow {
  email: string;
  name?: string;
  role: string;
  rsvpStatus: string;
}

interface CalendarEventRow {
  user_id: string;
  account_id: string;
  source_email_id: string;
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  organizer_email: string | null;
  organizer_name: string | null;
  status: string;
  recurrence_rule: string | null;
  raw_ics: string;
  attendees: CalendarAttendeeRow[];
  source: string;
  video_url: string | null;
}

function extractIcsFromBodyValues(bodyValues: Record<string, { value: string }>): string | null {
  for (const part of Object.values(bodyValues)) {
    if (part.value?.includes('BEGIN:VCALENDAR')) return part.value;
  }
  return null;
}

function extractVideoUrl(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(
    /https:\/\/(?:meet\.google\.com|zoom\.us\/j|teams\.microsoft\.com\/l\/meetup-join)[^\s<>"')]+/i,
  );
  return match ? match[0] : null;
}

function parsePartstat(raw: string | null): string {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACCEPTED':  return 'accepted';
    case 'DECLINED':  return 'declined';
    case 'TENTATIVE': return 'tentative';
    default:          return 'needs-action';
  }
}

function parseIcsToEvents(
  icsString: string,
  userId: string,
  accountId: string,
  sourceEmailId: string,
): CalendarEventRow[] {
  try {
    const parsed = ICAL.parse(icsString);
    const comp = new ICAL.Component(parsed);
    const method = (comp.getFirstPropertyValue('method') as string | null ?? 'REQUEST').toUpperCase();
    if (method === 'REPLY' || method === 'CANCEL') return [];

    const vevents = comp.getAllSubcomponents('vevent');
    const rows: CalendarEventRow[] = [];

    for (const vevent of vevents) {
      try {
        const event = new ICAL.Event(vevent);
        const uid = event.uid;
        if (!uid) continue;

        const dtstart = event.startDate;
        const dtend = event.endDate ?? dtstart;
        const allDay = dtstart.isDate;

        const organizerProp = vevent.getFirstPropertyValue('organizer') as string | null;
        let organizerEmail: string | null = null;
        let organizerName: string | null = null;
        if (organizerProp) {
          organizerEmail = organizerProp.replace(/^mailto:/i, '') || null;
          const cn = vevent.getFirstProperty('organizer')?.getParameter('cn');
          organizerName = Array.isArray(cn) ? cn[0] ?? null : cn ?? null;
        }

        // Attendees
        const attendeeProps = vevent.getAllProperties('attendee');
        const attendees: CalendarAttendeeRow[] = attendeeProps.map((prop) => {
          const emailRaw = prop.getFirstValue() as string;
          const email = (emailRaw ?? '').replace(/^mailto:/i, '');
          const name = prop.getParameter('cn') as string | null ?? undefined;
          const role = (prop.getParameter('role') as string | null ?? 'REQ-PARTICIPANT').toUpperCase();
          const partstat = prop.getParameter('partstat') as string | null;
          return { email, name: name ?? undefined, role, rsvpStatus: parsePartstat(partstat) };
        });

        const statusRaw = vevent.getFirstPropertyValue('status') as string | null;
        const status = statusRaw ? statusRaw.toLowerCase() : 'confirmed';

        const rruleProp = vevent.getFirstProperty('rrule');
        const rrule = rruleProp ? rruleProp.getFirstValue()?.toString() ?? null : null;

        const description = event.description || null;
        const location = event.location || null;
        const xConf = vevent.getFirstPropertyValue('x-google-conference') as string | null;
        const videoUrl = xConf ?? extractVideoUrl(description) ?? extractVideoUrl(location);

        rows.push({
          user_id: userId,
          account_id: accountId,
          source_email_id: sourceEmailId,
          uid,
          summary: event.summary || '(No title)',
          description,
          location,
          start_at: dtstart.toJSDate().toISOString(),
          end_at: dtend.toJSDate().toISOString(),
          all_day: allDay,
          organizer_email: organizerEmail,
          organizer_name: organizerName,
          status: ['confirmed', 'tentative', 'cancelled'].includes(status) ? status : 'confirmed',
          recurrence_rule: rrule,
          raw_ics: icsString,
          attendees,
          source: 'ics_email',
          video_url: videoUrl,
        });
      } catch {
        // skip malformed VEVENT
      }
    }
    return rows;
  } catch {
    return [];
  }
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerSupabaseClient();

  const { data: accounts } = await (supabase as any)
    .schema('upinbox')
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('sync_enabled', true);

  if (!accounts?.length) return NextResponse.json({ synced: 0, accounts: 0 });

  const since = new Date();
  since.setDate(since.getDate() - 180);

  let totalSynced = 0;

  await Promise.allSettled(
    accounts.map(async (account: any) => {
      try {
        const provider = await getMailProvider(account);
        const mailboxes = await provider.listMailboxes();
        const inbox = mailboxes.find((m: any) => m.role === 'inbox' || m.name?.toLowerCase() === 'inbox');
        if (!inbox) return;

        const { ids } = await provider.queryEmails({
          mailboxId: inbox.id,
          limit: 100,
          since,
          sortDir: 'desc',
        });
        if (!ids.length) return;

        const emails = await provider.getEmails(ids);
        const rows: CalendarEventRow[] = [];

        for (const email of emails) {
          if (!email.bodyValues) continue;
          const ics = extractIcsFromBodyValues(email.bodyValues as Record<string, { value: string }>);
          if (!ics) continue;
          const events = parseIcsToEvents(ics, user.id, account.id, email.id);
          rows.push(...events);
        }

        if (!rows.length) return;

        const { error } = await (supabase as any)
          .schema('upinbox')
          .from('calendar_events')
          .upsert(rows, { onConflict: 'user_id,account_id,uid' });

        if (!error) totalSynced += rows.length;
      } catch {
        // individual account failure is non-fatal
      }
    })
  );

  return NextResponse.json({ synced: totalSynced, accounts: accounts.length });
}
