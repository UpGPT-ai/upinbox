'use client';

import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { viewDay, viewWeek, viewMonthGrid } from '@schedule-x/calendar';
import { useCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import '@schedule-x/theme-default/dist/index.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawCalendarEvent {
  id: string;
  summary: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
}

interface ScheduleXEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getQueryRange(): { start: string; end: string } {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - 7);

  const end = new Date(lastOfMonth);
  end.setDate(end.getDate() + 7);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function toScheduleXEvent(event: RawCalendarEvent): ScheduleXEvent {
  return {
    id: event.id,
    title: event.summary,
    start: event.all_day
      ? event.start_at.slice(0, 10)
      : event.start_at.slice(0, 16).replace('T', ' '),
    end: event.all_day
      ? event.end_at.slice(0, 10)
      : event.end_at.slice(0, 16).replace('T', ' '),
  };
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function CalendarSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-6 rounded bg-gray-200" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={`cell-${i}`} className="h-20 rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner component (no SSR)
// ---------------------------------------------------------------------------

function CalendarViewInner() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { start, end } = getQueryRange();

  const { data: rawEvents = [], isLoading, isError } = useQuery<RawCalendarEvent[]>({
    queryKey: ['upinbox-calendar-events', start, end],
    queryFn: async () => {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/upinbox/calendar/events?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
      return res.json();
    },
  });

  const scheduleXEvents = rawEvents.map(toScheduleXEvent);

  const calendar = useCalendarApp({
    views: [viewDay, viewWeek, viewMonthGrid],
    defaultView: viewMonthGrid.name,
    locale: 'en-US',
    events: scheduleXEvents,
  });

  // Keep calendar events in sync whenever query data refreshes
  React.useEffect(() => {
    if (!calendar) return;
    // Schedule-X exposes eventsService on the calendar instance
    const svc = (calendar as unknown as { eventsService?: { set: (events: ScheduleXEvent[]) => void } }).eventsService;
    if (svc) {
      svc.set(scheduleXEvents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleXEvents.length, rawEvents]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/upinbox/calendar/sync', { method: 'POST' });
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      await queryClient.invalidateQueries({ queryKey: ['upinbox-calendar-events'] });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Calendar</h2>
          {!isLoading && !isError && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
              {rawEvents.length} {rawEvents.length === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {syncError && (
            <p className="text-sm text-red-500">{syncError}</p>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"
                  />
                </svg>
                Syncing…
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Sync from email
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <CalendarSkeleton />
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load calendar events. Please try refreshing or click Sync.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
          <ScheduleXCalendar calendarApp={calendar} />
          {rawEvents.length === 0 && (
            <div className="border-t border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
              No events yet — click <span className="font-medium text-indigo-600">Sync from email</span> to scan your inboxes for calendar invites, or create an event manually.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export — dynamic to avoid SSR (Schedule-X is client-only)
// ---------------------------------------------------------------------------

export default dynamic(() => Promise.resolve(CalendarViewInner), { ssr: false });
