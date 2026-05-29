'use client';

import { useState } from 'react';
import { EventModal, type CalendarEventFull } from '@/components/calendar/event-modal';

interface AgendaViewProps {
  events: CalendarEventFull[];
}

// ─── Date grouping ────────────────────────────────────────────────────────────

type Group = { label: string; key: string; events: CalendarEventFull[] };

function groupEvents(events: CalendarEventFull[]): Group[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const nextWeekStart = new Date(today);
  nextWeekStart.setDate(today.getDate() + 2);

  const nextWeekEnd = new Date(today);
  nextWeekEnd.setDate(today.getDate() + 7);

  const map = new Map<string, CalendarEventFull[]>();

  for (const ev of events) {
    const start = new Date(ev.start_at);
    start.setHours(0, 0, 0, 0);

    let key: string;
    if (start.getTime() === today.getTime()) {
      key = 'today';
    } else if (start.getTime() === tomorrow.getTime()) {
      key = 'tomorrow';
    } else if (start >= nextWeekStart && start <= nextWeekEnd) {
      key = 'this-week';
    } else if (start > nextWeekEnd) {
      key = 'later';
    } else {
      key = 'past';
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }

  const ORDER = ['past', 'today', 'tomorrow', 'this-week', 'later'];
  const LABELS: Record<string, string> = {
    past:      'Past',
    today:     'Today',
    tomorrow:  'Tomorrow',
    'this-week': 'This week',
    later:     'Later',
  };

  return ORDER.filter((k) => map.has(k)).map((k) => ({
    label: LABELS[k],
    key: k,
    events: map.get(k)!,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ev: CalendarEventFull): string {
  if (ev.all_day) return 'All day';
  return new Date(ev.start_at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const SOURCE_DOT: Record<string, string> = {
  ics_email: 'bg-blue-400',
  google:    'bg-red-400',
  manual:    'bg-indigo-400',
};

const RSVP_DOT: Record<string, string> = {
  accepted:    'text-green-600',
  declined:    'text-red-500',
  tentative:   'text-yellow-600',
  'needs-action': 'text-gray-400',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AgendaView({ events }: AgendaViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventFull | null>(null);

  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        No upcoming events — click <span className="font-medium text-indigo-600">Sync from email</span> or connect Google Calendar.
      </div>
    );
  }

  const groups = groupEvents(events);

  return (
    <>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.key}>
            {/* Group header */}
            <div className="sticky top-0 z-10 bg-white pb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-1">
                {group.label}
              </h3>
            </div>

            {/* Events */}
            <ul className="mt-2 space-y-1">
              {group.events.map((ev) => (
                <li key={ev.id ?? ev.start_at}>
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Time column */}
                      <div className="w-16 shrink-0 pt-0.5">
                        <p className="text-xs font-medium text-gray-500 leading-tight">{formatTime(ev)}</p>
                        {group.key !== 'today' && group.key !== 'tomorrow' && (
                          <p className="text-xs text-gray-400 leading-tight mt-0.5">{formatDate(ev.start_at)}</p>
                        )}
                      </div>

                      {/* Source dot */}
                      <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SOURCE_DOT[ev.source ?? 'manual'] ?? 'bg-gray-400'}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 group-hover:text-indigo-700 transition-colors">
                          {ev.summary}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          {ev.location && <span className="truncate max-w-[140px]">{ev.location}</span>}
                          {ev.attendees && ev.attendees.length > 1 && (
                            <span>{ev.attendees.length} attendees</span>
                          )}
                          {ev.video_url && (
                            <span className="text-blue-500">Video</span>
                          )}
                        </div>
                      </div>

                      {/* RSVP indicator */}
                      {ev.rsvp_status && ev.rsvp_status !== 'needs-action' && (
                        <span className={`shrink-0 text-xs font-medium ${RSVP_DOT[ev.rsvp_status] ?? ''}`}>
                          {ev.rsvp_status === 'accepted' ? '✓' : ev.rsvp_status === 'declined' ? '✗' : '?'}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          mode="view"
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}

export default AgendaView;
