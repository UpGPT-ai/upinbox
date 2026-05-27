'use client';

/**
 * FeedTabs — navigation bar for the screener feeds.
 *
 * Shows: Inbox | Focus | Newsletters | Promotions | Receipts | Social
 * with unread counts derived from triage results.
 */

import { useAtom } from 'jotai';
import { atom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { activeAccountIdAtom } from '@/atoms/mail';

export type FeedType = 'inbox' | 'focus' | 'news' | 'promos' | 'receipts' | 'social';

export const activeFeedAtom = atom<FeedType>('inbox');

const FEEDS: { id: FeedType; label: string; icon: string }[] = [
  { id: 'inbox', label: 'All mail', icon: '📬' },
  { id: 'focus', label: 'Action needed', icon: '⚡' },
  { id: 'news', label: 'Newsletters', icon: '📰' },
  { id: 'promos', label: 'Promotions', icon: '🏷️' },
  { id: 'receipts', label: 'Receipts', icon: '🧾' },
  { id: 'social', label: 'Social', icon: '💬' },
];

function useFeedCounts(accountId: string | null) {
  return useQuery({
    queryKey: ['upinbox', 'feed-counts', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return {};
      const params = new URLSearchParams({ accountId, action: 'counts' });
      const res = await fetch(`/api/upinbox/screener?${params}`);
      if (!res.ok) return {};
      const data = await res.json();
      return data.counts ?? {};
    },
    staleTime: 60 * 1000,
  });
}

interface FeedTabsProps {
  onFeedChange?: (feed: FeedType) => void;
}

export function FeedTabs({ onFeedChange }: FeedTabsProps) {
  const [activeFeed, setActiveFeed] = useAtom(activeFeedAtom);
  const [accountId] = useAtom(activeAccountIdAtom);
  const { data: counts = {} } = useFeedCounts(accountId);

  const handleSelect = (feed: FeedType) => {
    setActiveFeed(feed);
    onFeedChange?.(feed);
  };

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b overflow-x-auto scrollbar-none">
      {FEEDS.map((feed) => {
        const count = (counts as Record<string, number>)[feed.id] ?? 0;
        const isActive = activeFeed === feed.id;

        return (
          <button
            key={feed.id}
            onClick={() => handleSelect(feed.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap
              transition-colors flex-shrink-0
              ${isActive
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }
            `}
          >
            <span className="text-base leading-none">{feed.icon}</span>
            <span>{feed.label}</span>
            {count > 0 && (
              <span className={`
                text-xs px-1.5 py-0.5 rounded-full font-medium
                ${isActive
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-primary/10 text-primary'
                }
              `}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
