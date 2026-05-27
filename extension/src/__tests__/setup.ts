/**
 * Test setup — stub Chrome extension APIs
 */

import { vi } from 'vitest';

// Minimal chrome.runtime stub
Object.defineProperty(globalThis, 'chrome', {
  value: {
    runtime: {
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      lastError: undefined,
    },
    storage: {
      sync: {
        get: vi.fn((_key, cb) => cb({})),
        set: vi.fn((_data, cb) => cb?.()),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      create: vi.fn(),
    },
  },
  writable: true,
});

// performance.now() is available in jsdom, but just in case:
if (typeof performance === 'undefined') {
  Object.defineProperty(globalThis, 'performance', {
    value: { now: () => Date.now() },
  });
}
