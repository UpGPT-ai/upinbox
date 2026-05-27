'use client';

/**
 * FeedEmailList — email list for a specific screener feed.
 * Used in the newsletters, promotions, receipts, and social feeds.
 * Shows a triage badge (category + confidence) on each row.
 */

import { VList } from 'virtua';
import { useAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { openEmailIdAtom, activeAccountIdAtom } from '@/atoms/mail';
import type { FeedType } from './feed-tabs';
import type { JmapEmail } from '@/lib/mail/types';

interface FeedEmail extends JmapEmail {
  _triage: {
    category: string;
    confidence: number;
    classified_at: string;
  } | null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  NEWSLETTER:    { bg: 'bg-blue-50',   text: 'text-blue-700' },
  PROMOTION:     { bg: 'bg-orange-50', text: 'text-orange-700' },
  RECEIPT:       { bg: 'bg-green-50',  text: 'text-green-700' },
  SOCIAL:        { bg: 'bg-purple-50', text: 'text-purple-700' },
  AUTOMATED:     { bg: 'bg-gray-50',   text: 'text-gray-600' },
  ACTION_REQUIRED: { bg: 'bg-red-50',  text: 'text-red-700' },
  FYI:           { bg: 'bg-sky-50',    text: 'text-sky-700' },
  EXPIRED:       { bg: 'bg-gray-50',   text: 'text-gray-400' },
};

const CATEGORY_LABELS: Record<string, string> = {
  NEWSLETTER: 'Newsletter',
  PROMOTION: 'Promo',
  RECEIPT: 'Receipt',
  SOCIAL: 'Social',
  AUTOMATED: 'Auto',
  ACTION_REQUIRED: 'Action',
  FYI: 'FYI',
  EXPIRED: 'Expired',
};

function TriageBadge({ category, confidence }: { category: string; confidence: number }) {
  const colors = CATEGORY_COLORS[category] ?? { bg: 'bg-gray-50', text: 'text-gray-600' };
  const label = CATEGORY_LABELS[category] ?? category;
  const pct = Math.round(confidence * 100);

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${colors.bg} ${colors.text}`}>
      {label}
      {pct < 80 && <span className="opacity-60">·{pct}%</span>}
    </span>
  );
}

function useFeedEmails(accountId: string | null, feed: FeedType) {
  return useQuery({
    queryKey: ['upinbox', 'feed', accountId, feed],
    enabled: !!accountId && feed !== 'inbox' && feed !== 'focus',
    queryFn: async (): Promise<FeedEmail[]> => {
      const params = new URLSearchParams({
        accountId: accountId!,
        feed,
        action: 'feed',
        limit: '100',
      });
      const res = await fetch(`/api/upinbox/screener?${params}`);
      if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
      const { emails } = await res.json();
      return emails ?? [];
    },
    staleTime: 60 * 1000,
  });
}

interface FeedEmailListProps {
  feed: FeedType;
}

export function FeedEmailList({ feed }: FeedEmailListProps) {
  const [accountId] = useAtom(activeAccountIdAtom);
  const [openEmailId, setOpenEmailId] = useAtom(openEmailIdAtom);
  const { data: emails = [], isLoading, isError } = useFeedEmails(accountId, feed);

  if (isLoading) {
    return (
      <div className="divide-y">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="px-4 py-3 space-y-1.5">
            <div className="h-4 bg-muted rounded animate-pulse w-40" />
            <div className="h-3 bg-muted rounded animate-pulse w-56" />
            <div className="h-3 bg-muted rounded animate-pulse w-72" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Failed to load {feed} feed.
      </div>
    );
  }

  if (emails.length === 0) {
    const feedLabels: Partial<Record<FeedType, string>> = {
      news: 'newsletters',
      promos: 'promotions',
      receipts: 'receipts',
      social: 'social notifications',
    };

    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <span className="text-3xl">✨</span>
        <span className="text-sm">No {feedLabels[feed] ?? feed} yet</span>
      </div>
    );
  }

  return (
    <div className="h-full">
      <VList className="h-full">
        {emails.map((email) => {
          const isOpen = openEmailId === email.id;
          const isRead = email.keywords?.['$seen'] ?? false;
          const sender = email.from?.[0];

          return (
            <div
              key={email.id}
              onClick={() => setOpenEmailId(email.id)}
              className={`
                flex items-start gap-3 px-4 py-3 cursor-pointer border-b transition-colors
                ${isOpen ? 'bg-accent' : 'hover:bg-muted/50'}
                ${!isRead ? 'font-medium' : ''}
              `}
            >
              {/* Unread dot */}
              <div className="mt-1.5 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${!isRead ? 'bg-primary' : 'bg-transparent'}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-sm truncate ${!isRead ? 'font-semibold' : ''}`}>
                    {sender?.name || sender?.email || 'Unknown'}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatDate(email.receivedAt ?? email.sentAt ?? '')}
                  </span>
                </div>
                <div className="text-sm truncate">{email.subject || '(no subject)'}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {email.preview ?? ''}
                  </span>
                  {email._triage && (
                    <TriageBadge
                      category={email._triage.category}
                      confidence={email._triage.confidence}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </VList>
    </div>
  );
}
