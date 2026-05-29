'use client';

/**
 * ResponseInsights — response-tracking analytics panel.
 *
 * Displays:
 *   - Average time the user takes to reply to inbound emails (avg response out)
 *   - Average time contacts take to reply to the user (avg response in)
 *   - Count of sent emails that have never received a reply
 *   - "Needs Reply" list — outbound emails with no reply after N days,
 *     each with a one-click follow-up button
 *
 * Data sources:
 *   GET /api/upinbox/analytics/response-rate?accountId=...
 *   GET /api/upinbox/analytics/needs-reply?accountId=...&days=7
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResponseInsightsProps {
  accountId: string;
}

interface ResponseRateData {
  avgResponseHrsOut: number;
  avgResponseHrsIn: number;
  unrepliedSent: number;
  fastestReply: string;
  slowestReply: string;
}

interface NeedsReplyEmail {
  id: string;
  subject: string;
  to: string;
  sentAt: string; // ISO-8601
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatHours(hrs: number): string {
  if (hrs === 0) return '--';
  if (hrs < 1) return `${Math.round(hrs * 60)} min`;
  if (hrs < 24) return `${hrs.toFixed(1)} hr`;
  return `${(hrs / 24).toFixed(1)} days`;
}

function formatSentDate(iso: string): string {
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="text-2xl font-semibold text-gray-800">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-gray-100" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ResponseInsights({ accountId }: ResponseInsightsProps) {
  const [rateData, setRateData] = useState<ResponseRateData | null>(null);
  const [needsReply, setNeedsReply] = useState<NeedsReplyEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followingUp, setFollowingUp] = useState<Set<string>>(new Set());
  const [followedUp, setFollowedUp] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const [rateRes, needsRes] = await Promise.all([
        fetch(`/api/upinbox/analytics/response-rate?accountId=${encodeURIComponent(accountId)}`),
        fetch(`/api/upinbox/analytics/needs-reply?accountId=${encodeURIComponent(accountId)}&days=7`),
      ]);

      if (!rateRes.ok) throw new Error('Failed to load response-rate analytics');
      if (!needsRes.ok) throw new Error('Failed to load needs-reply list');

      const rateJson: ResponseRateData = await rateRes.json();
      const needsJson: { emails: NeedsReplyEmail[] } = await needsRes.json();

      setRateData(rateJson);
      setNeedsReply(needsJson.emails ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFollowUp = useCallback(
    async (email: NeedsReplyEmail) => {
      if (followingUp.has(email.id) || followedUp.has(email.id)) return;
      setFollowingUp((prev) => new Set(prev).add(email.id));
      try {
        // TODO: wire up to a real follow-up creation endpoint
        // await fetch('/api/upinbox/follow-ups', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ accountId, emailId: email.id }),
        // });
        await new Promise((r) => setTimeout(r, 500)); // placeholder latency
        setFollowedUp((prev) => new Set(prev).add(email.id));
      } finally {
        setFollowingUp((prev) => {
          const next = new Set(prev);
          next.delete(email.id);
          return next;
        });
      }
    },
    [followingUp, followedUp],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
        {error}{' '}
        <button
          className="ml-2 underline hover:no-underline"
          onClick={fetchData}
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = rateData ?? {
    avgResponseHrsOut: 0,
    avgResponseHrsIn: 0,
    unrepliedSent: 0,
    fastestReply: '--',
    slowestReply: '--',
  };

  return (
    <div className="space-y-4">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Avg reply time (you)"
          value={formatHours(stats.avgResponseHrsOut)}
          sub="How fast you reply to inbound"
        />
        <StatCard
          label="Avg reply time (them)"
          value={formatHours(stats.avgResponseHrsIn)}
          sub="How fast contacts reply to you"
        />
        <StatCard
          label="Unreplied sent"
          value={stats.unrepliedSent === 0 ? '0' : String(stats.unrepliedSent)}
          sub="Outbound with no response"
        />
        <div className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Reply range
          </span>
          <span className="text-sm font-semibold text-green-600">
            {stats.fastestReply !== '--' ? `Fast: ${stats.fastestReply}` : '--'}
          </span>
          <span className="text-sm font-semibold text-amber-500">
            {stats.slowestReply !== '--' ? `Slow: ${stats.slowestReply}` : '--'}
          </span>
        </div>
      </div>

      {/* ── Needs Reply list ── */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Needs Reply{' '}
            {needsReply.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {needsReply.length}
              </span>
            )}
          </h3>
          <span className="text-xs text-gray-400">Sent 7+ days ago, no reply</span>
        </div>

        {needsReply.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            All caught up — no emails are waiting on a reply.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {needsReply.map((email) => {
              const isPending = followingUp.has(email.id);
              const isDone = followedUp.has(email.id);
              return (
                <li
                  key={email.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {email.subject || '(no subject)'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-400">
                      To: {email.to} &middot; Sent {formatSentDate(email.sentAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleFollowUp(email)}
                    disabled={isPending || isDone}
                    className={[
                      'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      isDone
                        ? 'cursor-default bg-green-50 text-green-600'
                        : isPending
                          ? 'cursor-wait bg-gray-100 text-gray-400'
                          : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
                    ].join(' ')}
                  >
                    {isDone ? 'Scheduled' : isPending ? 'Scheduling...' : 'Follow Up'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
