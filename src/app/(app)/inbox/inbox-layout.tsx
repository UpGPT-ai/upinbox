'use client';

/**
 * InboxLayout — three-panel layout: sidebar | email list | reading pane
 *
 * Panel visibility depends on:
 *   - sidebarCollapsedAtom
 *   - readingPanePositionAtom ('right' | 'bottom' | 'none')
 *   - openEmailIdAtom (whether an email is selected)
 */

import { useAtom } from 'jotai';
import {
  activeAccountIdAtom,
  activeMailboxIdAtom,
  readingPanePositionAtom,
  sidebarCollapsedAtom,
  showConnectWizardAtom,
} from '@/atoms/mail';
import { useAccounts } from '@/hooks/use-accounts';
import { MailSidebar } from '@/components/layout/sidebar';
import { EmailList } from '@/components/mail/email-list';
import { EmailDetail } from '@/components/mail/email-detail';

function EmptyState() {
  const [, setShowConnect] = useAtom(showConnectWizardAtom);
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
      <div className="text-6xl">📬</div>
      <div>
        <h2 className="text-xl font-semibold mb-2">Connect your inbox</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Connect Gmail, Outlook, Fastmail, or any IMAP server.
          Your credentials are encrypted — we never see them.
        </p>
      </div>
      <button
        onClick={() => setShowConnect(true)}
        className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
      >
        Connect your email
      </button>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function InboxLayout() {
  const [, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const collapsed = false; // read-only shortcut — toggled by button only
  const [activeAccountId] = useAtom(activeAccountIdAtom);
  const [activeMailboxId] = useAtom(activeMailboxIdAtom);
  const [readingPane, setReadingPane] = useAtom(readingPanePositionAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const { data: accounts = [], isLoading } = useAccounts();

  const hasAccounts = accounts.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <MailSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top toolbar */}
        <div className="h-12 border-b flex items-center px-4 gap-2 flex-shrink-0">
          <ToolbarButton
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </ToolbarButton>

          <div className="flex-1" />

          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <button
              onClick={() => setReadingPane('right')}
              title="Reading pane right"
              className={`px-2 py-1 text-xs rounded transition-colors ${
                readingPane === 'right'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              ⊞
            </button>
            <button
              onClick={() => setReadingPane('bottom')}
              title="Reading pane bottom"
              className={`px-2 py-1 text-xs rounded transition-colors ${
                readingPane === 'bottom'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              ⊟
            </button>
            <button
              onClick={() => setReadingPane('none')}
              title="No reading pane"
              className={`px-2 py-1 text-xs rounded transition-colors ${
                readingPane === 'none'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              ≡
            </button>
          </div>
        </div>

        {/* Content area */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !hasAccounts ? (
          <EmptyState />
        ) : readingPane === 'right' ? (
          <div className="flex-1 flex min-h-0">
            <div className="w-80 xl:w-96 border-r flex-shrink-0 overflow-hidden">
              {activeMailboxId && <EmailList mailboxId={activeMailboxId} />}
            </div>
            <div className="flex-1 overflow-hidden">
              <EmailDetail />
            </div>
          </div>
        ) : readingPane === 'bottom' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-hidden border-b">
              {activeMailboxId && <EmailList mailboxId={activeMailboxId} />}
            </div>
            <div className="h-80 xl:h-96 overflow-hidden">
              <EmailDetail />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            {activeMailboxId && <EmailList mailboxId={activeMailboxId} />}
          </div>
        )}
      </div>
    </div>
  );
}
