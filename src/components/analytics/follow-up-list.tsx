'use client';

/**
 * FollowUpList — displays active follow-up reminders for an account.
 *
 * Fetches GET /api/upinbox/follow-ups?accountId=... on mount.
 * Each row shows: thread subject + formatted remind date + Cancel button.
 * Cancel sends DELETE /api/upinbox/follow-ups/:id and removes the row optimistically.
 *
 * Empty state, loading skeleton, and error state are all handled.
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FollowUpListProps {
  accountId: string;
}

interface FollowUp {
  id: string;
  emailId: string;
  threadSubject: string | null;
  remindAt: string; // ISO-8601
  createdAt: string;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Formats a remind-at ISO string to a human-readable label.
 * e.g. "Thu, Jun 5 at 9:00 AM"
 */
function formatRemindDate(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 animate-pulse">
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-muted rounded w-2/3" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
      <div className="h-7 w-16 bg-muted rounded-md" />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FollowUpList({ accountId }: FollowUpListProps) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ accountId });
      const res = await fetch(`/api/upinbox/follow-ups?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const data: FollowUp[] = await res.json();
      setFollowUps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  // ── Cancel ─────────────────────────────────────────────────────────────────

  const handleCancel = async (id: string) => {
    // Optimistic removal
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
    setCancelling((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/upinbox/follow-ups/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        // Restore on failure
        fetchFollowUps();
      }
    } catch {
      // Restore on network error
      fetchFollowUps();
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        {[1, 2, 3].map((n) => (
          <SkeletonRow key={n} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card px-4 py-6 text-center space-y-2">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={fetchFollowUps}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (followUps.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-4 py-10 flex flex-col items-center gap-2 text-center">
        <span className="text-3xl">📭</span>
        <p className="text-sm font-medium text-foreground">No follow-ups scheduled</p>
        <p className="text-xs text-muted-foreground">
          Use the follow-up button on any email to set a reminder.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {followUps.map((followUp) => (
        <div
          key={followUp.id}
          className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-accent/40 transition-colors"
        >
          {/* Icon */}
          <span className="text-lg flex-shrink-0 leading-none" aria-hidden>
            📬
          </span>

          {/* Subject + date */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground truncate">
              {followUp.threadSubject ?? '(no subject)'}
            </p>
            <p className="text-xs text-muted-foreground">
              Remind {formatRemindDate(followUp.remindAt)}
            </p>
          </div>

          {/* Cancel button */}
          <button
            onClick={() => handleCancel(followUp.id)}
            disabled={cancelling.has(followUp.id)}
            aria-label={`Cancel follow-up for ${followUp.threadSubject ?? 'email'}`}
            className={[
              'flex-shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors',
              'text-muted-foreground border-border hover:border-destructive hover:text-destructive',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {cancelling.has(followUp.id) ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      ))}
    </div>
  );
}
