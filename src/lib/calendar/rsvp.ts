/**
 * Calendar RSVP — server-only helpers (nodemailer SMTP send).
 * For parsing, use rsvp-parser.ts (client-safe).
 */

export type { CalendarAttendee, CalendarInvite, RsvpAction } from './rsvp-parser';
export { extractIcsFromBodyValues, parseInviteFromIcs, parseInviteFromEmail } from './rsvp-parser';

import type { CalendarInvite, RsvpAction } from './rsvp-parser';
import type { UpInboxAccount } from '@/lib/mail/types';

// ─── RSVP ICS Builder ────────────────────────────────────────────────────────

export function buildRsvpIcs(
  invite: CalendarInvite,
  attendeeEmail: string,
  attendeeName: string | null,
  action: RsvpAction,
): string {
  const partstat = { accepted: 'ACCEPTED', declined: 'DECLINED', tentative: 'TENTATIVE' }[action];
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dtStart = invite.allDay ? formatIcsDate(invite.startAt) : formatIcsDateTime(invite.startAt);
  const dtEnd   = invite.allDay ? formatIcsDate(invite.endAt)   : formatIcsDateTime(invite.endAt);
  const cnLine = attendeeName ? `;CN="${attendeeName}"` : '';
  const organizerLine = invite.organizerEmail
    ? `ORGANIZER${invite.organizerName ? `;CN="${invite.organizerName}"` : ''}:mailto:${invite.organizerEmail}`
    : '';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UpInbox//Calendar//EN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${invite.uid}`,
    `DTSTAMP:${dtStamp}`,
    invite.allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    invite.allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(invite.summary)}`,
    organizerLine,
    `ATTENDEE${cnLine};PARTSTAT=${partstat};RSVP=TRUE:mailto:${attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function formatIcsDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatIcsDateTime(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${day}T${h}${min}${s}Z`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// ─── SMTP Dispatch ────────────────────────────────────────────────────────────

export async function sendRsvpReply(
  account: UpInboxAccount,
  invite: CalendarInvite,
  attendeeName: string | null,
  action: RsvpAction,
): Promise<void> {
  const { createTransport } = await import('nodemailer');
  const { decryptCredentials } = await import('@/lib/mail/crypto/credentials');

  const creds = await decryptCredentials(account.encrypted_credentials);
  if (creds.type !== 'imap' && creds.type !== 'oauth_imap') {
    throw new Error('RSVP only supported for IMAP accounts');
  }

  const smtpHost = (creds as import('@/lib/mail/types').ImapCredentials).smtpHost
    ?? (creds as import('@/lib/mail/types').ImapCredentials).imapHost;
  const host = smtpHost === '127.0.0.1' || smtpHost === 'localhost' ? '::1' : smtpHost;
  const isLoopback = host === '::1';

  const transport = createTransport({
    host,
    port: (creds as import('@/lib/mail/types').ImapCredentials).smtpPort,
    secure: (creds as import('@/lib/mail/types').ImapCredentials).smtpTls ?? false,
    auth: creds.type === 'oauth_imap'
      ? { type: 'OAuth2', user: account.email_address, accessToken: creds.accessToken }
      : {
          user: (creds as import('@/lib/mail/types').ImapCredentials).username,
          pass: (creds as import('@/lib/mail/types').ImapCredentials).password,
        },
    tls: isLoopback ? { rejectUnauthorized: false } : undefined,
  });

  const icsContent = buildRsvpIcs(invite, account.email_address, attendeeName, action);
  const actionLabel = { accepted: 'Accepted', declined: 'Declined', tentative: 'Tentatively accepted' }[action];
  const to = invite.organizerEmail ?? account.email_address;

  await transport.sendMail({
    from: attendeeName ? `"${attendeeName}" <${account.email_address}>` : account.email_address,
    to,
    subject: `${actionLabel}: ${invite.summary}`,
    text: `${actionLabel}: ${invite.summary}`,
    alternatives: [
      { contentType: 'text/calendar; method=REPLY; charset=UTF-8', content: icsContent },
    ],
    attachments: [
      { filename: 'invite.ics', content: icsContent, contentType: 'text/calendar; method=REPLY' },
    ],
  });
}
