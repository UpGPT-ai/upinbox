/**
 * Chrome storage wrapper — typed, Promise-based.
 *
 * chrome.storage.sync  → ExtensionSettings (persisted, synced across devices)
 * sessionStorage       → BYOK API key (tab-scoped, never persisted)
 *
 * We intentionally avoid storing API keys in chrome.storage because sync
 * storage can be read by any other extension code. The key lives only in
 * popup context sessionStorage and is passed explicitly to the background
 * service worker per classification request.
 */

import type { ExtensionSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'upinbox:settings';

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (result) => {
      const stored = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: updated }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(updated);
      }
    });
  });
}

export function onSettingsChanged(
  callback: (newSettings: ExtensionSettings) => void
): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (SETTINGS_KEY in changes) {
      const raw = changes[SETTINGS_KEY].newValue as Partial<ExtensionSettings> | undefined;
      callback({ ...DEFAULT_SETTINGS, ...raw });
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

export async function setBadgeCount(count: number): Promise<void> {
  const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#e11d48' : '#6b7280' });
}

export async function clearBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: '' });
}
