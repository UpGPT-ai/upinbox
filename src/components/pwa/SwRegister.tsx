'use client';

import { useEffect } from 'react';

/**
 * SwRegister — registers the PWA service worker on mount.
 * Silently no-ops when service workers are not supported.
 */
export default function SwRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration is non-critical — ignore errors
      });
    }
  }, []);

  return null;
}
