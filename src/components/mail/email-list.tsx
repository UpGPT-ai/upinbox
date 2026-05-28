'use client';

/**
 * EmailList — virtualized list with search bar, sort toggle, advanced filters,
 * and bulk action bar.
 */

import { useState } from 'react';
import { VList } from 'virtua';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import {
  openEmailIdAtom,
  selectedEmailIdsAtom,
  searchFiltersAtom,
  isSearchActiveAtom,
  sortDirAtom,
  activeAccountIdAtom,
} from '@/atoms/mail';
import { useEmails, useEmailMutations } from '@/hooks/use-emails';
import { useMailboxes } from '@/hooks/use-mailboxes';
import type { JmapEmail } from '@/lib/mail/types';
import type { SearchFilters } from '@/atoms/mail';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isThisYear) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatSender(email: JmapEmail): string {
  const from = email.from?.[0];
  if (!from) return 'Unknown';
  return from.name || from.email;
}

// ─── Search Bar ───────────────────────────────────────────────────────────────

function SearchBar() {
  const [filters, setFilters] = useAtom(searchFiltersAtom);
  const [sortDir, setSortDir] = useAtom(sortDirAtom);
  const isActive = useAtomValue(isSearchActiveAtom);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = (field: keyof SearchFilters, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearAll = () => {
    setFilters({ query: '', from: '', subject: '', after: '', before: '', hasAttachment: false });
    setShowAdvanced(false);
  };

  return (
    <div className="border-b flex-shrink-0">
      {/* Main search row */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="text-muted-foreground text-sm flex-shrink-0 pl-1">🔍</span>
        <input
          type="text"
          value={filters.query}
          onChange={(e) => updateFilter('query', e.target.value)}
          placeholder="Search emails…"
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60 min-w-0"
        />

        {/* Clear */}
        {isActive && (
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
            title="Clear search"
          >
            ✕
          </button>
        )}

        {/* Sort direction toggle */}
        <button
          onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            sortDir === 'asc' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          }`}
          title={sortDir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
        >
          {sortDir === 'desc' ? '↓ Date' : '↑ Date'}
        </button>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            showAdvanced ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          }`}
          title="Advanced filters"
        >
          Filters
        </button>
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div className="px-3 pb-3 space-y-2 bg-muted/30 border-t">
          <div className="grid grid-cols-2 gap-2 pt-2">
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">From</span>
              <input
                type="text"
                value={filters.from}
                onChange={(e) => updateFilter('from', e.target.value)}
                placeholder="sender@example.com"
                className="w-full text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/50"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Subject</span>
              <input
                type="text"
                value={filters.subject}
                onChange={(e) => updateFilter('subject', e.target.value)}
                placeholder="Contains…"
                className="w-full text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/50"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">After</span>
              <input
                type="date"
                value={filters.after}
                onChange={(e) => updateFilter('after', e.target.value)}
                className="w-full text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/50"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Before</span>
              <input
                type="date"
                value={filters.before}
                onChange={(e) => updateFilter('before', e.target.value)}
                className="w-full text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary/50"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasAttachment}
              onChange={(e) => updateFilter('hasAttachment', e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">Has attachment</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ─── List Header (master checkbox + count + bulk actions) ─────────────────────

const TRASH_ROLES = new Set(['trash', 'junk', 'spam']);

interface ListHeaderProps {
  selectedIds: Set<string>;
  allEmails: JmapEmail[];
  mailboxRole: string | null;
  mailboxName: string;
  mailboxId: string;
  accountId: string | null;
  onClear: () => void;
  onSelectAll: () => void;
}

function ListHeader({ selectedIds, allEmails, mailboxRole, mailboxName, mailboxId, accountId, onClear, onSelectAll }: ListHeaderProps) {
  const { bulkDelete, bulkMarkRead, bulkFlag } = useEmailMutations();
  const queryClient = useQueryClient();
  const [emptying, setEmptying] = useState(false);
  const ids = [...selectedIds];
  const count = ids.length;
  const total = allEmails.length;
  const allSelected = total > 0 && count === total;
  const partialSelected = count > 0 && !allSelected;
  const anySelected = count > 0;
  const isPending = bulkDelete.isPending || bulkMarkRead.isPending || bulkFlag.isPending || emptying;
  const isTrashLike = mailboxRole && TRASH_ROLES.has(mailboxRole);

  const run = async (fn: () => Promise<void>) => { await fn(); onClear(); };

  const handleMasterCheck = () => {
    if (allSelected) onClear();
    else onSelectAll();
  };

  const handleEmptyFolder = async () => {
    const msg = isTrashLike
      ? `Permanently delete ALL emails in ${mailboxName}? This cannot be undone.`
      : `Move ALL emails in ${mailboxName} to Trash?`;
    if (!window.confirm(msg)) return;
    setEmptying(true);
    try {
      const res = await fetch('/api/upinbox/mailboxes/empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, mailboxId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.error ?? res.status}`);
        return;
      }
      onClear();
      // Invalidate so the list refreshes to empty
      queryClient.invalidateQueries({ queryKey: ['upinbox', 'emails'] });
    } finally {
      setEmptying(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 border-b flex-shrink-0 text-sm ${
      anySelected ? 'bg-primary/5 border-primary/20' : 'bg-muted/20'
    }`}>
      {/* Master checkbox */}
      <button
        onClick={handleMasterCheck}
        disabled={total === 0 || isPending}
        title={allSelected ? 'Deselect all' : 'Select all'}
        className="w-4 h-4 flex-shrink-0 flex items-center justify-center disabled:opacity-40"
      >
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          allSelected
            ? 'bg-primary border-primary'
            : partialSelected
            ? 'bg-primary/30 border-primary'
            : 'border-muted-foreground/40 hover:border-primary'
        }`}>
          {allSelected && (
            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {partialSelected && (
            <div className="w-2 h-0.5 bg-primary rounded" />
          )}
        </div>
      </button>

      {anySelected ? (
        /* ── Selection mode ── */
        <>
          <span className="font-medium text-primary tabular-nums">{count}</span>
          <span className="text-muted-foreground">of {total} selected</span>
          {!allSelected && (
            <button onClick={onSelectAll} disabled={isPending}
              className="text-xs text-primary hover:underline">
              Select all
            </button>
          )}
          <div className="w-px h-4 bg-border mx-1" />
          <ActionBtn label="Delete" icon="🗑" pending={bulkDelete.isPending} disabled={isPending}
            onClick={() => run(() => bulkDelete.mutateAsync(ids))} danger />
          <ActionBtn label="Read" icon="✉" pending={false} disabled={isPending}
            onClick={() => run(() => bulkMarkRead.mutateAsync({ emailIds: ids, read: true }))} />
          <ActionBtn label="Unread" icon="✉̈" pending={false} disabled={isPending}
            onClick={() => run(() => bulkMarkRead.mutateAsync({ emailIds: ids, read: false }))} />
          <ActionBtn label="Flag" icon="⭐" pending={false} disabled={isPending}
            onClick={() => run(() => bulkFlag.mutateAsync({ emailIds: ids, flagged: true }))} />
          <ActionBtn label="Unflag" icon="☆" pending={false} disabled={isPending}
            onClick={() => run(() => bulkFlag.mutateAsync({ emailIds: ids, flagged: false }))} />
          <div className="flex-1" />
          <button onClick={onClear} disabled={isPending}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Clear selection">
            ✕
          </button>
        </>
      ) : (
        /* ── Normal mode ── */
        <>
          <span className="text-muted-foreground tabular-nums">
            {total === 0 ? 'No emails' : `${total} email${total === 1 ? '' : 's'}`}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleEmptyFolder}
            disabled={isPending}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
              isTrashLike
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title={isTrashLike ? `Empty ${mailboxName} (all messages)` : `Delete all messages in ${mailboxName}`}
          >
            {emptying ? (
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>🗑</span>
            )}
            <span>{isTrashLike ? 'Empty folder' : 'Delete all'}</span>
          </button>
        </>
      )}
    </div>
  );
}

function ActionBtn({ label, icon, pending, disabled, onClick, danger }: {
  label: string; icon: string; pending: boolean; disabled: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled || pending} title={label}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        danger ? 'hover:bg-destructive/10 hover:text-destructive text-muted-foreground'
               : 'hover:bg-muted text-muted-foreground hover:text-foreground'
      }`}>
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Email Row ────────────────────────────────────────────────────────────────

interface EmailRowProps {
  email: JmapEmail;
  isOpen: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onSelect: (e: React.MouseEvent) => void;
}

function EmailRow({ email, isOpen, isSelected, onOpen, onSelect }: EmailRowProps) {
  const { toggleFlagged } = useEmailMutations();
  const isRead = email.keywords?.['$seen'] ?? false;
  const isFlagged = email.keywords?.['$flagged'] ?? false;

  return (
    <div
      onClick={onOpen}
      className={`
        relative flex items-start gap-3 px-4 py-3 cursor-pointer border-b
        transition-colors select-none
        ${isOpen ? 'bg-accent' : isSelected ? 'bg-accent/50' : 'hover:bg-muted/50'}
        ${!isRead ? 'font-medium' : ''}
      `}
    >
      <div onClick={(e) => { e.stopPropagation(); onSelect(e); }}
        className="mt-1 w-4 h-4 flex-shrink-0 flex items-center justify-center">
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40 hover:border-primary'
        }`}>
          {isSelected && (
            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      <div className="mt-2 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${!isRead ? 'bg-primary' : 'bg-transparent'}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm truncate ${!isRead ? 'font-semibold' : 'font-medium'}`}>
            {formatSender(email)}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatDate(email.receivedAt ?? '')}
          </span>
        </div>
        <div className="text-sm truncate mt-0.5">{email.subject || '(no subject)'}</div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">{email.preview ?? ''}</div>
        {email.hasAttachment && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-1">📎</span>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); toggleFlagged.mutate({ emailId: email.id, flagged: !isFlagged }); }}
        className="mt-1 flex-shrink-0 text-muted-foreground hover:text-amber-500 transition-colors"
        title={isFlagged ? 'Unflag' : 'Flag'}
      >
        {isFlagged ? '⭐' : '☆'}
      </button>
    </div>
  );
}

// ─── Email List ───────────────────────────────────────────────────────────────

interface EmailListProps {
  mailboxId: string;
}

export function EmailList({ mailboxId }: EmailListProps) {
  const [openEmailId, setOpenEmailId] = useAtom(openEmailIdAtom);
  const [selectedIds, setSelectedIds] = useAtom(selectedEmailIdsAtom);
  const [accountId] = useAtom(activeAccountIdAtom);
  const { data, isLoading, isError } = useEmails(mailboxId);
  const { data: mailboxes = [] } = useMailboxes(accountId);

  const emails = data?.emails ?? [];
  const mailbox = mailboxes.find((m) => m.id === mailboxId);
  const mailboxRole = mailbox?.role ?? null;
  const mailboxName = mailbox?.name ?? 'folder';

  const handleSelect = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const selectAll = () => setSelectedIds(new Set(emails.map((e) => e.id)));

  return (
    <div className="h-full flex flex-col">
      {/* Search + Sort bar */}
      <SearchBar />

      {/* List header: master checkbox + count + bulk actions / empty folder */}
      {!isLoading && !isError && (
        <ListHeader
          selectedIds={selectedIds}
          allEmails={emails}
          mailboxRole={mailboxRole}
          mailboxName={mailboxName}
          mailboxId={mailboxId}
          accountId={accountId}
          onClear={clearSelection}
          onSelectAll={selectAll}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 divide-y overflow-hidden">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <div className="w-4 h-4 mt-1 bg-muted rounded animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse w-32" />
                <div className="h-3 bg-muted rounded animate-pulse w-48" />
                <div className="h-3 bg-muted rounded animate-pulse w-64" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          Failed to load emails. Check your account connection.
        </div>
      ) : emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
          <span className="text-4xl">📭</span>
          <span className="text-sm">No emails found</span>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <VList className="h-full">
            {emails.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                isOpen={openEmailId === email.id}
                isSelected={selectedIds.has(email.id)}
                onOpen={() => setOpenEmailId(email.id)}
                onSelect={(e) => handleSelect(email.id, e)}
              />
            ))}
          </VList>
        </div>
      )}
    </div>
  );
}
