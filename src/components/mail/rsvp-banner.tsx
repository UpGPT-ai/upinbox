'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseInviteFromEmail, type CalendarInvite, type RsvpAction } from '@/lib/calendar/rsvp-parser';
import type { JmapEmail } from '@/lib/mail/types';

interface RsvpBannerProps {
  email: JmapEmail;
  accountId: string;
}

function formatEventDateTime(invite: CalendarInvite): string {
  const opts: Intl.DateTimeFormatOptions = invite.allDay
    ? { weekday: 'long', month: 'long', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  const start = invite.startAt.toLocaleString(undefined, opts);
  if (invite.allDay) return start;
  const endOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  const end = invite.endAt.toLocaleString(undefined, endOpts);
  return `${start} – ${end}`;
}

function AttendeeCount({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="text-xs text-gray-500">{count} attendee{count !== 1 ? 's' : ''}</span>
  );
}

const ACTION_LABELS: Record<RsvpAction, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  tentative: 'Maybe',
};

const STATUS_STYLES: Record<RsvpAction, string> = {
  accepted: 'bg-green-100 text-green-800 border-green-200',
  declined: 'bg-red-100 text-red-800 border-red-200',
  tentative: 'bg-yellow-100 text-yellow-800 border-yellow-200',
};

export function RsvpBanner({ email, accountId }: RsvpBannerProps) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [sentAction, setSentAction] = useState<RsvpAction | null>(null);

  const invite: CalendarInvite | null = useMemo(() => {
    if (!email.bodyValues) return null;
    return parseInviteFromEmail(email);
  }, [email]);

  const mutation = useMutation({
    mutationFn: async (action: RsvpAction) => {
      const res = await fetch('/api/upinbox/calendar/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id, accountId, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `RSVP failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (_data, action) => {
      setSentAction(action);
      // Refresh calendar events so the rsvp_status is reflected
      queryClient.invalidateQueries({ queryKey: ['upinbox-calendar-events'] });
    },
  });

  if (dismissed || !invite || invite.method !== 'REQUEST') return null;

  return (
    <div
      role="region"
      aria-label="Calendar invite"
      className="mx-4 mb-3 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white text-lg font-bold">
            {invite.startAt.getDate()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 leading-tight">{invite.summary}</p>
            <p className="text-xs text-gray-600 mt-0.5">{formatEventDateTime(invite)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Details row */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        {invite.organizerName || invite.organizerEmail ? (
          <span>
            <span className="font-medium">Organizer:</span>{' '}
            {invite.organizerName ?? invite.organizerEmail}
          </span>
        ) : null}
        {invite.location ? (
          <span>
            <span className="font-medium">Location:</span> {invite.location}
          </span>
        ) : null}
        <AttendeeCount count={invite.attendees.length} />
        {invite.videoUrl ? (
          <a
            href={invite.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            Join video
          </a>
        ) : null}
      </div>

      {/* RSVP actions */}
      {sentAction ? (
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[sentAction]}`}>
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {ACTION_LABELS[sentAction]}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {mutation.isError && (
            <p className="w-full text-xs text-red-600">
              {(mutation.error as Error).message}
            </p>
          )}
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('accepted')}
            className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('tentative')}
            className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            Maybe
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('declined')}
            className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            Decline
          </button>
          {mutation.isPending && (
            <svg className="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

export default RsvpBanner;
