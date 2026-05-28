'use client';

/**
 * MailSidebar — account dropdown + mailbox navigation
 *
 * Top: dropdown showing active account, listing all accounts, + Add account.
 * Middle: mailbox list for active account (role-ordered, junk/trash at bottom).
 *         Drag-and-drop reordering via @dnd-kit. Order persisted to user_metadata.
 * Bottom: compose button + settings link.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  activeAccountIdAtom,
  activeMailboxIdAtom,
  sidebarCollapsedAtom,
  showConnectWizardAtom,
  unifiedInboxAtom,
} from '@/atoms/mail';
import { useAccounts } from '@/hooks/use-accounts';
import { useMailboxes } from '@/hooks/use-mailboxes';
import type { JmapMailbox } from '@/lib/mail/types';
import type { MailAccount } from '@/hooks/use-accounts';

// ─── Mailbox role config ──────────────────────────────────────────────────────

const ROLE_ICONS: Record<string, string> = {
  inbox:    '📥',
  sent:     '📤',
  drafts:   '✏️',
  archive:  '📦',
  trash:    '🗑️',
  spam:     '🚫',
  junk:     '🚫',
};

// Roles that always sit at the bottom of the list (noise folders)
const BOTTOM_ROLES = new Set(['spam', 'junk', 'trash']);

// Canonical sort order for standard roles
const ROLE_ORDER: Record<string, number> = {
  inbox:   0,
  sent:    1,
  drafts:  2,
  archive: 3,
};

function defaultSortMailboxes(mailboxes: JmapMailbox[]): JmapMailbox[] {
  return [...mailboxes].sort((a, b) => {
    const aBottom = a.role && BOTTOM_ROLES.has(a.role);
    const bBottom = b.role && BOTTOM_ROLES.has(b.role);

    if (aBottom && !bBottom) return 1;
    if (!aBottom && bBottom) return -1;

    if (aBottom && bBottom) {
      const bottomOrder = { spam: 0, junk: 0, trash: 1 };
      return (bottomOrder[a.role as keyof typeof bottomOrder] ?? 0) -
             (bottomOrder[b.role as keyof typeof bottomOrder] ?? 0);
    }

    const ai = a.role != null ? (ROLE_ORDER[a.role] ?? 50) : 50;
    const bi = b.role != null ? (ROLE_ORDER[b.role] ?? 50) : 50;
    if (ai !== bi) return ai - bi;

    return a.name.localeCompare(b.name);
  });
}

/** Apply a saved ID order to mailboxes; items not in the saved order go to end */
function applyOrder(mailboxes: JmapMailbox[], savedIds: string[]): JmapMailbox[] {
  if (!savedIds.length) return defaultSortMailboxes(mailboxes);
  const idSet = new Set(savedIds);
  const ordered = savedIds.flatMap((id) => {
    const mb = mailboxes.find((m) => m.id === id);
    return mb ? [mb] : [];
  });
  const rest = defaultSortMailboxes(mailboxes.filter((m) => !idSet.has(m.id)));
  return [...ordered, ...rest];
}

// ─── Account Dropdown ─────────────────────────────────────────────────────────

function AccountDropdown({
  accounts,
  activeAccountId,
  unified,
  onSelect,
  onShowAll,
  onAddAccount,
}: {
  accounts: MailAccount[];
  activeAccountId: string | null;
  unified: boolean;
  onSelect: (id: string) => void;
  onShowAll: () => void;
  onAddAccount: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const avatar = (email: string) => (
    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
      {email[0].toUpperCase()}
    </div>
  );

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent rounded-lg transition-colors text-left group"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {unified ? (
          <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm flex-shrink-0">
            📬
          </div>
        ) : active ? avatar(active.email_address) : (
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">?</div>
        )}
        <div className="flex-1 min-w-0">
          {unified ? (
            <>
              <div className="text-sm font-medium truncate leading-tight">All Inboxes</div>
              <div className="text-xs text-muted-foreground truncate leading-tight">
                {accounts.length} account{accounts.length === 1 ? '' : 's'}
              </div>
            </>
          ) : active ? (
            <>
              <div className="text-sm font-medium truncate leading-tight">
                {active.display_name || active.email_address.split('@')[0]}
              </div>
              <div className="text-xs text-muted-foreground truncate leading-tight">
                {active.email_address}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No account</div>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-lg shadow-lg py-1 overflow-hidden">
          <div className="px-2 py-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
              Accounts ({accounts.length})
            </p>
            <div className="max-h-64 overflow-y-auto">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => { onSelect(account.id); setOpen(false); }}
                className={`
                  w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors text-left
                  ${account.id === activeAccountId ? 'bg-accent' : 'hover:bg-accent/60'}
                `}
              >
                {avatar(account.email_address)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm leading-tight">
                    {account.display_name || account.email_address.split('@')[0]}
                  </div>
                  <div className="text-xs text-muted-foreground truncate leading-tight">
                    {account.email_address}
                  </div>
                </div>
                {account.id === activeAccountId && (
                  <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
            </div>
          </div>

          <div className="border-t my-1" />

          <div className="px-2 py-1 space-y-0.5">
            {accounts.length > 1 && (
              <button
                onClick={() => { onShowAll(); setOpen(false); }}
                className={`
                  w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors text-left
                  ${unified ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'}
                `}
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm flex-shrink-0">
                  📬
                </div>
                <span className="font-medium">Show All</span>
                {unified && (
                  <svg className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={() => { onAddAccount(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <div className="w-7 h-7 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center text-base leading-none">
                +
              </div>
              <span>Add account</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sortable Mailbox item ─────────────────────────────────────────────────────

function SortableMailboxItem({ mailbox }: { mailbox: JmapMailbox }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mailbox.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [activeMailboxId, setActiveMailboxId] = useAtom(activeMailboxIdAtom);
  const [, setUnified] = useAtom(unifiedInboxAtom);
  const isActive = activeMailboxId === mailbox.id;

  const role = mailbox.role ?? '';
  const icon = ROLE_ICONS[role] ?? '📁';

  return (
    <div ref={setNodeRef} style={style} className="flex items-center group/mb">
      {/* Drag handle — only visible on hover */}
      <button
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover/mb:opacity-40 hover:!opacity-100 w-4 flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground transition-opacity"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="3" cy="2.5" r="1.2" />
          <circle cx="7" cy="2.5" r="1.2" />
          <circle cx="3" cy="7" r="1.2" />
          <circle cx="7" cy="7" r="1.2" />
          <circle cx="3" cy="11.5" r="1.2" />
          <circle cx="7" cy="11.5" r="1.2" />
        </svg>
      </button>

      <button
        onClick={() => {
          setUnified(false);
          setActiveMailboxId(mailbox.id);
        }}
        className={`
          flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm
          transition-colors text-left
          ${isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }
        `}
      >
        <span className="text-sm leading-none w-4 text-center flex-shrink-0">{icon}</span>
        <span className="flex-1 truncate">{mailbox.name}</span>
        {(mailbox.unreadEmails ?? 0) > 0 && (
          <span className={`
            text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center
            ${isActive
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-primary/10 text-primary'
            }
          `}>
            {mailbox.unreadEmails}
          </span>
        )}
      </button>
    </div>
  );
}

// ─── Account section (mailbox list with drag-to-reorder) ─────────────────────

function AccountSection({ accountId }: { accountId: string }) {
  const { data: mailboxes = [], isLoading } = useMailboxes(accountId);
  const [sortedMailboxes, setSortedMailboxes] = useState<JmapMailbox[]>([]);
  const [orderLoaded, setOrderLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load saved order from server on mount / account change
  useEffect(() => {
    if (!accountId) return;
    setOrderLoaded(false);
    fetch('/api/upinbox/mailbox-order')
      .then((r) => r.json())
      .then((data: { order?: Record<string, string[]> }) => {
        const savedIds: string[] = data.order?.[accountId] ?? [];
        setSortedMailboxes((prev) => {
          // Use whatever mailboxes are already loaded; re-apply after they load too
          const base = prev.length ? prev : mailboxes;
          return applyOrder(base, savedIds);
        });
        setOrderLoaded(true);
      })
      .catch(() => setOrderLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Re-sort when mailboxes load (after order is known)
  useEffect(() => {
    if (!mailboxes.length) return;
    setSortedMailboxes((prev) => {
      if (!orderLoaded) {
        // Order not loaded yet — use default sort temporarily
        return defaultSortMailboxes(mailboxes);
      }
      // Preserve current order for IDs we already know; append new ones
      const existingIds = prev.map((m) => m.id);
      return applyOrder(mailboxes, existingIds);
    });
  }, [mailboxes, orderLoaded]);

  const saveOrder = useCallback((ids: string[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      fetch('/api/upinbox/mailbox-order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, orderedIds: ids }),
      }).catch(console.error);
    }, 500);
  }, [accountId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSortedMailboxes((items) => {
      const oldIndex = items.findIndex((m) => m.id === active.id);
      const newIndex = items.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      const newItems = arrayMove(items, oldIndex, newIndex);
      saveOrder(newItems.map((m) => m.id));
      return newItems;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-1 px-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  const ids = sortedMailboxes.map((m) => m.id);

  // Find first bottom-role item to inject separator
  const firstBottomIdx = sortedMailboxes.findIndex(
    (mb) => mb.role && BOTTOM_ROLES.has(mb.role)
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5 px-1">
          {sortedMailboxes.map((mb, idx) => (
            <div key={mb.id}>
              {idx === firstBottomIdx && firstBottomIdx > 0 && (
                <div className="my-1 border-t border-border/50 mx-1" />
              )}
              <SortableMailboxItem mailbox={mb} />
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─── Collapsed sidebar ────────────────────────────────────────────────────────

function CollapsedSidebar({
  accounts,
  activeAccountId,
  onSelect,
}: {
  accounts: MailAccount[];
  activeAccountId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-12 border-r flex flex-col items-center py-3 gap-2.5">
      {accounts.map((account) => (
        <button
          key={account.id}
          onClick={() => onSelect(account.id)}
          title={account.email_address}
          className={`
            w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors
            ${account.id === activeAccountId
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-accent'
            }
          `}
        >
          {account.email_address[0].toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export function MailSidebar() {
  const [collapsed] = useAtom(sidebarCollapsedAtom);
  const [activeAccountId, setActiveAccountId] = useAtom(activeAccountIdAtom);
  const [, setShowConnectWizard] = useAtom(showConnectWizardAtom);
  const [unified, setUnified] = useAtom(unifiedInboxAtom);
  const { data: accounts = [], isLoading } = useAccounts();

  if (collapsed) {
    return (
      <CollapsedSidebar
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelect={setActiveAccountId}
      />
    );
  }

  return (
    <div className="w-56 border-r flex flex-col h-full bg-background">
      {/* Account dropdown */}
      <div className="p-2 border-b">
        {isLoading ? (
          <div className="h-12 bg-muted rounded-lg animate-pulse" />
        ) : (
          <AccountDropdown
            accounts={accounts}
            activeAccountId={activeAccountId}
            unified={unified}
            onSelect={(id) => { setActiveAccountId(id); setUnified(false); }}
            onShowAll={() => { setUnified(true); }}
            onAddAccount={() => setShowConnectWizard(true)}
          />
        )}
      </div>

      {/* Mailbox list */}
      <div className="flex-1 overflow-y-auto py-2">
        {activeAccountId && (
          <AccountSection accountId={activeAccountId} />
        )}
      </div>
    </div>
  );
}
