'use client';

import { useEffect } from 'react';

export interface ShortcutHandlers {
  onNavigateNext: () => void;      // j — next email
  onNavigatePrev: () => void;      // k — previous email
  onArchive: () => void;           // e — archive
  onDelete: () => void;            // # (shift+3) — delete/trash
  onReply: () => void;             // r — reply
  onReplyAll: () => void;          // a — reply all
  onForward: () => void;           // f — forward
  onStar: () => void;              // s — star/flag
  onCompose: () => void;           // c — compose new
  onSearch: () => void;            // / — focus search
  onCommandPalette: () => void;    // cmd+k or ctrl+k — open palette
  onHelp: () => void;              // ? — show shortcuts
  onMarkRead: () => void;          // shift+i — mark read
  onMarkUnread: () => void;        // shift+u — mark unread
  onSnooze: () => void;            // h — snooze
  onEscape: () => void;            // escape — close/deselect
}

export const SHORTCUTS_HELP: Array<{ key: string; description: string; group: string }> = [
  // Navigation
  { key: 'j', description: 'Next email', group: 'Navigation' },
  { key: 'k', description: 'Previous email', group: 'Navigation' },
  { key: '/', description: 'Focus search', group: 'Navigation' },
  { key: 'Escape', description: 'Close / deselect', group: 'Navigation' },

  // Actions
  { key: 'e', description: 'Archive', group: 'Actions' },
  { key: '#', description: 'Delete / trash', group: 'Actions' },
  { key: 'h', description: 'Snooze', group: 'Actions' },
  { key: 's', description: 'Star / flag', group: 'Actions' },

  // Compose & Reply
  { key: 'c', description: 'Compose new email', group: 'Compose & Reply' },
  { key: 'r', description: 'Reply', group: 'Compose & Reply' },
  { key: 'a', description: 'Reply all', group: 'Compose & Reply' },
  { key: 'f', description: 'Forward', group: 'Compose & Reply' },

  // Read status
  { key: 'Shift+I', description: 'Mark as read', group: 'Read Status' },
  { key: 'Shift+U', description: 'Mark as unread', group: 'Read Status' },

  // App
  { key: 'Cmd+K / Ctrl+K', description: 'Open command palette', group: 'App' },
  { key: '?', description: 'Show keyboard shortcuts', group: 'App' },
];

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;

  const tagName = active.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if ((active as HTMLElement).isContentEditable) {
    return true;
  }

  // Quill editor
  if (active.classList.contains('ql-editor')) {
    return true;
  }

  // Walk up the DOM — handle Quill wrapper divs and other rich-text containers
  let node: Element | null = active;
  while (node) {
    if (node.classList.contains('ql-editor')) {
      return true;
    }
    node = node.parentElement;
  }

  return false;
}

export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent): void {
      // Always allow cmd+k / ctrl+k (command palette) regardless of focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handlers.onCommandPalette();
        return;
      }

      // Skip all other shortcuts when typing in an input/editor
      if (isInputFocused()) return;

      // Escape — no modifier check needed
      if (e.key === 'Escape') {
        handlers.onEscape();
        return;
      }

      // Single-character shortcuts (no meta/ctrl — those are browser/OS shortcuts)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        // Navigation
        case 'j':
          handlers.onNavigateNext();
          break;
        case 'k':
          handlers.onNavigatePrev();
          break;

        // Search
        case '/':
          e.preventDefault(); // prevent browser quick-find in Firefox
          handlers.onSearch();
          break;

        // Actions
        case 'e':
          handlers.onArchive();
          break;
        case '#':
          // Shift+3 on US keyboards
          handlers.onDelete();
          break;
        case 'h':
          handlers.onSnooze();
          break;
        case 's':
          handlers.onStar();
          break;

        // Compose & Reply
        case 'c':
          handlers.onCompose();
          break;
        case 'r':
          handlers.onReply();
          break;
        case 'a':
          handlers.onReplyAll();
          break;
        case 'f':
          handlers.onForward();
          break;

        // Read status (shift+i and shift+u)
        case 'I':
          // e.shiftKey is true when key === 'I' on US keyboards
          handlers.onMarkRead();
          break;
        case 'U':
          handlers.onMarkUnread();
          break;

        // Help overlay — ? is shift+/ on US keyboards
        case '?':
          handlers.onHelp();
          break;

        default:
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handlers]);
}
