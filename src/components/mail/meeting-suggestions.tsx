'use client';

import { useState, useMemo } from 'react';
import { extractDates, buildCalendarUrl, type ExtractedDate } from '@/lib/calendar/date-extractor';

interface MeetingSuggestionsProps {
  emailText: string;
  emailSubject?: string | null;
}

/**
 * Inline card that appears when meeting proposals are detected in email text.
 * Shows the first detected proposal with an "Add to Google Calendar" button.
 */
export function MeetingSuggestions({ emailText, emailSubject }: MeetingSuggestionsProps) {
  const [dismissed, setDismissed] = useState(false);

  const proposals = useMemo<ExtractedDate[]>(() => {
    if (!emailText) return [];
    return extractDates(emailText).filter((d) => d.isProposal);
  }, [emailText]);

  if (dismissed || proposals.length === 0) return null;

  // Use the first proposal as the primary suggestion.
  const primary = proposals[0];

  // Build a human-readable label for the date.
  const dateLabel = (() => {
    try {
      const d = new Date(primary.date + 'T00:00:00');
      const formatted = d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      return primary.time
        ? `${formatted} at ${primary.time}`
        : formatted;
    } catch {
      return primary.date;
    }
  })();

  const calendarUrl = buildCalendarUrl(
    emailSubject ?? 'Meeting',
    primary.date,
    60,
  );

  return (
    <div
      role="region"
      aria-label="Meeting proposal detected"
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-600 dark:bg-amber-950/30"
    >
      {/* Icon */}
      <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">
        📅
      </span>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          Meeting proposal detected
        </p>
        <p className="text-amber-800 dark:text-amber-300">{dateLabel}</p>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-400 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            Add to Google Calendar
          </a>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default MeetingSuggestions;
