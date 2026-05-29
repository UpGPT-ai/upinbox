/**
 * Calendar invite parser — client-safe (no Node.js modules).
 * Parses ICS content from email bodyValues using ical.js.
 */

import ICAL from 'ical.js';
import type { JmapEmail } from '@/lib/mail/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarAttendee {
  email: string;
  name?: string;
  role: string;
  rsvpStatus: 'needs-action' | 'accepted' | 'declined' | 'tentative';
}

export interface CalendarInvite {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  organizerEmail: string | null;
  organizerName: string | null;
  attendees: CalendarAttendee[];
  videoUrl: string | null;
  method: string;
  rawIcs: string;
}

export type RsvpAction = 'accepted' | 'declined' | 'tentative';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function extractIcsFromBodyValues(
  bodyValues: Record<string, { value: string }>,
): string | null {
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

function parsePartstat(raw: string | null): CalendarAttendee['rsvpStatus'] {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACCEPTED':  return 'accepted';
    case 'DECLINED':  return 'declined';
    case 'TENTATIVE': return 'tentative';
    default:          return 'needs-action';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseInviteFromIcs(icsString: string): CalendarInvite | null {
  try {
    const parsed = ICAL.parse(icsString);
    const comp = new ICAL.Component(parsed);
    const method = (comp.getFirstPropertyValue('method') as string | null ?? 'REQUEST').toUpperCase();
    const vevent = comp.getFirstSubcomponent('vevent');
    if (!vevent) return null;

    const event = new ICAL.Event(vevent);
    const uid = event.uid;
    if (!uid) return null;

    const dtstart = event.startDate;
    const dtend = event.endDate ?? dtstart;
    const allDay = dtstart.isDate;

    const organizerProp = vevent.getFirstPropertyValue('organizer') as string | null;
    const organizerEmail = organizerProp ? organizerProp.replace(/^mailto:/i, '') : null;
    const cnParam = vevent.getFirstProperty('organizer')?.getParameter('cn');
    const organizerName = Array.isArray(cnParam) ? cnParam[0] ?? null : cnParam ?? null;

    const attendeesProps = vevent.getAllProperties('attendee');
    const attendees: CalendarAttendee[] = attendeesProps.map((prop) => {
      const emailRaw = prop.getFirstValue() as string;
      const email = (emailRaw ?? '').replace(/^mailto:/i, '');
      const name = prop.getParameter('cn') as string | null ?? undefined;
      const role = (prop.getParameter('role') as string | null ?? 'REQ-PARTICIPANT').toUpperCase();
      const partstat = prop.getParameter('partstat') as string | null;
      return { email, name: name ?? undefined, role, rsvpStatus: parsePartstat(partstat) };
    });

    const description = event.description || null;
    const location = event.location || null;
    const xConf = vevent.getFirstPropertyValue('x-google-conference') as string | null;
    const videoUrl = xConf ?? extractVideoUrl(description) ?? extractVideoUrl(location);

    return {
      uid,
      summary: event.summary || '(No title)',
      description,
      location,
      startAt: dtstart.toJSDate(),
      endAt: dtend.toJSDate(),
      allDay,
      organizerEmail,
      organizerName,
      attendees,
      videoUrl,
      method,
      rawIcs: icsString,
    };
  } catch {
    return null;
  }
}

export function parseInviteFromEmail(email: JmapEmail): CalendarInvite | null {
  if (!email.bodyValues) return null;
  const ics = extractIcsFromBodyValues(email.bodyValues as Record<string, { value: string }>);
  if (!ics) return null;
  return parseInviteFromIcs(ics);
}
