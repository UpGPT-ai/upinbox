'use client';

import React from 'react';

export type InboxEmptyReason = 'empty-inbox' | 'no-results' | 'filtered' | 'first-time';

export interface InboxEmptyProps {
  reason: InboxEmptyReason;
  mailboxName?: string;
  onClearFilters?: () => void;
}

interface EmptyStateContent {
  emoji: string;
  title: string;
  message: string;
  action?: React.ReactNode;
}

function SkeletonRows() {
  return (
    <div className="w-full max-w-md space-y-3" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 animate-pulse"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/5 rounded bg-gray-200" />
            <div className="h-2.5 w-4/5 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InboxEmpty({
  reason,
  mailboxName,
  onClearFilters,
}: InboxEmptyProps) {
  const mailboxLabel = mailboxName ? ` in ${mailboxName}` : '';

  const content: Record<InboxEmptyReason, EmptyStateContent> = {
    'empty-inbox': {
      emoji: '🎉',
      title: 'Inbox zero!',
      message: `You're all caught up${mailboxLabel}. Time to take a breath.`,
    },
    'no-results': {
      emoji: '🔍',
      title: 'No emails match your search.',
      message: 'Try a different keyword, sender, or date range.',
      action: onClearFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Clear search
        </button>
      ) : null,
    },
    filtered: {
      emoji: '🗂️',
      title: `No emails in this view${mailboxLabel ? ` (${mailboxName})` : ''}.`,
      message: 'Your current filters are hiding everything here.',
      action: onClearFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 inline-flex items-center justify-center text-sm font-medium text-blue-600 underline-offset-4 transition hover:text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
        >
          Adjust filters
        </button>
      ) : null,
    },
    'first-time': {
      emoji: '✉️',
      title: 'Your inbox is loading…',
      message: 'Hang tight while we pull in your latest messages.',
      action: (
        <div className="mt-6 w-full flex justify-center">
          <SkeletonRows />
        </div>
      ),
    },
  };

  const { emoji, title, message, action } = content[reason];
  const isLoading = reason === 'first-time';

  return (
    <div
      role={isLoading ? 'status' : 'note'}
      aria-live={isLoading ? 'polite' : undefined}
      aria-busy={isLoading || undefined}
      className="flex w-full flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-4xl"
        aria-hidden="true"
      >
        {emoji}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-gray-600">{message}</p>
      {action}
    </div>
  );
}

export { InboxEmpty };
