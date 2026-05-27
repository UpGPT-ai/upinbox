'use client';

/**
 * EmailList — virtualized list of email previews.
 *
 * Uses `virtua` for high-performance rendering of large inbox lists.
 * Selection state is in Jotai atoms — no prop drilling to parent.
 */

import { VList } from 'virtua';
import { useAtom } from 'jotai';
import { openEmailIdAtom, selectedEmailIdsAtom } from '@/atoms/mail';
import { useEmails, useEmailMutations } from '@/hooks/use-emails';
import type { JmapEmail } from '@/lib/mail/types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (isThisYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatSender(email: JmapEmail): string {
  const from = email.from?.[0];
  if (!from) return 'Unknown';
  return from.name || from.email;
}

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
      {/* Selection checkbox */}
      <div
        onClick={onSelect}
        className="mt-1 w-4 h-4 flex-shrink-0 flex items-center justify-center"
      >
        <div className={`
          w-4 h-4 rounded border-2 flex items-center justify-center
          ${isSelected
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40 hover:border-primary'
          }
        `}>
          {isSelected && (
            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Unread indicator */}
      <div className="mt-2 flex-shrink-0">
        <div className={`w-2 h-2 rounded-full ${!isRead ? 'bg-primary' : 'bg-transparent'}`} />
      </div>

      {/* Email content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm truncate ${!isRead ? 'font-semibold' : 'font-medium'}`}>
            {formatSender(email)}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatDate(email.receivedAt ?? email.sentAt ?? '')}
          </span>
        </div>
        <div className="text-sm truncate mt-0.5">{email.subject || '(no subject)'}</div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {email.preview ?? ''}
        </div>
        {email.hasAttachment && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-1">
            📎
          </span>
        )}
      </div>

      {/* Flag button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFlagged.mutate({ emailId: email.id, flagged: !isFlagged });
        }}
        className="mt-1 flex-shrink-0 text-muted-foreground hover:text-amber-500 transition-colors"
        title={isFlagged ? 'Unflag' : 'Flag'}
      >
        {isFlagged ? '⭐' : '☆'}
      </button>
    </div>
  );
}

interface EmailListProps {
  mailboxId: string;
}

export function EmailList({ mailboxId }: EmailListProps) {
  const [openEmailId, setOpenEmailId] = useAtom(openEmailIdAtom);
  const [selectedIds, setSelectedIds] = useAtom(selectedEmailIdsAtom);
  const { data, isLoading, isError } = useEmails(mailboxId);

  const emails = data?.emails ?? [];

  const handleSelect = (emailId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="divide-y">
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
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Failed to load emails. Check your account connection.
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <span className="text-4xl">📭</span>
        <span className="text-sm">No emails here</span>
      </div>
    );
  }

  return (
    <div className="h-full email-list-container">
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
  );
}
