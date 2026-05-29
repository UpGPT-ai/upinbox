/**
 * UpInbox — Jotai atoms for mail state
 *
 * All client-side state lives here. Server state is fetched via API routes
 * and stored in React Query; atoms hold UI state (selection, active account, etc.)
 */

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// ─── Account state ────────────────────────────────────────────────────────────

/** The currently active account ID (persisted across sessions) */
export const activeAccountIdAtom = atomWithStorage<string | null>(
  'upinbox:activeAccountId',
  null
);

/**
 * Provider type of the active account.
 * Derived from account list — updated when account list loads.
 */
export const providerTypeAtom = atom<'jmap' | 'imap' | null>(null);

// ─── Mailbox navigation ───────────────────────────────────────────────────────

/** The currently selected mailbox ID */
export const activeMailboxIdAtom = atom<string | null>(null);

/**
 * When true: show unified inbox (all accounts merged).
 * Overrides activeMailboxIdAtom.
 */
export const unifiedInboxAtom = atom<boolean>(false);

/** Mailbox filter: 'all' | 'unread' | 'flagged' */
export const mailboxFilterAtom = atom<'all' | 'unread' | 'flagged'>('all');

// ─── Email selection ──────────────────────────────────────────────────────────

/** The currently open email ID (reading pane / detail view) */
export const openEmailIdAtom = atom<string | null>(null);

/** Multi-selected email IDs (for bulk operations) */
export const selectedEmailIdsAtom = atom<Set<string>>(new Set<string>());

/** Derived: number of selected emails */
export const selectedCountAtom = atom(
  (get) => get(selectedEmailIdsAtom).size
);

// ─── Search & Sort ────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

/** Sort direction for the email list */
export const sortDirAtom = atomWithStorage<SortDir>('upinbox:sortDir', 'desc');

export interface SearchFilters {
  /** Full-text search */
  query: string;
  /** Filter by sender email or name */
  from: string;
  /** Filter by subject */
  subject: string;
  /** Emails received after this date (yyyy-mm-dd) */
  after: string;
  /** Emails received before this date (yyyy-mm-dd) */
  before: string;
  /** Only show emails with attachments */
  hasAttachment: boolean;
}

const DEFAULT_SEARCH: SearchFilters = {
  query: '',
  from: '',
  subject: '',
  after: '',
  before: '',
  hasAttachment: false,
};

/** Current search filter state — resets when user clears search */
export const searchFiltersAtom = atom<SearchFilters>(DEFAULT_SEARCH);

/** True when any search filter is non-default */
export const isSearchActiveAtom = atom((get) => {
  const f = get(searchFiltersAtom);
  return !!(f.query || f.from || f.subject || f.after || f.before || f.hasAttachment);
});

// ─── Compose state ────────────────────────────────────────────────────────────

export type ComposeMode = 'closed' | 'new' | 'reply' | 'reply-all' | 'forward';

export interface ComposeDraft {
  mode: ComposeMode;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  inReplyToId?: string;
  identityEmail?: string;
}

const EMPTY_DRAFT: ComposeDraft = {
  mode: 'closed',
  to: [],
  cc: [],
  bcc: [],
  subject: '',
  body: '',
};

export const composeDraftAtom = atom<ComposeDraft>(EMPTY_DRAFT);

export const isComposeOpenAtom = atom(
  (get) => get(composeDraftAtom).mode !== 'closed'
);

// ─── UI state ─────────────────────────────────────────────────────────────────

/** Sidebar collapsed state (persisted) */
export const sidebarCollapsedAtom = atomWithStorage<boolean>(
  'upinbox:sidebarCollapsed',
  false
);

/** Top toolbar collapsed (persisted) — hides the h-11 toolbar row for more email space */
export const toolbarCollapsedAtom = atomWithStorage<boolean>(
  'upinbox:toolbarCollapsed',
  false
);

/** Reading pane position: 'right' | 'bottom' | 'none' (list only) */
export const readingPanePositionAtom = atomWithStorage<'right' | 'bottom' | 'none'>(
  'upinbox:readingPane',
  'right'
);

/** Whether to show the connect-account wizard */
export const showConnectWizardAtom = atom<boolean>(false);

/** Command palette open */
export const commandPaletteOpenAtom = atom<boolean>(false);

// ─── AI config state ─────────────────────────────────────────────────────────

export type ByokProvider = 'anthropic' | 'openai' | 'google' | null;
export type ByokModel = string | null;

/**
 * BYOK API key — stored in browser only, NEVER sent to UpInbox servers.
 * Stored in sessionStorage (not localStorage) so it clears on tab close.
 * User must re-enter on each browser session for maximum privacy.
 */
export const byokApiKeyAtom = atomWithStorage<string>(
  'upinbox:byokKey',
  '',
  {
    getItem: (key) => {
      if (typeof window === 'undefined') return '';
      return sessionStorage.getItem(key) ?? '';
    },
    setItem: (key, value) => {
      if (typeof window === 'undefined') return;
      sessionStorage.setItem(key, value);
    },
    removeItem: (key) => {
      if (typeof window === 'undefined') return;
      sessionStorage.removeItem(key);
    },
  }
);

export const byokProviderAtom = atomWithStorage<ByokProvider>(
  'upinbox:byokProvider',
  null
);

export const byokModelAtom = atomWithStorage<ByokModel>(
  'upinbox:byokModel',
  null
);

export const useUplinkAtom = atomWithStorage<boolean>(
  'upinbox:useUplink',
  false
);

export const uplinkEndpointAtom = atomWithStorage<string>(
  'upinbox:uplinkEndpoint',
  'http://localhost:11434'
);

/** Derived: is AI configured? (BYOK key present, UpLink enabled, or Intelligence API) */
export const hasAiConfiguredAtom = atom((get) => {
  const key = get(byokApiKeyAtom);
  const uplink = get(useUplinkAtom);
  return key.length > 0 || uplink;
});

// Toast/undo state
export interface UndoToastState {
  id: string;
  message: string;
  onUndo: () => void;
}
export const undoToastAtom = atom<UndoToastState | null>(null);

// Snooze panel open state (which email is being snoozed)
export const snoozeEmailIdAtom = atom<string | null>(null);

// Current email list cursor (for j/k keyboard nav)
export const emailCursorAtom = atom<number>(0);
