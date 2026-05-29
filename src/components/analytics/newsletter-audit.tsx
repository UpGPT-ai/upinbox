'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NewsletterSender {
  id: string;
  email: string;
  name: string;
  totalReceived: number;
  readCount: number;
  unreadCount: number;
  lastReceivedAt: string | null;
  wasteScore: number; // 0–100; higher = more wasteful
  listUnsubUrl: string | null;
}

interface NewsletterAuditData {
  totalNewsletters: number;
  totalRead: number;
  totalUnread: number;
  senders: NewsletterSender[];
}

type SenderAction = 'keep' | 'digest' | 'unsub';

interface NewsletterAuditProps {
  accountId: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(email: string): string {
  const palette = [
    'bg-violet-500',
    'bg-sky-500',
    'bg-emerald-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-indigo-500',
    'bg-pink-500',
    'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name: string, email: string): string {
  const src = name.trim() || email;
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (src[0] ?? '?').toUpperCase();
}

function wasteLabel(score: number): { label: string; className: string } {
  if (score >= 70) return { label: 'High waste', className: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400' };
  if (score >= 40) return { label: 'Med waste', className: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' };
  return { label: 'Low waste', className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' };
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}

// ─── SVG Donut Chart ───────────────────────────────────────────────────────────

interface DonutChartProps {
  read: number;
  unread: number;
  size?: number;
}

function DonutChart({ read, unread, size = 120 }: DonutChartProps) {
  const total = read + unread;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 20) / 2;
  const circumference = 2 * Math.PI * r;

  const readPct = total > 0 ? read / total : 0;
  const unreadPct = total > 0 ? unread / total : 1;

  // Read arc starts at top (-90deg), Unread arc follows
  const readDash = readPct * circumference;
  const unreadDash = unreadPct * circumference;
  const readOffset = 0; // starts at top (rotate -90 on the SVG)
  const unreadOffset = -(readDash); // picks up where read ends

  const readPctDisplay = total > 0 ? Math.round(readPct * 100) : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${readPctDisplay}% of newsletters read`}
      role="img"
    >
      {/* Background track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={10}
      />

      {/* Unread arc (rose) */}
      {unread > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#f43f5e"
          strokeWidth={10}
          strokeLinecap="butt"
          strokeDasharray={`${unreadDash} ${circumference - unreadDash}`}
          strokeDashoffset={unreadOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}

      {/* Read arc (emerald) — drawn on top so it starts cleanly at top */}
      {read > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#10b981"
          strokeWidth={10}
          strokeLinecap="butt"
          strokeDasharray={`${readDash} ${circumference - readDash}`}
          strokeDashoffset={readOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}

      {/* Center label */}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={size * 0.2}
        fontWeight="700"
        fill="#111827"
      >
        {readPctDisplay}%
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={size * 0.09}
        fill="#9ca3af"
      >
        read
      </text>
    </svg>
  );
}

// ─── Action Button ─────────────────────────────────────────────────────────────

interface ActionBtnProps {
  action: SenderAction;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const ACTION_STYLES: Record<SenderAction, { idle: string; active: string; label: string }> = {
  keep: {
    label: 'Keep',
    idle: 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800',
    active: 'border border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  digest: {
    label: 'Digest',
    idle: 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800',
    active: 'border border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-400',
  },
  unsub: {
    label: 'Unsub',
    idle: 'border border-gray-200 text-gray-600 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-rose-900/20 dark:hover:text-rose-400',
    active: 'border border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-500 dark:bg-rose-900/30 dark:text-rose-400',
  },
};

function ActionBtn({ action, active, disabled, onClick }: ActionBtnProps) {
  const styles = ACTION_STYLES[action];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        active ? styles.active : styles.idle
      }`}
    >
      {styles.label}
    </button>
  );
}

// ─── Sender Row ────────────────────────────────────────────────────────────────

interface SenderRowProps {
  sender: NewsletterSender;
  action: SenderAction | null;
  selected: boolean;
  onAction: (action: SenderAction) => void;
  onToggleSelect: () => void;
  pendingUnsub: boolean;
}

function SenderRow({
  sender,
  action,
  selected,
  onAction,
  onToggleSelect,
  pendingUnsub,
}: SenderRowProps) {
  const readRate = sender.totalReceived > 0
    ? Math.round((sender.readCount / sender.totalReceived) * 100)
    : 0;
  const waste = wasteLabel(sender.wasteScore);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
        selected ? 'bg-violet-50/60 dark:bg-violet-900/10' : ''
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-violet-600"
        aria-label={`Select ${sender.name || sender.email}`}
      />

      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(sender.email)}`}
        aria-hidden="true"
      >
        {getInitials(sender.name, sender.email)}
      </div>

      {/* Name + email + waste badge */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {sender.name || sender.email}
          </p>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${waste.className}`}
          >
            {waste.label}
          </span>
        </div>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{sender.email}</p>
      </div>

      {/* Stats */}
      <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {readRate}% read
        </p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {sender.totalReceived} total · {formatDate(sender.lastReceivedAt)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {(['keep', 'digest', 'unsub'] as SenderAction[]).map((a) => (
          <ActionBtn
            key={a}
            action={a}
            active={action === a}
            disabled={pendingUnsub && a === 'unsub'}
            onClick={() => onAction(a)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-7 w-7 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        No newsletters detected
      </p>
      <p className="mt-1 max-w-xs text-xs text-zinc-400 dark:text-zinc-500">
        Newsletter senders will appear here once your inbox has been scanned.
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function NewsletterAudit({ accountId }: NewsletterAuditProps) {
  const [data, setData] = useState<NewsletterAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-sender action decisions: senderId → action
  const [actions, setActions] = useState<Record<string, SenderAction>>({});
  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Unsub in-flight set
  const [unsubbing, setUnsubbing] = useState<Set<string>>(new Set());
  // Batch unsub status
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  // ── Fetch ──
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/upinbox/newsletter-audit?accountId=${encodeURIComponent(accountId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<NewsletterAuditData>;
      })
      .then((json) => {
        if (!cancelled) {
          // Sort by wasteScore descending on first load
          json.senders.sort((a, b) => b.wasteScore - a.wasteScore);
          setData(json);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [accountId]);

  // ── Single sender unsub ──
  const handleAction = useCallback(
    async (senderId: string, action: SenderAction) => {
      setActions((prev) => ({ ...prev, [senderId]: action }));

      if (action !== 'unsub') return;

      setUnsubbing((prev) => new Set(prev).add(senderId));
      try {
        await fetch('/api/upinbox/newsletter-unsub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, senderId }),
        });
      } catch {
        // Non-fatal — action state still recorded
      } finally {
        setUnsubbing((prev) => {
          const next = new Set(prev);
          next.delete(senderId);
          return next;
        });
      }
    },
    [accountId]
  );

  // ── Toggle row selection ──
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!data) return;
    if (selected.size === data.senders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.senders.map((s) => s.id)));
    }
  }, [data, selected.size]);

  // ── Batch unsub ──
  const handleBatchUnsub = useCallback(async () => {
    if (selected.size === 0 || !data) return;
    setBatchStatus('running');
    const ids = [...selected];

    // Optimistically mark all as unsub
    setActions((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = 'unsub'; });
      return next;
    });

    try {
      await fetch('/api/upinbox/newsletter-batch-unsub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, senderIds: ids }),
      });
      setBatchStatus('done');
      setSelected(new Set());
    } catch {
      setBatchStatus('error');
    }
  }, [accountId, data, selected]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <div className="h-[120px] w-[120px] animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-48 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-1 py-2">
            <div className="h-3.5 w-3.5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-36 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-2.5 w-52 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-6 w-12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-900/10">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Unable to load newsletter audit
        </p>
        {error && <p className="text-xs text-red-400 dark:text-red-500">{error}</p>}
      </div>
    );
  }

  const allSelected =
    data.senders.length > 0 && selected.size === data.senders.length;
  const someSelected = selected.size > 0 && !allSelected;
  const unsubSelectedCount = [...selected].filter(
    (id) => actions[id] !== 'unsub'
  ).length;

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* ── Header + donut ── */}
      <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 dark:border-zinc-700 sm:flex-row sm:items-center">
        {/* Donut */}
        <div className="shrink-0">
          <DonutChart
            read={data.totalRead}
            unread={data.totalUnread}
            size={120}
          />
        </div>

        {/* Summary */}
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Newsletter Audit
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {data.totalNewsletters.toLocaleString()} newsletters from{' '}
              {data.senders.length} sender{data.senders.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-zinc-600 dark:text-zinc-400">
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {data.totalRead.toLocaleString()}
                </strong>{' '}
                read
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-zinc-600 dark:text-zinc-400">
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {data.totalUnread.toLocaleString()}
                </strong>{' '}
                unread
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {data.senders.length > 0 && (
        <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-zinc-700/60 dark:bg-zinc-800/50">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleSelectAll}
            className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-violet-600"
            aria-label="Select all senders"
          />
          {selected.size > 0 ? (
            <>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {selected.size} selected
              </span>
              <button
                type="button"
                onClick={handleBatchUnsub}
                disabled={batchStatus === 'running' || unsubSelectedCount === 0}
                className="ml-auto rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {batchStatus === 'running'
                  ? 'Unsubscribing…'
                  : `Unsub ${unsubSelectedCount > 0 ? unsubSelectedCount : selected.size} sender${selected.size !== 1 ? 's' : ''}`}
              </button>
              {batchStatus === 'done' && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Done
                </span>
              )}
              {batchStatus === 'error' && (
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  Some failed
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Select senders to bulk unsubscribe
            </span>
          )}
        </div>
      )}

      {/* ── Table header ── */}
      {data.senders.length > 0 && (
        <div className="hidden grid-cols-[1.5rem_2rem_1fr_8rem_9rem] items-center gap-3 border-b border-zinc-100 px-4 py-1.5 dark:border-zinc-700/60 sm:grid">
          <span />
          <span />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Sender
          </span>
          <span className="text-right text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Read rate
          </span>
          <span className="text-right text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Action
          </span>
        </div>
      )}

      {/* ── Sender list ── */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
        {data.senders.length === 0 ? (
          <EmptyState />
        ) : (
          data.senders.map((sender) => (
            <SenderRow
              key={sender.id}
              sender={sender}
              action={actions[sender.id] ?? null}
              selected={selected.has(sender.id)}
              onAction={(a) => handleAction(sender.id, a)}
              onToggleSelect={() => toggleSelect(sender.id)}
              pendingUnsub={unsubbing.has(sender.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
