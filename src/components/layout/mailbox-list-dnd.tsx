'use client';

/**
 * MailboxListDnd — sortable mailbox list using @dnd-kit.
 *
 * This file is dynamically imported with { ssr: false } from sidebar.tsx
 * so that @dnd-kit (browser-only) is never required during server-side rendering.
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
import { activeMailboxIdAtom, unifiedInboxAtom } from '@/atoms/mail';
import type { JmapMailbox } from '@/lib/mail/types';

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_ICONS: Record<string, string> = {
  inbox:    '📥',
  sent:     '📤',
  drafts:   '✏️',
  archive:  '📦',
  trash:    '🗑️',
  spam:     '🚫',
  junk:     '🚫',
};

export const BOTTOM_ROLES = new Set(['spam', 'junk', 'trash']);

const ROLE_ORDER: Record<string, number> = {
  inbox:   0,
  sent:    1,
  drafts:  2,
  archive: 3,
};

export function defaultSortMailboxes(mailboxes: JmapMailbox[]): JmapMailbox[] {
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

export function applyOrder(mailboxes: JmapMailbox[], savedIds: string[]): JmapMailbox[] {
  if (!savedIds.length) return defaultSortMailboxes(mailboxes);
  const idSet = new Set(savedIds);
  const ordered = savedIds.flatMap((id) => {
    const mb = mailboxes.find((m) => m.id === id);
    return mb ? [mb] : [];
  });
  const rest = defaultSortMailboxes(mailboxes.filter((m) => !idSet.has(m.id)));
  return [...ordered, ...rest];
}

// ─── Sortable mailbox item ─────────────────────────────────────────────────────

function SortableMailboxItem({ mailbox }: { mailbox: JmapMailbox }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mailbox.id });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const [activeMailboxId, setActiveMailboxId] = useAtom(activeMailboxIdAtom);
  const [, setUnified] = useAtom(unifiedInboxAtom);
  const isActive = activeMailboxId === mailbox.id;
  const icon = ROLE_ICONS[mailbox.role ?? ''] ?? '📁';

  return (
    <div ref={setNodeRef} style={style} className="flex items-center group/mb">
      {/* Drag handle — visible on hover */}
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

// ─── Sortable list ─────────────────────────────────────────────────────────────

export interface MailboxListDndProps {
  accountId: string;
  mailboxes: JmapMailbox[];
}

export function MailboxListDnd({ accountId, mailboxes }: MailboxListDndProps) {
  const [sorted, setSorted] = useState<JmapMailbox[]>(() => defaultSortMailboxes(mailboxes));
  const [orderLoaded, setOrderLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load persisted order from server
  useEffect(() => {
    setOrderLoaded(false);
    fetch('/api/upinbox/mailbox-order')
      .then((r) => r.json())
      .then((data: { order?: Record<string, string[]> }) => {
        const savedIds: string[] = data.order?.[accountId] ?? [];
        setSorted(applyOrder(mailboxes, savedIds));
        setOrderLoaded(true);
      })
      .catch(() => {
        setSorted(defaultSortMailboxes(mailboxes));
        setOrderLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Keep list in sync when mailboxes data refreshes
  useEffect(() => {
    if (!orderLoaded) return;
    setSorted((prev) => {
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
    setSorted((items) => {
      const oldIndex = items.findIndex((m) => m.id === active.id);
      const newIndex = items.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      const next = arrayMove(items, oldIndex, newIndex);
      saveOrder(next.map((m) => m.id));
      return next;
    });
  };

  const ids = sorted.map((m) => m.id);
  const firstBottomIdx = sorted.findIndex((mb) => mb.role && BOTTOM_ROLES.has(mb.role));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5 px-1">
          {sorted.map((mb, idx) => (
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
