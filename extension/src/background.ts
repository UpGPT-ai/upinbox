/**
 * UpInbox Extension — Background Service Worker
 *
 * Handles:
 * - Message routing from content scripts and popup
 * - Email classification (all 4 paths)
 * - Badge count management
 * - Settings persistence
 */

import { classifyEmailWithRouter, testUplinkConnection } from './classifier';
import { getSettings, updateSettings, setBadgeCount } from './storage';
import type { ExtensionMessage, ClassifyEmailPayload } from './types';

// ─── In-memory state (cleared on service worker restart) ──────────────────────

// Action-required count per tab (drives badge)
const tabActionCounts = new Map<number, number>();

// BYOK key is kept in-memory only, never persisted
// It's forwarded from popup on each classification request
let sessionByokKey: string | undefined;

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((err) => {
      console.error('[UpInbox background] message error:', err);
      sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
    });
    return true; // keep channel open for async response
  }
);

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case 'GET_SETTINGS':
      return getSettings();

    case 'UPDATE_SETTINGS':
      return updateSettings(message.payload);

    case 'SET_BYOK_KEY':
      // Store in-memory only — never persisted
      sessionByokKey = message.payload.apiKey;
      return { ok: true };

    case 'TEST_UPLINK': {
      const settings = await getSettings();
      const result = await testUplinkConnection(settings.uplinkUrl, settings.uplinkModel);
      return { type: 'TEST_UPLINK_RESULT', payload: result };
    }

    case 'CLASSIFY_EMAIL': {
      const settings = await getSettings();
      const byokKey = message.payload.byokApiKey ?? sessionByokKey;

      // Strip byokApiKey from payload before passing to classifier
      const { byokApiKey: _stripped, ...classifyPayload } = message.payload as ClassifyEmailPayload & { byokApiKey?: string };
      void _stripped;

      const result = await classifyEmailWithRouter(classifyPayload, settings, byokKey);

      // Update badge count for this tab
      if (settings.showBadge && sender.tab?.id != null) {
        const tabId = sender.tab.id;
        if (result.category === settings.badgeCountCategory) {
          const current = tabActionCounts.get(tabId) ?? 0;
          tabActionCounts.set(tabId, current + 1);
          await setBadgeCount(current + 1);
        }
      }

      return result;
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ─── Tab lifecycle ────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActionCounts.delete(tabId);
});

// ─── Install / update handlers ────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    // Open onboarding tab on first install
    chrome.tabs.create({ url: 'https://upinbox.ai/welcome?source=extension' });
  }
});
