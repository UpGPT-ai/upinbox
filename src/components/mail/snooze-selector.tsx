'use client';

/**
 * SnoozeSelector — dropdown for choosing a snooze time for an email.
 *
 * Styled to match LabelMenu in email-detail.tsx:
 * absolute positioned, bg-popover, border, rounded-xl, shadow-xl.
 *
 * Quick options: Later today, This evening, Tomorrow morning,
 * This weekend, Next week. Plus a Custom inline datetime-local picker.
 */

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnoozeSelectorProps {
  emailId: string;
  accountId: string;
  onSnooze: (unsnoozeAt: Date) => void;
  onClose: () => void;
}

interface SnoozeOption {
  label: string;
  emoji: string;
  date: Date;
  preview: string;
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Formats a Date as a short preview string, e.g. "Tue, 8:00 AM".
 */
function formatPreview(date: Date): string {
  return date.toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Returns the set of available quick-snooze options relative to now.
 * "Later today" is only included when the current time is before 5:00 PM.
 */
export function getSnoozeOptions(): SnoozeOption[] {
  const now = new Date();
  const options: SnoozeOption[] = [];

  // Later today — 4 hours from now, only if that still falls before 5pm
  const laterToday = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  if (now.getHours() < 17) {
    options.push({
      label: 'Later today',
      emoji: '☀️',
      date: laterToday,
      preview: formatPreview(laterToday),
    });
  }

  // This evening — 6:00 PM today
  const thisEvening = new Date(now);
  thisEvening.setHours(18, 0, 0, 0);
  options.push({
    label: 'This evening',
    emoji: '🌆',
    date: thisEvening,
    preview: formatPreview(thisEvening),
  });

  // Tomorrow morning — 8:00 AM tomorrow
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(8, 0, 0, 0);
  options.push({
    label: 'Tomorrow morning',
    emoji: '🌅',
    date: tomorrowMorning,
    preview: formatPreview(tomorrowMorning),
  });

  // This weekend — Saturday 8:00 AM
  // If today is already Saturday or Sunday, jump to *next* Saturday.
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const daysUntilSaturday = dayOfWeek === 6
    ? 7                        // already Saturday → next Saturday
    : (6 - dayOfWeek) || 7;   // Sunday → 6 days, Mon-Fri → days remaining

  const thisWeekend = new Date(now);
  thisWeekend.setDate(thisWeekend.getDate() + daysUntilSaturday);
  thisWeekend.setHours(8, 0, 0, 0);
  options.push({
    label: 'This weekend',
    emoji: '🏖️',
    date: thisWeekend,
    preview: formatPreview(thisWeekend),
  });

  // Next week — Monday 8:00 AM
  const daysUntilMonday = dayOfWeek === 1
    ? 7                        // already Monday → next Monday
    : (8 - dayOfWeek) % 7 || 7;

  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(8, 0, 0, 0);
  options.push({
    label: 'Next week',
    emoji: '📅',
    date: nextWeek,
    preview: formatPreview(nextWeek),
  });

  return options;
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

export function SnoozeSelector({ onSnooze, onClose }: SnoozeSelectorProps) {
  const options = getSnoozeOptions();

  // Default custom time: tomorrow morning 8 AM
  const defaultCustom = new Date();
  defaultCustom.setDate(defaultCustom.getDate() + 1);
  defaultCustom.setHours(8, 0, 0, 0);

  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<string>(
    toDatetimeLocalValue(defaultCustom),
  );

  const handleQuickSelect = (date: Date) => {
    onSnooze(date);
    onClose();
  };

  const handleCustomSet = () => {
    if (!customValue) return;
    const date = new Date(customValue);
    if (isNaN(date.getTime())) return;
    onSnooze(date);
    onClose();
  };

  return (
    <div className="absolute top-8 right-0 z-50 bg-popover border rounded-xl shadow-xl w-64 py-1 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Snooze until…
      </div>

      {/* Quick options */}
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => handleQuickSelect(opt.date)}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          <span className="text-base leading-none flex-shrink-0">{opt.emoji}</span>
          <span className="flex-1 text-left">{opt.label}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{opt.preview}</span>
        </button>
      ))}

      {/* Custom option */}
      <button
        onClick={() => setShowCustom((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors"
      >
        <span className="text-base leading-none flex-shrink-0">🕐</span>
        <span className="flex-1 text-left">Custom</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {showCustom ? '▲' : '▼'}
        </span>
      </button>

      {/* Inline custom picker */}
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
            disabled={!customValue}
            className={[
              'w-full rounded-md px-3 py-1 text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Set snooze
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="border-t mt-1 pt-1">
        <button
          onClick={onClose}
          className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
