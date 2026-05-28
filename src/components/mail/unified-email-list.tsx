'use client';

/**
 * UnifiedEmailList — shows emails from ALL accounts merged by date.
 * Uses GET /api/upinbox/unified
 */

import { useState } from 'react';
import { useAtom } from 'jotai';
import { useQuery } from '@tanstack/react-query';
import { openEmailIdAtom, activeAccountIdAtom } from '@/atoms/mail';

interface UnifiedEmail {
  id: string;
  subject?: string;
  from?: { email: string; name?: string }[];
  receivedAt?: string;
  keywords?: Record<string, boolean>;
  preview?: string;
  hasAttachment?: boolean;
  _accountId: string;
  _accountEmail: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isThisYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(isThisYear ? {} : { year: 'numeric' }) });
}

function senderName(email: UnifiedEmail) {
  const f = email.from?.[0];
  if (!f) return '(no sender)';
  return f.name || f.email;
}

export function UnifiedEmailList() {
  const [openEmailId, setOpenEmailId] = useAtom(openEmailIdAtom);
  const [, setActiveAccountId] = useAtom(activeAccountIdAtom);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
  if (search) params.set('search', search);

  const { data, isLoading } = useQuery({
    queryKey: ['upinbox-unified', page, search],
    queryFn: async () => {
      const res = await fetch(`/api/upinbox/unified?${params}`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ emails: UnifiedEmail[]; total: number; accounts: { id: string; email: string }[] }>;
    },
    staleTime: 30_000,
  });

  const emails = data?.emails ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <span className="font-medium text-sm">📬 All Inboxes</span>
        <span className="text-xs text-muted-foreground">({data?.accounts?.length ?? 0} accounts)</span>
        <div className="flex-1" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search…"
          className="text-xs border rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary w-36"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-0">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="px-4 py-3 border-b flex gap-3 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && emails.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
            <span className="text-3xl">📭</span>
            <span>No emails across all accounts</span>
          </div>
        )}

        {emails.map((email) => {
          const isOpen = openEmailId === email.id;
          const isRead = email.keywords?.['$seen'] ?? false;
          const isFlagged = email.keywords?.['$flagged'] ?? false;

          return (
            <div
              key={`${email._accountId}:${email.id}`}
              onClick={() => {
                setOpenEmailId(email.id);
                setActiveAccountId(email._accountId);
              }}
              className={`
                px-4 py-3 border-b cursor-pointer transition-colors select-none
                ${isOpen ? 'bg-accent' : 'hover:bg-muted/50'}
              `}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {!isRead && (
                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  )}
                  <span className={`text-sm truncate ${!isRead ? 'font-semibold' : 'font-normal text-muted-foreground'}`}>
                    {senderName(email)}
                  </span>
                  {isFlagged && <span className="text-amber-500 text-xs flex-shrink-0">⚑</span>}
                  {email.hasAttachment && <span className="text-muted-foreground text-xs flex-shrink-0">📎</span>}
                </div>
                <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {email.receivedAt ? formatDate(email.receivedAt) : ''}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[80px]">
                    {email._accountEmail.split('@')[0]}
                  </span>
                </div>
              </div>
              <div className={`text-xs truncate ${!isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                {email.subject || '(no subject)'}
              </div>
              {email.preview && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {email.preview}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="hover:text-foreground disabled:opacity-40"
          >
            ← Prev
          </button>
          <span>Page {page + 1} of {Math.ceil(total / limit)}</span>
          <button
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage((p) => p + 1)}
            className="hover:text-foreground disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
