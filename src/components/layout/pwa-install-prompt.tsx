'use client';

import { useState, useEffect } from 'react';
import { usePwa } from '@/hooks/use-pwa';

const DISMISSED_KEY = 'upinbox:pwa-install-dismissed';

export function PwaInstallPrompt() {
  const { isInstallable, installApp, isInstalled } = usePwa();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
    } catch {
      // localStorage unavailable (private mode, etc.)
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const handleInstall = async () => {
    await installApp();
    setDismissed(true);
  };

  // Don't render until mounted (avoids SSR mismatch), hide when not installable,
  // already installed, or user dismissed
  if (!mounted || !isInstallable || isInstalled || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        {/* App icon placeholder */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="white"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
            <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
          </svg>
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Install UpInbox
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Add to your home screen for faster access
          </p>
        </div>

        {/* Dismiss X */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleInstall}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
