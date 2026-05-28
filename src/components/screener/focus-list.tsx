'use client';

/**
 * FocusList — shows only ACTION_REQUIRED emails from the smart screener.
 *
 * These are emails the AI flagged as requiring the user's attention.
 * Sorted by confidence desc (most likely action items first).
 * Shows confidence score and key signals that triggered classification.
 */

import { VList } from 'virtua';
import { useAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { openEmailIdAtom, activeAccountIdAtom } from '@/atoms/mail';
import type { JmapEmail } from '@/lib/mail/types';

interface ActionEmail extends JmapEmail {
  _triage: {
    category: 'ACTION_REQUIRED';
    confidence: number;
    signals: string[];
    classified_at: string;
  };
}

function useFocusEmails(accountId: string | null) {
  return useQuery({
    queryKey: ['upinbox', 'focus', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<ActionEmail[]> => {
      const params = new URLSearchParams({
        accountId: accountId!,
        feed: 'focus',
        action: 'feed',
        limit: '50',
      });
      const res = await fetch(`/api/upinbox/screener?${params}`);
      if (!res.ok) throw new Error(`Focus feed failed: ${res.status}`);
      const { emails } = await res.json();
      return (emails ?? []).filter(
        (e: ActionEmail) => e._triage?.category === 'ACTION_REQUIRED'
      );
    },
    staleTime: 30 * 1000,
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-orange-400' : 'bg-yellow-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function FocusList() {
  const [accountId] = useAtom(activeAccountIdAtom);
  const [openEmailId, setOpenEmailId] = useAtom(openEmailIdAtom);
  const { data: emails = [], isLoading } = useFocusEmails(accountId);

  if (isLoading) {
    return (
      <div className="divide-y">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-4 py-4 space-y-2">
            <div className="h-4 bg-muted rounded animate-pulse w-40" />
            <div className="h-3 bg-muted rounded animate-pulse w-64" />
            <div className="h-2 bg-muted rounded animate-pulse w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
        <span className="text-5xl">🎉</span>
        <div>
          <p className="font-medium">You're all caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">
            No emails need your attention right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
        {emails.length} email{emails.length !== 1 ? 's' : ''} need your attention
      </div>
      <VList className="h-full" style={{ height: 'calc(100% - 33px)' }}>
        {emails
          .sort((a, b) => (b._triage?.confidence ?? 0) - (a._triage?.confidence ?? 0))
          .map((email) => {
            const isOpen = openEmailId === email.id;
            const isRead = email.keywords?.['$seen'] ?? false;
            const sender = email.from?.[0];

            return (
              <div
                key={email.id}
                onClick={() => setOpenEmailId(email.id)}
                className={`
                  flex items-start gap-3 px-4 py-3.5 cursor-pointer border-b transition-colors
                  ${isOpen ? 'bg-accent' : 'hover:bg-muted/30'}
                  ${!isRead ? 'border-l-2 border-l-primary' : ''}
                `}
              >
                {/* Priority indicator */}
                <div className="mt-1 flex-shrink-0">
                  <span className="text-lg">⚡</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold truncate">
                      {sender?.name || sender?.email || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDate(email.receivedAt ?? '')}
                    </span>
                  </div>
                  <div className="text-sm truncate">{email.subject || '(no subject)'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {email.preview ?? ''}
                  </div>
                  <div className="flex items-center gap-3">
                    <ConfidenceBar value={email._triage.confidence} />
                    {email._triage.signals.slice(0, 2).map((sig) => (
                      <span key={sig} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {sig}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
      </VList>
    </div>
  );
}
