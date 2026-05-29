'use client';

import { useEffect, useRef, useState } from 'react';

interface Subscription {
  id: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  receivedCount: number;
  lastReceivedAt: string;
  action: 'keep' | 'digest' | 'unsubscribe' | null;
}

interface SubscriptionsManagerProps {
  accountId: string;
}

type BulkSelection = Set<string>;

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

const ACTION_STYLES: Record<string, string> = {
  keep: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  digest: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800',
  unsubscribe: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
};

const ACTION_LABELS: Record<string, string> = {
  keep: 'Keep',
  digest: 'Digest',
  unsubscribe: 'Unsub',
};

function ActionButton({
  label,
  active,
  variant,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  variant: 'keep' | 'digest' | 'unsubscribe';
  onClick: () => void;
  disabled?: boolean;
}) {
  const activeStyle = ACTION_STYLES[variant];
  const idleStyle =
    'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 dark:hover:text-zinc-200';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? activeStyle : idleStyle
      }`}
    >
      {label}
    </button>
  );
}

function SubscriptionRow({
  sub,
  selected,
  onToggleSelect,
  onAction,
  saving,
}: {
  sub: Subscription;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onAction: (id: string, action: 'keep' | 'digest' | 'unsubscribe') => void;
  saving: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
        selected ? 'bg-violet-50 dark:bg-violet-900/10' : ''
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(sub.id)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-800"
        aria-label={`Select ${sub.senderName}`}
      />

      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
        {getInitial(sub.senderName)}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {sub.senderName}
          </p>
          <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {sub.receivedCount}
          </span>
        </div>
        <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{sub.senderEmail}</p>
        <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
          Last: {formatDate(sub.lastReceivedAt)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {(['keep', 'digest', 'unsubscribe'] as const).map((action) => (
          <ActionButton
            key={action}
            label={ACTION_LABELS[action]}
            active={sub.action === action}
            variant={action}
            onClick={() => onAction(sub.id, action)}
            disabled={saving}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-400"
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
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No newsletters found</p>
      <p className="mt-1 max-w-xs text-xs text-zinc-400 dark:text-zinc-500">
        When UpInbox detects newsletter senders in your inbox, they will appear here for you to
        manage.
      </p>
    </div>
  );
}

export function SubscriptionsManager({ accountId }: SubscriptionsManagerProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BulkSelection>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [bulkUnsubbing, setBulkUnsubbing] = useState(false);
  const [search, setSearch] = useState('');
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!accountId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/upinbox/subscriptions?accountId=${encodeURIComponent(accountId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json() as Promise<Subscription[]>;
      })
      .then(setSubscriptions)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
      })
      .finally(() => setLoading(false));
  }, [accountId]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const visible = filtered.map((s) => s.id);
    const allSelected = visible.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visible.forEach((id) => next.delete(id));
      } else {
        visible.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function handleAction(id: string, action: 'keep' | 'digest' | 'unsubscribe') {
    // Optimistic update
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, action } : s))
    );

    // Debounce save
    const existing = saveTimers.current.get(id);
    if (existing) clearTimeout(existing);

    setSaving((prev) => new Set(prev).add(id));

    const timer = setTimeout(async () => {
      try {
        await fetch('/api/upinbox/subscriptions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, id, action }),
        });
      } catch {
        // Silently fail — optimistic state stays, user can retry
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        saveTimers.current.delete(id);
      }
    }, 600);

    saveTimers.current.set(id, timer);
  }

  async function handleBulkUnsubscribe() {
    if (selected.size === 0) return;
    setBulkUnsubbing(true);

    const ids = Array.from(selected);

    // Optimistic
    setSubscriptions((prev) =>
      prev.map((s) => (ids.includes(s.id) ? { ...s, action: 'unsubscribe' } : s))
    );
    setSelected(new Set());

    try {
      await fetch('/api/upinbox/subscriptions/bulk-unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, ids }),
      });
    } catch {
      // Optimistic state stays
    } finally {
      setBulkUnsubbing(false);
    }
  }

  const filtered = subscriptions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.senderName.toLowerCase().includes(q) ||
      s.senderEmail.toLowerCase().includes(q) ||
      s.subject.toLowerCase().includes(q)
    );
  });

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const someVisibleSelected = filtered.some((s) => selected.has(s.id));

  const summary = {
    keep: subscriptions.filter((s) => s.action === 'keep').length,
    digest: subscriptions.filter((s) => s.action === 'digest').length,
    unsubscribe: subscriptions.filter((s) => s.action === 'unsubscribe').length,
    unset: subscriptions.filter((s) => s.action === null).length,
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Newsletter Manager
          </h2>
          {!loading && subscriptions.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
              {summary.keep > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {summary.keep} kept
                </span>
              )}
              {summary.digest > 0 && (
                <span className="text-sky-600 dark:text-sky-400">
                  {summary.digest} digest
                </span>
              )}
              {summary.unsubscribe > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  {summary.unsubscribe} unsubbed
                </span>
              )}
              {summary.unset > 0 && <span>{summary.unset} pending</span>}
            </div>
          )}
        </div>

        {/* Search */}
        {!loading && subscriptions.length > 0 && (
          <div className="relative mt-2.5">
            <svg
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search senders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-3 text-xs text-zinc-700 placeholder-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500"
            />
          </div>
        )}
      </div>

      {/* Bulk toolbar */}
      {someVisibleSelected && (
        <div className="flex items-center justify-between border-b border-zinc-200 bg-violet-50 px-4 py-2 dark:border-zinc-700 dark:bg-violet-900/10">
          <p className="text-xs text-violet-700 dark:text-violet-400">
            {selected.size} selected
          </p>
          <button
            onClick={handleBulkUnsubscribe}
            disabled={bulkUnsubbing}
            className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkUnsubbing ? (
              <>
                <svg
                  className="h-3 w-3 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
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
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Unsubscribing...
              </>
            ) : (
              `Unsubscribe ${selected.size}`
            )}
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-2.5">
                <div className="h-4 w-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-2.5 w-44 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((j) => (
                    <div
                      key={j}
                      className="h-6 w-12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          </div>
        ) : subscriptions.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No results for &ldquo;{search}&rdquo;
            </p>
          </div>
        ) : (
          <div className="p-2">
            {/* Select-all row */}
            <div className="mb-1 flex items-center gap-2 px-3 py-1.5">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-800"
                aria-label="Select all visible"
              />
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Select all ({filtered.length})
              </span>
            </div>

            {filtered.map((sub) => (
              <SubscriptionRow
                key={sub.id}
                sub={sub}
                selected={selected.has(sub.id)}
                onToggleSelect={toggleSelect}
                onAction={handleAction}
                saving={saving.has(sub.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
