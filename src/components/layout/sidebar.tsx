'use client';

/**
 * MailSidebar — account dropdown + mailbox navigation
 *
 * Top: dropdown showing active account, listing all accounts, + Add account.
 * Middle: mailbox list for active account (role-ordered, junk/trash at bottom).
 *         Drag-and-drop reordering via @dnd-kit — dynamically imported (ssr:false)
 *         so that the browser-only DnD library is never loaded during SSR.
 * Bottom: compose button + settings link.
 */

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAtom } from 'jotai';
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
import { defaultSortMailboxes, BOTTOM_ROLES } from './mailbox-list-dnd';

// Dynamically import the DnD list — never rendered on the server
const MailboxListDnd = dynamic(
  () => import('./mailbox-list-dnd').then((m) => m.MailboxListDnd),
  { ssr: false }
);

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

// ─── Static mailbox item (SSR/loading fallback) ───────────────────────────────

function StaticMailboxItem({ mailbox }: { mailbox: JmapMailbox }) {
  const [activeMailboxId, setActiveMailboxId] = useAtom(activeMailboxIdAtom);
  const [, setUnified] = useAtom(unifiedInboxAtom);
  const isActive = activeMailboxId === mailbox.id;
  const icon = ROLE_ICONS[mailbox.role ?? ''] ?? '📁';

  return (
    <button
      onClick={() => { setUnified(false); setActiveMailboxId(mailbox.id); }}
      className={`
        w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm
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
  );
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

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({ accountId }: { accountId: string }) {
  const { data: mailboxes = [], isLoading } = useMailboxes(accountId);
  const [dndReady, setDndReady] = useState(false);

  // Flag client-side mount so we swap from static → DnD list
  useEffect(() => { setDndReady(true); }, []);

  if (isLoading) {
    return (
      <div className="space-y-1 px-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  // After client-side mount: render DnD list (loaded dynamically, no SSR)
  if (dndReady) {
    return <MailboxListDnd accountId={accountId} mailboxes={mailboxes} />;
  }

  // SSR / pre-hydration: static list with no DnD deps
  const sorted = defaultSortMailboxes(mailboxes);
  const firstBottomIdx = sorted.findIndex((mb) => mb.role && BOTTOM_ROLES.has(mb.role));

  return (
    <div className="space-y-0.5 px-2">
      {sorted.map((mb, idx) => (
        <div key={mb.id}>
          {idx === firstBottomIdx && firstBottomIdx > 0 && (
            <div className="my-1 border-t border-border/50" />
          )}
          <StaticMailboxItem mailbox={mb} />
        </div>
      ))}
    </div>
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
      <div className="p-2 border-b">
        {isLoading ? (
          <div className="h-12 bg-muted rounded-lg animate-pulse" />
        ) : (
          <AccountDropdown
            accounts={accounts}
            activeAccountId={activeAccountId}
            unified={unified}
            onSelect={(id) => { setActiveAccountId(id); setUnified(false); }}
            onShowAll={() => setUnified(true)}
            onAddAccount={() => setShowConnectWizard(true)}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {activeAccountId && (
          <AccountSection accountId={activeAccountId} />
        )}
      </div>
    </div>
  );
}
