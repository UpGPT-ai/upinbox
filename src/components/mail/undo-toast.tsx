'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  durationMs?: number;
}

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs = 8000,
}: UndoToastProps) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Trigger slide-up animation on mount
    const frame = requestAnimationFrame(() => {
      setVisible(true);
    });

    startTimeRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const remaining = Math.max(0, 1 - elapsed / durationMs);
      setProgress(remaining * 100);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = setTimeout(() => {
      onDismiss();
    }, durationMs);

    return () => {
      cancelAnimationFrame(frame);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [durationMs, onDismiss]);

  const handleUndo = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    onUndo();
  };

  const handleDismiss = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    onDismiss();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed bottom-4 right-4 z-50',
        'bg-foreground text-background rounded-xl px-4 py-3 shadow-2xl',
        'flex items-center gap-3 min-w-64',
        'overflow-hidden',
        'transition-transform duration-300 ease-out will-change-transform',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      ].join(' ')}
    >
      {/* Progress bar */}
      <span
        className="absolute bottom-0 left-0 h-[3px] bg-background/30 rounded-b-xl transition-none"
        style={{ width: `${progress}%` }}
        aria-hidden="true"
      />

      {/* Message */}
      <span className="flex-1 text-sm font-medium leading-none select-none">
        {message}
      </span>

      {/* Undo button */}
      <button
        type="button"
        onClick={handleUndo}
        className={[
          'shrink-0 text-sm font-semibold leading-none',
          'px-2.5 py-1 rounded-lg',
          'bg-background text-foreground',
          'hover:opacity-90 active:opacity-75',
          'transition-opacity focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-background/50',
        ].join(' ')}
      >
        Undo
      </button>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className={[
          'shrink-0 leading-none',
          'w-6 h-6 flex items-center justify-center rounded-lg',
          'text-background/70 hover:text-background hover:bg-background/10',
          'active:opacity-75 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/50',
        ].join(' ')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface ToastState {
  message: string;
  onUndo: () => void;
  visible: boolean;
}

export function useUndoToast(): {
  toast: ToastState | null;
  showToast: (message: string, onUndo: () => void) => void;
  dismissToast: () => void;
} {
  const [toast, setToast] = useState<ToastState | null>(null);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, onUndo: () => void) => {
    setToast({ message, onUndo, visible: true });
  }, []);

  return { toast, showToast, dismissToast };
}
