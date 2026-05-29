'use client';

import { useEffect, useState } from 'react';

interface ContactPulse {
  id: string;
  name: string;
  email: string;
  sentCount: number;
  receivedCount: number;
  lastContactAt: string | null;
  isVip: boolean;
  daysSinceContact: number | null;
}

interface CommunicationPulseProps {
  accountId: string;
}

type Tab = 'most-active' | 'due-to-connect' | 'vip';

function getInitial(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] ?? '?').toUpperCase();
}

function avatarColor(email: string): string {
  const colors = [
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
  return colors[Math.abs(hash) % colors.length];
}

function formatLastContact(lastContactAt: string | null, daysSince: number | null): string {
  if (!lastContactAt || daysSince === null) return 'Never';
  if (daysSince === 0) return 'Today';
  if (daysSince === 1) return 'Yesterday';
  if (daysSince < 7) return `${daysSince}d ago`;
  if (daysSince < 30) return `${Math.floor(daysSince / 7)}w ago`;
  return `${Math.floor(daysSince / 30)}mo ago`;
}

function StatusBadge({ contact }: { contact: ContactPulse }) {
  if (contact.isVip) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        VIP
      </span>
    );
  }
  if (contact.daysSinceContact !== null && contact.daysSinceContact >= 14) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
        Overdue
      </span>
    );
  }
  const total = contact.sentCount + contact.receivedCount;
  if (total >= 20) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      Quiet
    </span>
  );
}

function ContactRow({ contact }: { contact: ContactPulse }) {
  const isDueToConnect = contact.daysSinceContact !== null && contact.daysSinceContact >= 14;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
        isDueToConnect ? 'border-l-2 border-rose-400 pl-2.5' : ''
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor(contact.email)}`}
        aria-hidden="true"
      >
        {getInitial(contact.name)}
      </div>

      {/* Name + email */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {contact.name}
          </p>
          <StatusBadge contact={contact} />
        </div>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{contact.email}</p>
        {isDueToConnect && (
          <p className="mt-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
            No contact in {contact.daysSinceContact} days — time to reach out
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatLastContact(contact.lastContactAt, contact.daysSinceContact)}
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          <span title="Sent">
            <svg className="inline-block h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2l5 5H9v7H7V7H3l5-5z" />
            </svg>{' '}
            {contact.sentCount}
          </span>
          <span title="Received">
            <svg className="inline-block h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 14L3 9h4V2h2v7h4l-5 5z" />
            </svg>{' '}
            {contact.receivedCount}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, { heading: string; body: string }> = {
    'most-active': {
      heading: 'No contacts yet',
      body: 'Send or receive emails and your most active contacts will appear here.',
    },
    'due-to-connect': {
      heading: "You're all caught up",
      body: 'No contacts have gone 14+ days without a message. Keep it up.',
    },
    vip: {
      heading: 'No VIP contacts',
      body: 'Mark contacts as VIP to surface them here for priority follow-up.',
    },
  };

  const { heading, body } = messages[tab];

  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
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
            d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{heading}</p>
      <p className="mt-1 max-w-xs text-xs text-zinc-400 dark:text-zinc-500">{body}</p>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'most-active', label: 'Most Active' },
  { id: 'due-to-connect', label: 'Due to Connect' },
  { id: 'vip', label: 'VIP' },
];

export function CommunicationPulse({ accountId }: CommunicationPulseProps) {
  const [contacts, setContacts] = useState<ContactPulse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('most-active');

  useEffect(() => {
    if (!accountId) return;

    setLoading(true);
    setError(null);

    fetch(`/api/upinbox/contact-pulses?accountId=${encodeURIComponent(accountId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json() as Promise<ContactPulse[]>;
      })
      .then((data) => {
        setContacts(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load contacts');
      })
      .finally(() => setLoading(false));
  }, [accountId]);

  const filteredContacts = contacts.filter((c) => {
    if (activeTab === 'vip') return c.isVip;
    if (activeTab === 'due-to-connect') {
      return c.daysSinceContact !== null && c.daysSinceContact >= 14;
    }
    // most-active: sort by total message count, already handled in sort below
    return true;
  });

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    if (activeTab === 'most-active') {
      return b.sentCount + b.receivedCount - (a.sentCount + a.receivedCount);
    }
    if (activeTab === 'due-to-connect') {
      return (b.daysSinceContact ?? 0) - (a.daysSinceContact ?? 0);
    }
    // vip: most recent first
    if (!a.lastContactAt && !b.lastContactAt) return 0;
    if (!a.lastContactAt) return 1;
    if (!b.lastContactAt) return -1;
    return new Date(b.lastContactAt).getTime() - new Date(a.lastContactAt).getTime();
  });

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Communication Pulse
        </h2>
        {!loading && contacts.length > 0 && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 px-3 dark:border-zinc-700">
        {TABS.map((tab) => {
          const count =
            tab.id === 'vip'
              ? contacts.filter((c) => c.isVip).length
              : tab.id === 'due-to-connect'
              ? contacts.filter((c) => c.daysSinceContact !== null && c.daysSinceContact >= 14).length
              : contacts.length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {tab.label}
              {!loading && count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    activeTab === tab.id
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-2">
                <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-2.5 w-48 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
                <div className="h-3 w-14 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <button
              onClick={() => setLoading(true)}
              className="mt-3 text-xs text-violet-600 underline underline-offset-2 hover:text-violet-700 dark:text-violet-400"
            >
              Retry
            </button>
          </div>
        ) : sortedContacts.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div className="p-2">
            {sortedContacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
