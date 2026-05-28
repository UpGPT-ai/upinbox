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
  composeDraftAtom,
} from '@/atoms/mail';
import { useAccounts } from '@/hooks/use-accounts';
import { MailSidebar } from '@/components/layout/sidebar';
import { EmailList } from '@/components/mail/email-list';
import { EmailDetail } from '@/components/mail/email-detail';
import { FeedTabs, activeFeedAtom } from '@/components/screener/feed-tabs';
import { FeedEmailList } from '@/components/screener/feed-email-list';
import { FocusList } from '@/components/screener/focus-list';
import { ConnectAccountWizard } from '@/components/ai/connect-account-wizard';
import { ComposeWindow } from '@/components/mail/compose-window';
import type { FeedType } from '@/components/screener/feed-tabs';

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
  const [activeAccountId] = useAtom(activeAccountIdAtom);
  const [activeMailboxId] = useAtom(activeMailboxIdAtom);
  const [readingPane, setReadingPane] = useAtom(readingPanePositionAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [showConnectWizard] = useAtom(showConnectWizardAtom);
  const [, setComposeDraft] = useAtom(composeDraftAtom);
  const [activeFeed] = useAtom(activeFeedAtom);
  const { data: accounts = [], isLoading } = useAccounts();

  const hasAccounts = accounts.length > 0;
  const isSpecialFeed = activeFeed !== 'inbox';

  /** Render the list panel based on active feed */
  const renderListPanel = () => {
    if (activeFeed === 'focus') return <FocusList />;
    if (activeFeed !== 'inbox') {
      return <FeedEmailList feed={activeFeed as FeedType} />;
    }
    return activeMailboxId ? <EmailList mailboxId={activeMailboxId} /> : null;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <MailSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top toolbar */}
        <div className="h-11 border-b flex items-center px-4 gap-2 flex-shrink-0">
          <ToolbarButton
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </ToolbarButton>

          {/* Compose button */}
          {hasAccounts && (
            <button
              onClick={() => setComposeDraft({
                mode: 'new',
                to: [],
                cc: [],
                bcc: [],
                subject: '',
                body: '',
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <span className="text-base leading-none">✏️</span>
              <span>Compose</span>
            </button>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1 border rounded-md p-0.5">
            {(['right', 'bottom', 'none'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => setReadingPane(pos)}
                title={{ right: 'Reading pane right', bottom: 'Reading pane bottom', none: 'List only' }[pos]}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  readingPane === pos ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {pos === 'right' ? '⊞' : pos === 'bottom' ? '⊟' : '≡'}
              </button>
            ))}
          </div>
        </div>

        {/* Feed tabs */}
        {hasAccounts && <FeedTabs />}

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
              {renderListPanel()}
            </div>
            <div className="flex-1 overflow-hidden">
              <EmailDetail />
            </div>
          </div>
        ) : readingPane === 'bottom' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-hidden border-b">
              {renderListPanel()}
            </div>
            <div className="h-80 xl:h-96 overflow-hidden">
              <EmailDetail />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            {renderListPanel()}
          </div>
        )}
      </div>

      {/* Connect wizard modal */}
      {showConnectWizard && <ConnectAccountWizard />}

      {/* Compose window — fixed overlay, always rendered */}
      <ComposeWindow />
    </div>
  );
}
