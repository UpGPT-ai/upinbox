'use client';

/**
 * FollowUpSelector — dropdown for scheduling a follow-up reminder on an email.
 *
 * Styled to match SnoozeSelector: absolute positioned, bg-popover, border,
 * rounded-xl, shadow-xl, same button row layout.
 *
 * Quick options: Tomorrow, 3 days, Next week, 2 weeks.
 * Plus a Custom inline datetime-local picker.
 *
 * On selection POSTs to /api/upinbox/follow-ups and calls onClose().
 */

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FollowUpSelectorProps {
  emailId: string;
  accountId: string;
  threadSubject?: string;
  onClose: () => void;
}

interface FollowUpOption {
  label: string;
  emoji: string;
  date: Date;
  preview: string;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Formats a Date as a short preview string, e.g. "Thu, 9:00 AM".
 */
function formatPreview(date: Date): string {
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Returns the fixed set of quick follow-up options relative to now.
 * Each lands at 9:00 AM on the target day for a clear working-hours reminder.
 */
function getFollowUpOptions(): FollowUpOption[] {
  const now = new Date();

  const at9am = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(9, 0, 0, 0);
    return d;
  };

  const daysFromNow = (n: number): Date => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return at9am(d);
  };

  // Next Monday from now (at least 7 days out if today is Monday)
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = daysFromNow(daysUntilMonday);

  return [
    {
      label: 'Tomorrow',
      emoji: '📬',
      date: daysFromNow(1),
      preview: formatPreview(daysFromNow(1)),
    },
    {
      label: '3 days',
      emoji: '📅',
      date: daysFromNow(3),
      preview: formatPreview(daysFromNow(3)),
    },
    {
      label: 'Next week',
      emoji: '🗓️',
      date: nextMonday,
      preview: formatPreview(nextMonday),
    },
    {
      label: '2 weeks',
      emoji: '⏳',
      date: daysFromNow(14),
      preview: formatPreview(daysFromNow(14)),
    },
  ];
}

/**
 * Converts a Date to a value string compatible with <input type="datetime-local">.
 * Format: "YYYY-MM-DDTHH:mm"
 */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FollowUpSelector({
  emailId,
  accountId,
  threadSubject,
  onClose,
}: FollowUpSelectorProps) {
  const options = getFollowUpOptions();

  // Default custom time: 3 days from now at 9 AM
  const defaultCustom = new Date();
  defaultCustom.setDate(defaultCustom.getDate() + 3);
  defaultCustom.setHours(9, 0, 0, 0);

  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<string>(
    toDatetimeLocalValue(defaultCustom),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduleFollowUp = async (remindAt: Date) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/upinbox/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId,
          accountId,
          threadSubject: threadSubject ?? null,
          remindAt: remindAt.toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule follow-up');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (date: Date) => {
    scheduleFollowUp(date);
  };

  const handleCustomSet = () => {
    if (!customValue) return;
    const date = new Date(customValue);
    if (isNaN(date.getTime())) return;
    scheduleFollowUp(date);
  };

  return (
    <div className="absolute top-8 right-0 z-50 bg-popover border rounded-xl shadow-xl w-72 py-1 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Follow up in…
      </div>

      {/* Quick options */}
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => handleQuickSelect(opt.date)}
          disabled={loading}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-base leading-none flex-shrink-0">{opt.emoji}</span>
          <span className="flex-1 text-left">{opt.label}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{opt.preview}</span>
        </button>
      ))}

      {/* Custom option toggle */}
      <button
        onClick={() => setShowCustom((v) => !v)}
        disabled={loading}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="text-base leading-none flex-shrink-0">🕐</span>
        <span className="flex-1 text-left">Custom</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {showCustom ? '▲' : '▼'}
        </span>
      </button>

      {/* Inline custom datetime picker */}
      {showCustom && (
        <div className="px-3 pb-2 pt-1 space-y-1.5">
          <input
            type="datetime-local"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className={[
              'w-full rounded-md border border-input bg-background px-2 py-1',
              'text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            ].join(' ')}
          />
          <button
            onClick={handleCustomSet}
            disabled={!customValue || loading}
            className={[
              'w-full rounded-md px-3 py-1 text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {loading ? 'Scheduling…' : 'Set reminder'}
          </button>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p className="px-3 pb-1 text-xs text-destructive">{error}</p>
      )}

      {/* Footer */}
      <div className="border-t mt-1 pt-1">
        <button
          onClick={onClose}
          disabled={loading}
          className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
