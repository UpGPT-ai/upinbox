'use client';

/**
 * MailSidebar — account switcher + mailbox navigation
 *
 * Shows all accounts, their mailboxes, and unread counts.
 * Uses atoms for selection state — no prop drilling.
 */

import { useAtom } from 'jotai';
import {
  activeAccountIdAtom,
  activeMailboxIdAtom,
  sidebarCollapsedAtom,
  showConnectWizardAtom,
} from '@/atoms/mail';
import { useAccounts } from '@/hooks/use-accounts';
import { useMailboxes } from '@/hooks/use-mailboxes';
import type { JmapMailbox } from '@/lib/mail/types';

const ROLE_ICONS: Record<string, string> = {
  inbox: '📥',
  sent: '📤',
  drafts: '✏️',
  trash: '🗑️',
  junk: '🚫',
  archive: '📦',
  templates: '📋',
};

function MailboxItem({ mailbox }: { mailbox: JmapMailbox }) {
  const [activeMailboxId, setActiveMailboxId] = useAtom(activeMailboxIdAtom);
  const isActive = activeMailboxId === mailbox.id;
  const icon = mailbox.role ? (ROLE_ICONS[mailbox.role] ?? '📁') : '📁';

  return (
    <button
      onClick={() => setActiveMailboxId(mailbox.id)}
      className={`
        w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm
        transition-colors text-left
        ${isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }
      `}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1 truncate">{mailbox.name}</span>
      {(mailbox.unreadEmails ?? 0) > 0 && (
        <span className={`
          text-xs font-medium px-1.5 py-0.5 rounded-full
          ${isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'}
        `}>
          {mailbox.unreadEmails}
        </span>
      )}
    </button>
  );
}

function AccountSection({ accountId }: { accountId: string }) {
  const { data: mailboxes = [], isLoading } = useMailboxes(accountId);

  if (isLoading) {
    return (
      <div className="space-y-1 px-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  // Sort: role-based first (inbox, sent, drafts, trash), then custom
  const sorted = [...mailboxes].sort((a, b) => {
    const roleOrder = ['inbox', 'sent', 'drafts', 'archive', 'junk', 'trash'];
    const ai = a.role ? roleOrder.indexOf(a.role) : 99;
    const bi = b.role ? roleOrder.indexOf(b.role) : 99;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-0.5 px-2">
      {sorted.map((mb) => (
        <MailboxItem key={mb.id} mailbox={mb} />
      ))}
    </div>
  );
}

export function MailSidebar() {
  const [collapsed] = useAtom(sidebarCollapsedAtom);
  const [activeAccountId, setActiveAccountId] = useAtom(activeAccountIdAtom);
  const [, setShowConnectWizard] = useAtom(showConnectWizardAtom);
  const { data: accounts = [], isLoading } = useAccounts();

  if (collapsed) {
    return (
      <div className="w-12 border-r flex flex-col items-center py-4 gap-3">
        {accounts.map((account) => (
          <button
            key={account.id}
            onClick={() => setActiveAccountId(account.id)}
            title={account.email_address}
            className={`
              w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
              ${account.id === activeAccountId ? 'bg-primary text-primary-foreground' : 'bg-muted'}
            `}
          >
            {account.email_address[0].toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-64 border-r flex flex-col h-full">
      {/* Account switcher */}
      <div className="p-3 border-b">
        {isLoading ? (
          <div className="h-8 bg-muted rounded-md animate-pulse" />
        ) : (
          <div className="space-y-1">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => setActiveAccountId(account.id)}
                className={`
                  w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm
                  transition-colors text-left
                  ${account.id === activeAccountId
                    ? 'bg-accent'
                    : 'hover:bg-accent/50'
                  }
                `}
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {account.email_address[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {account.display_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {account.email_address}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mailboxes */}
      <div className="flex-1 overflow-y-auto py-2">
        {activeAccountId && (
          <AccountSection accountId={activeAccountId} />
        )}
      </div>

      {/* Add account */}
      <div className="p-3 border-t">
        <button
          onClick={() => setShowConnectWizard(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        >
          <span>＋</span>
          <span>Add account</span>
        </button>
      </div>
    </div>
  );
}
