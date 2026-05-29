'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PwaInstallPrompt — shows a native-style "Add to Home Screen" banner
 * when the browser fires the beforeinstallprompt event.
 * Renders nothing on desktop or when already installed.
 */
export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border rounded-xl shadow-lg px-4 py-3 text-sm">
      <span>Install UpInbox for offline access</span>
      <button
        onClick={handleInstall}
        className="px-3 py-1 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
      >
        Install
      </button>
      <button
        onClick={() => setDeferredPrompt(null)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
