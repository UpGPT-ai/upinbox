'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SenderCategory = 'vip' | 'active' | 'newsletters' | 'dormant';

interface SenderEntry {
  id: string;
  email: string;
  name: string;
  category: SenderCategory;
  sentCount: number;        // emails we sent to them
  receivedCount: number;    // emails we received from them
  totalCount: number;       // combined
  unreadCount: number;
  lastContactAt: string | null;
  daysSinceContact: number | null;
  isVip: boolean;
  avatarUrl?: string | null;
}

interface SenderViewData {
  senders: SenderEntry[];
}

interface SenderViewProps {
  accountId: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-sky-500', 'bg-emerald-500',
  'bg-rose-500', 'bg-amber-500', 'bg-indigo-500',
  'bg-pink-500', 'bg-teal-500', 'bg-cyan-500', 'bg-orange-500',
];

function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string, email: string): string {
  const src = name.trim() || email;
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (src[0] ?? '?').toUpperCase();
}

function formatLastContact(daysSince: number | null, iso: string | null): string {
  if (!iso || daysSince === null) return 'Never';
  if (daysSince === 0) return 'Today';
  if (daysSince === 1) return 'Yesterday';
  if (daysSince < 7) return `${daysSince}d ago`;
  if (daysSince < 30) return `${Math.floor(daysSince / 7)}w ago`;
  if (daysSince < 365) return `${Math.floor(daysSince / 30)}mo ago`;
  return `${Math.floor(daysSince / 365)}y ago`;
}

// ─── Tabs config ───────────────────────────────────────────────────────────────

const TABS: { id: SenderCategory; label: string }[] = [
  { id: 'vip', label: 'VIP' },
  { id: 'active', label: 'Active' },
  { id: 'newsletters', label: 'Newsletters' },
  { id: 'dormant', label: 'Dormant' },
];

const TAB_DESCRIPTIONS: Record<SenderCategory, string> = {
  vip: 'High-priority contacts you want to track closely.',
  active: 'Contacts you communicate with regularly.',
  newsletters: 'Mailing lists and automated senders.',
  dormant: 'No contact in 60+ days. Safe to archive or clean up.',
};

// ─── Avatar ────────────────────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  email: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
}

function Avatar({ name, email, avatarUrl, size = 'md' }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        className={`${dim} shrink-0 rounded-full object-cover`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarColor(email)}`}
      aria-hidden="true"
    >
      {getInitials(name, email)}
    </div>
  );
}

// ─── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">
        {value.toLocaleString()}
      </span>{' '}
      {label}
    </span>
  );
}

// ─── Sender Row ────────────────────────────────────────────────────────────────

interface SenderRowProps {
  sender: SenderEntry;
  isSelected: boolean;
  onToggleSelect: () => void;
  onMarkVip: () => void;
  onArchive: () => void;
  onCompose: () => void;
  isBusy: boolean;
}

function SenderRow({
  sender,
  isSelected,
  onToggleSelect,
  onMarkVip,
  onArchive,
  onCompose,
  isBusy,
}: SenderRowProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
        isSelected ? 'bg-violet-50/50 dark:bg-violet-900/10' : ''
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-violet-600"
        aria-label={`Select ${sender.name || sender.email}`}
      />

      {/* Avatar */}
      <Avatar name={sender.name} email={sender.email} avatarUrl={sender.avatarUrl} />

      {/* Identity + stats */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {sender.name || sender.email}
          </p>
          {sender.isVip && (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              VIP
            </span>
          )}
          {sender.unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
              {sender.unreadCount} unread
            </span>
          )}
        </div>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{sender.email}</p>
        {/* Mobile stats */}
        <div className="mt-0.5 flex items-center gap-3 sm:hidden">
          <StatChip label="sent" value={sender.sentCount} />
          <StatChip label="recv" value={sender.receivedCount} />
        </div>
      </div>

      {/* Desktop stats */}
      <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatLastContact(sender.daysSinceContact, sender.lastContactAt)}
        </p>
        <div className="flex items-center gap-3">
          <StatChip label="sent" value={sender.sentCount} />
          <StatChip label="recv" value={sender.receivedCount} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onCompose}
          disabled={isBusy}
          title="Compose"
          className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-violet-600 disabled:opacity-40 dark:hover:bg-zinc-700 dark:hover:text-violet-400"
          aria-label={`Compose to ${sender.email}`}
        >
          {/* Compose icon */}
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3l-1-1L2 12.5V14h1.5L13.5 3zM11 4l1 1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onMarkVip}
          disabled={isBusy}
          title={sender.isVip ? 'Remove VIP' : 'Mark VIP'}
          className={`rounded-md p-1.5 transition disabled:opacity-40 ${
            sender.isVip
              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
              : 'text-zinc-400 hover:bg-zinc-100 hover:text-amber-500 dark:hover:bg-zinc-700'
          }`}
          aria-label={sender.isVip ? 'Remove VIP status' : 'Mark as VIP'}
        >
          {/* Star icon */}
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill={sender.isVip ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 1l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 10.6l-3.8 2.2.7-4.3-3.1-3 4.3-.6L8 1z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onArchive}
          disabled={isBusy}
          title="Archive all"
          className="rounded-md p-1.5 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
          aria-label={`Archive all from ${sender.email}`}
        >
          {/* Archive icon */}
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12v1.5l-1 8H3l-1-8V4zm2 0V3a1 1 0 011-1h6a1 1 0 011 1v1M6.5 7v4m3-4v4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Empty states ──────────────────────────────────────────────────────────────

const EMPTY_COPY: Record<SenderCategory, { heading: string; body: string }> = {
  vip: {
    heading: 'No VIP contacts',
    body: 'Star a sender to pin them here for priority tracking.',
  },
  active: {
    heading: 'No active senders',
    body: 'Senders you exchange messages with regularly will appear here.',
  },
  newsletters: {
    heading: 'No newsletters detected',
    body: 'Mailing lists and subscription senders will appear here after scanning.',
  },
  dormant: {
    heading: 'No dormant senders',
    body: 'Contacts with no activity in 60+ days will appear here.',
  },
};

function EmptyState({ tab }: { tab: SenderCategory }) {
  const { heading, body } = EMPTY_COPY[tab];
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
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
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{heading}</p>
      <p className="mt-1 max-w-xs text-xs text-zinc-400 dark:text-zinc-500">{body}</p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SenderView({ accountId }: SenderViewProps) {
  const [data, setData] = useState<SenderViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SenderCategory>('vip');

  // Local overrides: toggled VIP state & archived ids
  const [vipOverrides, setVipOverrides] = useState<Record<string, boolean>>({});
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Bulk dormant selection
  const [dormantSelected, setDormantSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const checkboxAllRef = useRef<HTMLInputElement | null>(null);

  // ── Fetch ──
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/upinbox/senders?accountId=${encodeURIComponent(accountId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SenderViewData>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [accountId]);

  // ── Derived sender list for active tab ──
  const tabSenders = data
    ? data.senders
        .filter((s) => {
          if (archived.has(s.id)) return false;
          const effectiveVip = vipOverrides[s.id] !== undefined ? vipOverrides[s.id] : s.isVip;
          if (activeTab === 'vip') return effectiveVip;
          if (activeTab === 'active') return s.category === 'active' && !effectiveVip;
          if (activeTab === 'newsletters') return s.category === 'newsletters';
          if (activeTab === 'dormant') return s.category === 'dormant';
          return false;
        })
        .sort((a, b) => {
          if (activeTab === 'dormant') {
            return (b.daysSinceContact ?? 0) - (a.daysSinceContact ?? 0);
          }
          return b.totalCount - a.totalCount;
        })
    : [];

  // Sync indeterminate state on the "select all" checkbox
  useEffect(() => {
    if (!checkboxAllRef.current) return;
    const someSelected = dormantSelected.size > 0 && dormantSelected.size < tabSenders.length;
    checkboxAllRef.current.indeterminate = someSelected;
  }, [dormantSelected.size, tabSenders.length]);

  // Tab counts
  const tabCounts: Record<SenderCategory, number> = {
    vip: 0, active: 0, newsletters: 0, dormant: 0,
  };
  if (data) {
    data.senders.forEach((s) => {
      if (archived.has(s.id)) return;
      const effectiveVip = vipOverrides[s.id] !== undefined ? vipOverrides[s.id] : s.isVip;
      if (effectiveVip) tabCounts.vip++;
      else if (s.category === 'active') tabCounts.active++;
      else if (s.category === 'newsletters') tabCounts.newsletters++;
      else if (s.category === 'dormant') tabCounts.dormant++;
    });
  }

  // ── Toggle VIP ──
  const handleMarkVip = useCallback(async (sender: SenderEntry) => {
    const newVal = !(vipOverrides[sender.id] !== undefined ? vipOverrides[sender.id] : sender.isVip);
    setVipOverrides((prev) => ({ ...prev, [sender.id]: newVal }));
    setBusyIds((prev) => new Set(prev).add(sender.id));
    try {
      await fetch('/api/upinbox/senders/vip', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, senderId: sender.id, isVip: newVal }),
      });
    } catch {
      // Revert on failure
      setVipOverrides((prev) => ({ ...prev, [sender.id]: !newVal }));
    } finally {
      setBusyIds((prev) => { const n = new Set(prev); n.delete(sender.id); return n; });
    }
  }, [accountId, vipOverrides]);

  // ── Archive single ──
  const handleArchive = useCallback(async (sender: SenderEntry) => {
    setArchived((prev) => new Set(prev).add(sender.id));
    setBusyIds((prev) => new Set(prev).add(sender.id));
    try {
      await fetch('/api/upinbox/senders/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, senderId: sender.id }),
      });
    } catch {
      setArchived((prev) => { const n = new Set(prev); n.delete(sender.id); return n; });
    } finally {
      setBusyIds((prev) => { const n = new Set(prev); n.delete(sender.id); return n; });
    }
  }, [accountId]);

  // ── Compose (placeholder — opens default mail client or compose modal) ──
  const handleCompose = useCallback((sender: SenderEntry) => {
    window.location.href = `mailto:${sender.email}`;
  }, []);

  // ── Dormant bulk selection ──
  const toggleDormantSelect = useCallback((id: string) => {
    setDormantSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllDormant = useCallback(() => {
    if (dormantSelected.size === tabSenders.length) {
      setDormantSelected(new Set());
    } else {
      setDormantSelected(new Set(tabSenders.map((s) => s.id)));
    }
  }, [dormantSelected.size, tabSenders]);

  // ── Bulk dormant archive ──
  const handleBulkDormantCleanup = useCallback(async () => {
    if (dormantSelected.size === 0) return;
    setBulkStatus('running');
    const ids = [...dormantSelected];

    // Optimistically remove from view
    setArchived((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setDormantSelected(new Set());

    try {
      await fetch('/api/upinbox/senders/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, senderIds: ids }),
      });
      setBulkStatus('done');
    } catch {
      // Revert archived state
      setArchived((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setBulkStatus('error');
    }
  }, [accountId, dormantSelected]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        {/* Tab skeleton */}
        <div className="flex gap-1 border-b border-zinc-200 px-3 dark:border-zinc-700">
          {TABS.map((t) => (
            <div key={t.id} className="my-2.5 h-5 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
        {/* Row skeletons */}
        <div className="space-y-0.5 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-2.5">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-36 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-2.5 w-52 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <div className="hidden h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800 sm:block" />
              <div className="flex gap-1">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="h-7 w-7 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-900/10">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Unable to load senders
        </p>
        {error && <p className="text-xs text-red-400 dark:text-red-500">{error}</p>}
      </div>
    );
  }

  const isDormantTab = activeTab === 'dormant';
  const allDormantSelected =
    tabSenders.length > 0 && dormantSelected.size === tabSenders.length;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* ── Tabs ── */}
      <div className="flex items-end gap-0 border-b border-zinc-200 px-3 dark:border-zinc-700">
        {TABS.map((tab) => {
          const count = tabCounts[tab.id];
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setDormantSelected(new Set());
                setBulkStatus('idle');
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-violet-500 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab description ── */}
      <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-700/60">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {TAB_DESCRIPTIONS[activeTab]}
        </p>
      </div>

      {/* ── Dormant bulk action bar ── */}
      {isDormantTab && tabSenders.length > 0 && (
        <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-zinc-700/60 dark:bg-zinc-800/50">
          <input
            ref={checkboxAllRef}
            type="checkbox"
            checked={allDormantSelected}
            onChange={toggleSelectAllDormant}
            className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 accent-violet-600"
            aria-label="Select all dormant senders"
          />

          {dormantSelected.size > 0 ? (
            <>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {dormantSelected.size} selected
              </span>
              <button
                type="button"
                onClick={handleBulkDormantCleanup}
                disabled={bulkStatus === 'running'}
                className="ml-auto rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
              >
                {bulkStatus === 'running'
                  ? 'Archiving…'
                  : `Archive ${dormantSelected.size} sender${dormantSelected.size !== 1 ? 's' : ''}`}
              </button>
              {bulkStatus === 'done' && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Archived
                </span>
              )}
              {bulkStatus === 'error' && (
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  Failed — retrying
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Select senders to bulk archive
            </span>
          )}
        </div>
      )}

      {/* ── Sender list ── */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
        {tabSenders.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          tabSenders.map((sender) => (
            <div key={sender.id} className="flex items-center gap-0">
              {/* Dormant checkbox — only shown on dormant tab */}
              {isDormantTab ? (
                <SenderRow
                  sender={sender}
                  isSelected={dormantSelected.has(sender.id)}
                  onToggleSelect={() => toggleDormantSelect(sender.id)}
                  onMarkVip={() => handleMarkVip(sender)}
                  onArchive={() => handleArchive(sender)}
                  onCompose={() => handleCompose(sender)}
                  isBusy={busyIds.has(sender.id)}
                />
              ) : (
                <SenderRow
                  sender={sender}
                  isSelected={false}
                  onToggleSelect={() => {}}
                  onMarkVip={() => handleMarkVip(sender)}
                  onArchive={() => handleArchive(sender)}
                  onCompose={() => handleCompose(sender)}
                  isBusy={busyIds.has(sender.id)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
