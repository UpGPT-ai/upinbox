'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onAction: (actionId: string) => void;
  mailboxes?: Array<{ id: string; name: string; role?: string | null; unreadEmails?: number }>;
  accounts?: Array<{ id: string; email_address: string; display_name?: string | null }>;
}

interface PaletteItem {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  section: 'Actions' | 'Go to Folder' | 'Switch Account';
  meta?: string;
}

const STATIC_ACTIONS: PaletteItem[] = [
  { id: 'compose',        label: 'Compose new email',  icon: '✏️',  shortcut: 'C', section: 'Actions' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar',     icon: '◀',   shortcut: ']', section: 'Actions' },
  { id: 'search',         label: 'Search emails',      icon: '🔍',  shortcut: '/', section: 'Actions' },
  { id: 'mark-read',      label: 'Mark as read',       icon: '✓',                  section: 'Actions' },
  { id: 'archive',        label: 'Archive email',      icon: '📦',  shortcut: 'E', section: 'Actions' },
  { id: 'delete',         label: 'Delete email',       icon: '🗑️',  shortcut: '#', section: 'Actions' },
  { id: 'snooze',         label: 'Snooze email',       icon: '🔔',  shortcut: 'H', section: 'Actions' },
  { id: 'reply',          label: 'Reply',              icon: '↩',   shortcut: 'R', section: 'Actions' },
];

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function buildItems(
  mailboxes: CommandPaletteProps['mailboxes'],
  accounts: CommandPaletteProps['accounts'],
): PaletteItem[] {
  const folderItems: PaletteItem[] = (mailboxes ?? []).map((mb) => ({
    id: `mailbox:${mb.id}`,
    label: mb.name,
    icon: '📁',
    section: 'Go to Folder',
    meta: mb.unreadEmails ? `${mb.unreadEmails} unread` : undefined,
  }));

  const accountItems: PaletteItem[] = (accounts ?? []).map((ac) => ({
    id: `account:${ac.id}`,
    label: ac.display_name ? `${ac.display_name} (${ac.email_address})` : ac.email_address,
    icon: '👤',
    section: 'Switch Account',
  }));

  return [...STATIC_ACTIONS, ...folderItems, ...accountItems];
}

const SECTION_ORDER: PaletteItem['section'][] = ['Actions', 'Go to Folder', 'Switch Account'];

export function CommandPalette({
  open,
  onClose,
  onAction,
  mailboxes,
  accounts,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allItems = buildItems(mailboxes, accounts);

  const filtered = query
    ? allItems.filter((item) => fuzzyMatch(query, item.label))
    : allItems;

  // Group by section preserving order
  const grouped = SECTION_ORDER.reduce<Record<string, PaletteItem[]>>((acc, section) => {
    const items = filtered.filter((i) => i.section === section);
    if (items.length) acc[section] = items;
    return acc;
  }, {});

  // Flat ordered list for keyboard nav
  const flat = SECTION_ORDER.flatMap((s) => grouped[s] ?? []);

  const execute = useCallback(
    (item: PaletteItem) => {
      onAction(item.id);
      onClose();
    },
    [onAction, onClose],
  );

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Defer focus so the modal is rendered first
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp activeIndex when filter changes
  useEffect(() => {
    setActiveIndex((prev) => (flat.length === 0 ? 0 : Math.min(prev, flat.length - 1)));
  }, [flat.length]);

  // Scroll active item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Global key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(flat.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + Math.max(flat.length, 1)) % Math.max(flat.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[activeIndex];
        if (item) execute(item);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, flat, activeIndex, execute, onClose]);

  if (!open) return null;

  let runningIndex = 0;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Card */}
      <div className="bg-background border rounded-2xl shadow-2xl p-0 overflow-hidden w-full max-w-lg mx-4">

        {/* Search input */}
        <div className="flex items-center border-b px-4 py-3 gap-3">
          <span className="text-muted-foreground text-base select-none">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search actions, folders, accounts…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            className="flex-1 bg-transparent text-base outline-none focus:ring-0 placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground text-sm leading-none"
              tabIndex={-1}
            >
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {flat.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            SECTION_ORDER.map((section) => {
              const items = grouped[section];
              if (!items) return null;
              return (
                <div key={section}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1 select-none">
                    {section}
                  </p>
                  {items.map((item) => {
                    const index = runningIndex++;
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={item.id}
                        data-active={isActive}
                        onClick={() => execute(item)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                          isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                        }`}
                      >
                        <span className="text-base w-5 text-center select-none shrink-0">{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.meta && (
                          <span className="text-xs text-muted-foreground shrink-0">{item.meta}</span>
                        )}
                        {item.shortcut && (
                          <kbd className="ml-auto shrink-0 inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground select-none">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
