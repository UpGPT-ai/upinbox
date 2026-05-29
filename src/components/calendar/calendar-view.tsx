'use client';

import dynamic from 'next/dynamic';
import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { viewDay, viewWeek, viewMonthGrid } from '@schedule-x/calendar';
import { useCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import '@schedule-x/theme-default/dist/index.css';
import { AgendaView } from '@/components/calendar/agenda-view';
import { EventModal, type CalendarEventFull } from '@/components/calendar/event-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawCalendarEvent extends CalendarEventFull {
  id: string;
}

interface ScheduleXEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendarId?: string;
}

type ViewTab = 'month' | 'week' | 'day' | 'agenda';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getQueryRange(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const start = new Date(first);
  start.setDate(start.getDate() - 7);

  const end = new Date(last);
  end.setDate(end.getDate() + 7);

  return { start: start.toISOString(), end: end.toISOString() };
}

function toScheduleXEvent(event: RawCalendarEvent): ScheduleXEvent {
  // Source-based calendar coloring
  const calendarId = event.source === 'google' ? 'google' : event.source === 'manual' ? 'manual' : 'email';
  return {
    id: event.id,
    title: event.summary,
    start: event.all_day
      ? event.start_at.slice(0, 10)
      : event.start_at.slice(0, 16).replace('T', ' '),
    end: event.all_day
      ? event.end_at.slice(0, 10)
      : event.end_at.slice(0, 16).replace('T', ' '),
    calendarId,
  };
}

// ─── Calendar skeleton ────────────────────────────────────────────────────────

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

// ─── Inner component (no SSR) ─────────────────────────────────────────────────

function CalendarViewInner() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ViewTab>('month');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [modalEvent, setModalEvent] = useState<RawCalendarEvent | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('view');

  const { start, end } = getQueryRange();

  const { data: rawEvents = [], isLoading, isError } = useQuery<RawCalendarEvent[]>({
    queryKey: ['upinbox-calendar-events', start, end],
    queryFn: async () => {
      const params = new URLSearchParams({ start, end });
      const res = await fetch(`/api/upinbox/calendar/events?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      return res.json();
    },
  });

  // Google Calendar connected status
  const { data: googleStatus } = useQuery<{ connected: boolean }>({
    queryKey: ['upinbox-google-calendar-status'],
    queryFn: () => fetch('/api/upinbox/calendar/google/sync').then((r) => r.json()),
    staleTime: 60_000,
  });

  const scheduleXEvents = rawEvents.map(toScheduleXEvent);

  const calendar = useCalendarApp({
    views: [viewDay, viewWeek, viewMonthGrid],
    defaultView: viewMonthGrid.name,
    locale: 'en-US',
    events: scheduleXEvents,
    calendars: {
      email:  { colorName: 'blue',   lightColors: { main: '#3b82f6', container: '#dbeafe', onContainer: '#1e40af' } },
      google: { colorName: 'red',    lightColors: { main: '#ef4444', container: '#fee2e2', onContainer: '#991b1b' } },
      manual: { colorName: 'indigo', lightColors: { main: '#6366f1', container: '#e0e7ff', onContainer: '#3730a3' } },
    },
    callbacks: {
      onEventClick(calEvent) {
        const raw = rawEvents.find((e) => e.id === calEvent.id);
        if (raw) { setModalEvent(raw); setModalMode('view'); }
      },
    },
  });

  // Keep ScheduleX in sync when query data refreshes
  React.useEffect(() => {
    if (!calendar) return;
    const svc = (calendar as unknown as { eventsService?: { set: (events: ScheduleXEvent[]) => void } }).eventsService;
    svc?.set(scheduleXEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEvents.length, rawEvents]);

  // Switch Schedule-X internal view when tab changes
  React.useEffect(() => {
    if (!calendar || activeTab === 'agenda') return;
    const viewMap: Record<ViewTab, string> = {
      month: viewMonthGrid.name,
      week:  viewWeek.name,
      day:   viewDay.name,
      agenda: '',
    };
    try {
      (calendar as unknown as { changeView: (v: string) => void }).changeView(viewMap[activeTab]);
    } catch { /* ok if not mounted yet */ }
  }, [activeTab, calendar]);

  const handleEmailSync = useCallback(async () => {
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
  }, [queryClient]);

  const googleSyncMutation = useMutation({
    mutationFn: () =>
      fetch('/api/upinbox/calendar/google/sync', { method: 'POST' }).then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(new Error(d.error ?? 'Google sync failed')));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upinbox-calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['upinbox-google-calendar-status'] });
    },
  });

  const TABS: { id: ViewTab; label: string }[] = [
    { id: 'month',  label: 'Month' },
    { id: 'week',   label: 'Week' },
    { id: 'day',    label: 'Day' },
    { id: 'agenda', label: 'Agenda' },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Calendar</h2>
          {!isLoading && !isError && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
              {rawEvents.length} {rawEvents.length === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {syncError && <p className="text-sm text-red-500">{syncError}</p>}
          {googleSyncMutation.isError && (
            <p className="text-sm text-red-500">
              {(googleSyncMutation.error as Error).message}
            </p>
          )}

          {/* New event button */}
          <button
            type="button"
            onClick={() => { setModalMode('create'); setModalEvent(null); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>

          {/* Google Calendar */}
          {googleStatus?.connected ? (
            <button
              type="button"
              onClick={() => googleSyncMutation.mutate()}
              disabled={googleSyncMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-60 transition-colors"
            >
              {googleSyncMutation.isPending ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Sync Google
            </button>
          ) : (
            <a
              href="/api/upinbox/calendar/google/connect"
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Connect Google
            </a>
          )}

          {/* Email sync */}
          <button
            onClick={handleEmailSync}
            disabled={syncing || isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            {syncing ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                </svg>
                Syncing…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync email
              </>
            )}
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" />From email</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Google Calendar</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-400" />Manual</span>
      </div>

      {/* Body */}
      {isLoading ? (
        <CalendarSkeleton />
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load calendar events. Please try refreshing or click Sync.
        </div>
      ) : activeTab === 'agenda' ? (
        <AgendaView events={rawEvents} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
          <ScheduleXCalendar calendarApp={calendar} />
          {rawEvents.length === 0 && (
            <div className="border-t border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500">
              No events yet — sync from email or connect Google Calendar.
            </div>
          )}
        </div>
      )}

      {/* Event modal */}
      {(modalMode === 'create' || modalEvent) && (
        <EventModal
          event={modalEvent}
          mode={modalMode}
          onClose={() => { setModalEvent(null); setModalMode('view'); }}
        />
      )}
    </div>
  );
}

// Export as dynamic to avoid SSR (Schedule-X is client-only)
export default dynamic(() => Promise.resolve(CalendarViewInner), { ssr: false });
