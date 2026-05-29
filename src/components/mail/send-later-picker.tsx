'use client';

/**
 * SendLaterPicker — dropdown for picking a scheduled send time in the compose window.
 *
 * Styled to match SnoozeSelector / LabelMenu:
 * absolute positioned, bg-popover, border, rounded-xl, shadow-xl.
 *
 * Quick options: In 1 hour, Tomorrow morning (8am), Tomorrow afternoon (2pm),
 * Monday morning (shown only Fri/Sat/Sun). Plus a Custom inline datetime-local picker.
 */

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SendLaterPickerProps {
  onSelect: (sendAt: Date) => void;
  onClose: () => void;
}

interface SendLaterOption {
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

/**
 * Returns the minimum selectable datetime (now + 5 minutes) as a datetime-local string.
 */
function minDatetimeLocalValue(): string {
  const min = new Date(Date.now() + 5 * 60 * 1000);
  return toDatetimeLocalValue(min);
}

/**
 * Returns the set of available quick send-later options relative to now.
 * "Monday morning" is only included when today is Friday, Saturday, or Sunday.
 */
export function getSendLaterOptions(): SendLaterOption[] {
  const now = new Date();
  const options: SendLaterOption[] = [];

  // In 1 hour
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  options.push({
    label: 'In 1 hour',
    emoji: '⏰',
    date: inOneHour,
    preview: formatPreview(inOneHour),
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

  // Tomorrow afternoon — 2:00 PM tomorrow
  const tomorrowAfternoon = new Date(now);
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
  tomorrowAfternoon.setHours(14, 0, 0, 0);
  options.push({
    label: 'Tomorrow afternoon',
    emoji: '☀️',
    date: tomorrowAfternoon,
    preview: formatPreview(tomorrowAfternoon),
  });

  // Monday morning — shown only on Fri (5), Sat (6), Sun (0)
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
    const daysUntilMonday = dayOfWeek === 0
      ? 1        // Sunday → 1 day away
      : dayOfWeek === 5
      ? 3        // Friday → 3 days away
      : 2;       // Saturday → 2 days away

    const mondayMorning = new Date(now);
    mondayMorning.setDate(mondayMorning.getDate() + daysUntilMonday);
    mondayMorning.setHours(8, 0, 0, 0);
    options.push({
      label: 'Monday morning',
      emoji: '📅',
      date: mondayMorning,
      preview: formatPreview(mondayMorning),
    });
  }

  return options;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SendLaterPicker({ onSelect, onClose }: SendLaterPickerProps) {
  const options = getSendLaterOptions();

  // Default custom time: tomorrow morning 8 AM
  const defaultCustom = new Date();
  defaultCustom.setDate(defaultCustom.getDate() + 1);
  defaultCustom.setHours(8, 0, 0, 0);

  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<string>(
    toDatetimeLocalValue(defaultCustom),
  );

  const handleQuickSelect = (date: Date) => {
    onSelect(date);
    onClose();
  };

  const handleSchedule = () => {
    if (!customValue) return;
    const date = new Date(customValue);
    if (isNaN(date.getTime())) return;
    onSelect(date);
    onClose();
  };

  return (
    <div className="absolute bottom-10 right-0 z-50 bg-popover border rounded-xl shadow-xl w-64 py-1 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Send later…
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
            min={minDatetimeLocalValue()}
            onChange={(e) => setCustomValue(e.target.value)}
            className={[
              'w-full rounded-md border border-input bg-background px-2 py-1',
              'text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            ].join(' ')}
          />
          <button
            onClick={handleSchedule}
            disabled={!customValue}
            className={[
              'w-full rounded-md px-3 py-1 text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Schedule
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
