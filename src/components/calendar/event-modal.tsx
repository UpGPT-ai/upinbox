'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEventFull {
  id?: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  organizer_email?: string | null;
  organizer_name?: string | null;
  attendees?: Array<{ email: string; name?: string; role?: string; rsvpStatus?: string }>;
  rsvp_status?: string;
  status?: string;
  video_url?: string | null;
  source?: string;
  account_id?: string | null;
}

interface EventModalProps {
  event: CalendarEventFull | null;
  mode: 'view' | 'edit' | 'create';
  onClose: () => void;
  onSaved?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalInputValue(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) return d.toISOString().slice(0, 10);
  // Convert to local datetime-local input value
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInputValue(val: string, allDay: boolean): string {
  if (allDay) return `${val}T00:00:00.000Z`;
  return new Date(val).toISOString();
}

const RSVP_LABELS: Record<string, { label: string; cls: string }> = {
  accepted:    { label: 'Accepted',     cls: 'bg-green-100 text-green-800' },
  declined:    { label: 'Declined',     cls: 'bg-red-100 text-red-800' },
  tentative:   { label: 'Maybe',        cls: 'bg-yellow-100 text-yellow-800' },
  'needs-action': { label: 'Awaiting',  cls: 'bg-gray-100 text-gray-600' },
};

const SOURCE_LABELS: Record<string, string> = {
  ics_email: 'From email',
  google:    'Google Calendar',
  manual:    'Created manually',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EventModal({ event, mode: initialMode, onClose, onSaved }: EventModalProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>(initialMode);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');

  // Seed form when event changes or mode switches to edit/create
  useEffect(() => {
    if (mode === 'create' && !event) {
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
      setAllDay(false);
      setStartInput(toLocalInputValue(now.toISOString(), false));
      setEndInput(toLocalInputValue(inOneHour.toISOString(), false));
      setSummary('');
      setDescription('');
      setLocation('');
      setVideoUrl('');
      return;
    }
    if (event) {
      setSummary(event.summary ?? '');
      setDescription(event.description ?? '');
      setLocation(event.location ?? '');
      setVideoUrl(event.video_url ?? '');
      setAllDay(event.all_day ?? false);
      setStartInput(toLocalInputValue(event.start_at, event.all_day));
      setEndInput(toLocalInputValue(event.end_at, event.all_day));
    }
  }, [event, mode]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        summary,
        description: description || null,
        location: location || null,
        video_url: videoUrl || null,
        start_at: fromLocalInputValue(startInput, allDay),
        end_at: fromLocalInputValue(endInput, allDay),
        all_day: allDay,
      };
      if (mode === 'create') {
        const res = await fetch('/api/upinbox/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Create failed');
      } else {
        const res = await fetch(`/api/upinbox/calendar/events/${event!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Update failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upinbox-calendar-events'] });
      onSaved?.();
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/upinbox/calendar/events/${event!.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upinbox-calendar-events'] });
      onClose();
    },
  });

  if (!event && mode !== 'create') return null;

  const rsvp = RSVP_LABELS[event?.rsvp_status ?? 'needs-action'];
  const attendees = event?.attendees ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'create' ? 'New event' : mode === 'edit' ? 'Edit event' : 'Event details'}
          </h2>
          <div className="flex items-center gap-2">
            {mode === 'view' && event?.id && event.source !== 'google' && (
              <button
                type="button"
                onClick={() => setMode('edit')}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {mode === 'view' ? (
            // ─── View mode ───
            <>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{event!.summary}</h3>
                {event!.source && (
                  <span className="mt-1 inline-block text-xs text-gray-400">
                    {SOURCE_LABELS[event!.source] ?? event!.source}
                  </span>
                )}
              </div>

              {/* Date/time */}
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>
                  {event!.all_day
                    ? new Date(event!.start_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                    : `${new Date(event!.start_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${new Date(event!.end_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`}
                </span>
              </div>

              {/* Location */}
              {event!.location && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{event!.location}</span>
                </div>
              )}

              {/* Video link */}
              {event!.video_url && (
                <div className="flex items-start gap-2 text-sm">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                  <a href={event!.video_url} target="_blank" rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline">
                    Join video call
                  </a>
                </div>
              )}

              {/* Organizer */}
              {(event!.organizer_name || event!.organizer_email) && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>
                    <span className="text-gray-500">Organizer: </span>
                    {event!.organizer_name ?? event!.organizer_email}
                  </span>
                </div>
              )}

              {/* RSVP status */}
              {event!.rsvp_status && event!.rsvp_status !== 'needs-action' && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${rsvp.cls}`}>
                  {rsvp.label}
                </span>
              )}

              {/* Description */}
              {event!.description && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {event!.description}
                </div>
              )}

              {/* Attendees */}
              {attendees.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Attendees ({attendees.length})
                  </p>
                  <ul className="space-y-1.5">
                    {attendees.map((a, i) => {
                      const att = RSVP_LABELS[a.rsvpStatus ?? 'needs-action'];
                      return (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
                              {(a.name ?? a.email)[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              {a.name && <p className="truncate text-sm font-medium text-gray-800">{a.name}</p>}
                              <p className="truncate text-xs text-gray-500">{a.email}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${att.cls}`}>
                            {att.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : (
            // ─── Edit / Create mode ───
            <form
              id="event-form"
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  required
                  placeholder="Event title"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="all-day"
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                <label htmlFor="all-day" className="text-sm text-gray-700">All day</label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                  <input
                    type={allDay ? 'date' : 'datetime-local'}
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                  <input
                    type={allDay ? 'date' : 'datetime-local'}
                    value={endInput}
                    onChange={(e) => setEndInput(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location (optional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Video link</label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://meet.google.com/… (optional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Notes or agenda (optional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>

              {saveMutation.isError && (
                <p className="text-sm text-red-600">
                  {(saveMutation.error as Error).message}
                </p>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <div>
            {mode === 'view' && event?.id && event.source !== 'google' && (
              <>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Delete this event?</span>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </>
            )}
            {mode === 'edit' && (
              <button
                type="button"
                onClick={() => setMode('view')}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {(mode === 'edit' || mode === 'create') && (
            <button
              type="submit"
              form="event-form"
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saveMutation.isPending ? 'Saving…' : mode === 'create' ? 'Create event' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventModal;
