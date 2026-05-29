'use client';

/**
 * InboxLayout — three-panel layout: sidebar | email list | reading pane
 *
 * Panel visibility depends on:
 *   - sidebarCollapsedAtom
 *   - readingPanePositionAtom ('right' | 'bottom' | 'none')
 *   - openEmailIdAtom (whether an email is selected)
 *   - toolbarCollapsedAtom (hide top toolbar for more vertical space)
 *
 * Fullscreen: uses document.requestFullscreen() to hide browser chrome entirely.
 * Toolbar collapse: hides the app's own top bar (toolbar row) separately.
 */

import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  activeAccountIdAtom,
  activeMailboxIdAtom,
  readingPanePositionAtom,
  sidebarCollapsedAtom,
  showConnectWizardAtom,
  composeDraftAtom,
  unifiedInboxAtom,
  toolbarCollapsedAtom,
  commandPaletteOpenAtom,
  undoToastAtom,
  undoDurationMsAtom,
  openEmailIdAtom,
  emailCursorAtom,
  showSubscriptionsAtom,
  showHealthScoreAtom,
} from '@/atoms/mail';
import { useAccounts } from '@/hooks/use-accounts';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useMailboxes } from '@/hooks/use-mailboxes';
import { MailSidebar } from '@/components/layout/sidebar';
import { EmailList } from '@/components/mail/email-list';
import { UnifiedEmailList } from '@/components/mail/unified-email-list';
import { EmailDetail } from '@/components/mail/email-detail';
import { FeedTabs, activeFeedAtom } from '@/components/screener/feed-tabs';
import { FeedEmailList } from '@/components/screener/feed-email-list';
import { FocusList } from '@/components/screener/focus-list';
import { ConnectAccountWizard } from '@/components/ai/connect-account-wizard';
import { DeepCleanWizard } from '@/components/ai/deep-clean-wizard';
import { ComposeWindow } from '@/components/mail/compose-window';
import { CommandPalette } from '@/components/mail/command-palette';
import { UndoToast } from '@/components/mail/undo-toast';
import { HealthScore } from '@/components/analytics/health-score';
import { SubscriptionsManager } from '@/components/mail/subscriptions-manager';
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
  active = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

function IconFullscreen({ exit }: { exit: boolean }) {
  return exit ? (
    // Exit fullscreen — arrows pointing inward
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  ) : (
    // Enter fullscreen — arrows pointing outward
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function IconHideBar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="4" rx="1" />
      <path d="M12 11v8M9 16l3 3 3-3" />
    </svg>
  );
}

function IconShowBar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="4" rx="1" />
      <path d="M12 21v-8M9 16l3-3 3 3" />
    </svg>
  );
}

// ─── Floating restore bar (shown when toolbar is collapsed) ───────────────────

function FloatingRestoreBar({
  onRestore,
  onFullscreen,
  isFullscreen,
}: {
  onRestore: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
}) {
  const [visible, setVisible] = useState(false);

  // Show on hover near top of screen
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setVisible(e.clientY < 32);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-50 flex items-center justify-end gap-1 px-3
        bg-background/90 backdrop-blur border-b shadow-sm transition-all duration-200
        ${visible ? 'h-8 opacity-100' : 'h-0 opacity-0 pointer-events-none overflow-hidden'}
      `}
    >
      <span className="text-xs text-muted-foreground mr-auto">UpInbox</span>
      <ToolbarButton onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
        <IconFullscreen exit={isFullscreen} />
      </ToolbarButton>
      <ToolbarButton onClick={onRestore} title="Show toolbar">
        <IconShowBar />
      </ToolbarButton>
    </div>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────

export function InboxLayout() {
  const [activeAccountId] = useAtom(activeAccountIdAtom);
  const [activeMailboxId] = useAtom(activeMailboxIdAtom);
  const [readingPane, setReadingPane] = useAtom(readingPanePositionAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [showConnectWizard] = useAtom(showConnectWizardAtom);
  const [, setComposeDraft] = useAtom(composeDraftAtom);
  const [activeFeed] = useAtom(activeFeedAtom);
  const [unified] = useAtom(unifiedInboxAtom);
  const [toolbarCollapsed, setToolbarCollapsed] = useAtom(toolbarCollapsedAtom);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDeepClean, setShowDeepClean] = useState(false);
  const { data: accounts = [], isLoading } = useAccounts();

  const [commandPaletteOpen, setCommandPaletteOpen] = useAtom(commandPaletteOpenAtom);
  const [undoToast, setUndoToast] = useAtom(undoToastAtom);
  const [undoDurationMs] = useAtom(undoDurationMsAtom);
  const [, setOpenEmailId] = useAtom(openEmailIdAtom);
  const [emailCursor, setEmailCursor] = useAtom(emailCursorAtom);
  const [showSubscriptions, setShowSubscriptions] = useAtom(showSubscriptionsAtom);
  const [showHealthScore, setShowHealthScore] = useAtom(showHealthScoreAtom);

  const hasAccounts = accounts.length > 0;

  // Track real fullscreen state (user can exit with ESC)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  useKeyboardShortcuts({
    onNavigateNext: () => setEmailCursor(c => c + 1),
    onNavigatePrev: () => setEmailCursor(c => Math.max(0, c - 1)),
    onArchive: () => { /* dispatch archive to active email */ },
    onDelete: () => { /* dispatch delete to active email */ },
    onReply: () => { /* open reply compose */ },
    onReplyAll: () => { /* open reply-all compose */ },
    onForward: () => { /* open forward compose */ },
    onStar: () => { /* toggle flag on active email */ },
    onCompose: () => setComposeDraft({ mode: 'new', to: [], cc: [], bcc: [], subject: '', body: '' }),
    onSearch: () => { /* focus search input */ },
    onCommandPalette: () => setCommandPaletteOpen(true),
    onHelp: () => setCommandPaletteOpen(true),
    onMarkRead: () => { /* mark active email read */ },
    onMarkUnread: () => { /* mark active email unread */ },
    onSnooze: () => { /* open snooze for active email */ },
    onEscape: () => setCommandPaletteOpen(false),
  }, hasAccounts);

  /** Render the list panel based on active feed */
  const renderListPanel = () => {
    if (activeFeed === 'focus') return <FocusList />;
    if (activeFeed !== 'inbox') {
      return <FeedEmailList feed={activeFeed as FeedType} />;
    }
    if (unified) return <UnifiedEmailList />;
    return activeMailboxId ? <EmailList mailboxId={activeMailboxId} /> : null;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <MailSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top toolbar — collapsible */}
        {!toolbarCollapsed && (
          <div className="h-11 border-b flex items-center px-4 gap-2 flex-shrink-0">
            <ToolbarButton
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              )}
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

            {/* Deep Clean button */}
            {hasAccounts && (
              <ToolbarButton
                onClick={() => setShowDeepClean(true)}
                title="Deep Clean — AI-powered inbox declutter"
                active={showDeepClean}
              >
                <span className="text-sm leading-none">🧹</span>
              </ToolbarButton>
            )}

            {/* MCP Setup link */}
            {hasAccounts && (
              <a
                href="/inbox/mcp"
                title="MCP Setup — connect AI tools and automations"
                className="p-1.5 rounded transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <span className="text-sm leading-none">🔌</span>
              </a>
            )}

            {/* Health score button */}
            <ToolbarButton
              onClick={() => setShowHealthScore((v) => !v)}
              title="Inbox health score"
              active={showHealthScore}
            >
              <span className="text-sm leading-none">📊</span>
            </ToolbarButton>

            {/* Subscriptions button */}
            <ToolbarButton
              onClick={() => setShowSubscriptions((v) => !v)}
              title="Manage subscriptions"
              active={showSubscriptions}
            >
              <span className="text-sm leading-none">📰</span>
            </ToolbarButton>

            {/* Cmd-K command palette shortcut pill */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              title="Open command palette (⌘K)"
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground border rounded-md hover:bg-muted hover:text-foreground transition-colors font-mono"
            >
              <span>⌘K</span>
            </button>

            {/* Reading pane toggle */}
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

            {/* Fullscreen toggle */}
            <ToolbarButton
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
              active={isFullscreen}
            >
              <IconFullscreen exit={isFullscreen} />
            </ToolbarButton>

            {/* Collapse toolbar */}
            <ToolbarButton
              onClick={() => setToolbarCollapsed(true)}
              title="Hide toolbar (hover top edge to restore)"
            >
              <IconHideBar />
            </ToolbarButton>
          </div>
        )}

        {/* Ghost restore zone when toolbar is hidden — hover near top to see floating bar */}
        {toolbarCollapsed && (
          <FloatingRestoreBar
            onRestore={() => setToolbarCollapsed(false)}
            onFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
          />
        )}

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

      {/* Right-side slide-in panel: Health Score */}
      {showHealthScore && (
        <div className="fixed top-0 right-0 h-full w-96 z-40 bg-background border-l shadow-xl flex flex-col">
          <div className="h-11 border-b flex items-center justify-between px-4 flex-shrink-0">
            <span className="font-semibold text-sm flex items-center gap-2">
              <span>📊</span>
              <span>Inbox Health</span>
            </span>
            <button
              onClick={() => setShowHealthScore(false)}
              className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <HealthScore accountId={activeAccountId ?? ''} />
          </div>
        </div>
      )}

      {/* Right-side slide-in panel: Subscriptions Manager */}
      {showSubscriptions && (
        <div className={`fixed top-0 right-0 h-full w-96 z-40 bg-background border-l shadow-xl flex flex-col ${showHealthScore ? 'right-96' : 'right-0'}`}>
          <div className="h-11 border-b flex items-center justify-between px-4 flex-shrink-0">
            <span className="font-semibold text-sm flex items-center gap-2">
              <span>📰</span>
              <span>Subscriptions</span>
            </span>
            <button
              onClick={() => setShowSubscriptions(false)}
              className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SubscriptionsManager accountId={activeAccountId ?? ''} />
          </div>
        </div>
      )}

      {/* Connect wizard modal */}
      {showConnectWizard && <ConnectAccountWizard />}

      {/* Deep Clean wizard modal overlay */}
      {showDeepClean && (
        <DeepCleanWizard
          accountId={activeAccountId ?? ''}
          onClose={() => setShowDeepClean(false)}
        />
      )}

      {/* Compose window — fixed overlay, always rendered */}
      <ComposeWindow />

      {/* Command palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={(actionId) => {
          setCommandPaletteOpen(false);
          if (actionId === 'compose') setComposeDraft({ mode: 'new', to: [], cc: [], bcc: [], subject: '', body: '' });
          if (actionId === 'toggle-sidebar') setSidebarCollapsed(v => !v);
        }}
      />

      {/* Undo toast */}
      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={() => { undoToast.onUndo(); setUndoToast(null); }}
          onDismiss={() => setUndoToast(null)}
          durationMs={undoDurationMs}
        />
      )}
    </div>
  );
}
