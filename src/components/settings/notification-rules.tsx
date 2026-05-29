"use client";

import { useState, useEffect, useCallback } from "react";

interface FeedToggle {
  id: string;
  label: string;
  enabled: boolean;
}

interface NotificationSettings {
  pushEnabled: boolean;
  feedToggles: FeedToggle[];
  quietHoursStart: string;
  quietHoursEnd: string;
  dndEnabled: boolean;
}

const DEFAULT_FEED_TOGGLES: FeedToggle[] = [
  { id: "action_needed", label: "Action Needed", enabled: true },
  { id: "focus", label: "Focus", enabled: true },
  { id: "newsletters", label: "Newsletters", enabled: false },
  { id: "promotions", label: "Promotions", enabled: false },
  { id: "social", label: "Social", enabled: false },
  { id: "updates", label: "Updates", enabled: false },
  { id: "forums", label: "Forums", enabled: false },
];

const DEFAULT_SETTINGS: NotificationSettings = {
  pushEnabled: false,
  feedToggles: DEFAULT_FEED_TOGGLES,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  dndEnabled: false,
};

const STORAGE_KEY = "upinbox_notification_settings";

function loadSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      pushEnabled: parsed.pushEnabled ?? DEFAULT_SETTINGS.pushEnabled,
      feedToggles: parsed.feedToggles ?? DEFAULT_SETTINGS.feedToggles,
      quietHoursStart: parsed.quietHoursStart ?? DEFAULT_SETTINGS.quietHoursStart,
      quietHoursEnd: parsed.quietHoursEnd ?? DEFAULT_SETTINGS.quietHoursEnd,
      dndEnabled: parsed.dndEnabled ?? DEFAULT_SETTINGS.dndEnabled,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: NotificationSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

async function subscribeToPush(): Promise<boolean> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    return true;
  } catch (err) {
    console.error("[NotificationRules] Push subscribe failed:", err);
    return false;
  }
}

async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
  } catch (err) {
    console.error("[NotificationRules] Push unsubscribe failed:", err);
  }
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, id, disabled = false }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        checked ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

export function NotificationRules() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [permissionState, setPermissionState] = useState<NotificationPermission>("default");
  const [pushLoading, setPushLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    if ("Notification" in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  const persist = useCallback((next: NotificationSettings) => {
    setSettings(next);
    saveSettings(next);
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, []);

  const handlePushToggle = async (enabled: boolean) => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (enabled) {
        const success = await subscribeToPush();
        if (success) {
          setPermissionState(Notification.permission);
          persist({ ...settings, pushEnabled: true });
        } else {
          setPermissionState(Notification.permission);
        }
      } else {
        await unsubscribeFromPush();
        persist({ ...settings, pushEnabled: false });
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handleFeedToggle = (id: string, enabled: boolean) => {
    const next: NotificationSettings = {
      ...settings,
      feedToggles: settings.feedToggles.map((f) =>
        f.id === id ? { ...f, enabled } : f
      ),
    };
    persist(next);
  };

  const handleQuietHoursChange = (field: "quietHoursStart" | "quietHoursEnd", value: string) => {
    persist({ ...settings, [field]: value });
  };

  const handleDndToggle = (enabled: boolean) => {
    persist({ ...settings, dndEnabled: enabled });
  };

  const pushBlocked = permissionState === "denied";

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Notification Preferences
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Control how and when UpInbox notifies you.
        </p>
      </div>

      {/* Push notifications */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label
              htmlFor="push-toggle"
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              Push Notifications
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {pushBlocked
                ? "Notifications are blocked. Enable them in browser settings."
                : "Receive alerts even when UpInbox is not open."}
            </p>
          </div>
          <Toggle
            id="push-toggle"
            checked={settings.pushEnabled}
            onChange={handlePushToggle}
            disabled={pushLoading || pushBlocked}
          />
        </div>
        {pushLoading && (
          <p className="text-xs text-blue-500 animate-pulse">Requesting permission...</p>
        )}
        {pushBlocked && (
          <p className="text-xs text-red-500">
            Permission denied. Open your browser site settings to re-enable.
          </p>
        )}
      </section>

      {/* Per-feed toggles */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
          Notify me for these feeds
        </h3>
        <ul className="space-y-4">
          {settings.feedToggles.map((feed) => (
            <li key={feed.id} className="flex items-center justify-between">
              <label
                htmlFor={`feed-toggle-${feed.id}`}
                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              >
                {feed.label}
              </label>
              <Toggle
                id={`feed-toggle-${feed.id}`}
                checked={feed.enabled}
                onChange={(val) => handleFeedToggle(feed.id, val)}
                disabled={!settings.pushEnabled && !feed.enabled}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Quiet hours */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Quiet Hours</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Suppress notifications during these hours.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label
              htmlFor="quiet-start"
              className="block text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              Start
            </label>
            <input
              id="quiet-start"
              type="time"
              value={settings.quietHoursStart}
              onChange={(e) => handleQuietHoursChange("quietHoursStart", e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="quiet-end"
              className="block text-xs font-medium text-gray-600 dark:text-gray-400"
            >
              End
            </label>
            <input
              id="quiet-end"
              type="time"
              value={settings.quietHoursEnd}
              onChange={(e) => handleQuietHoursChange("quietHoursEnd", e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {/* DND */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center justify-between">
          <div>
            <label
              htmlFor="dnd-toggle"
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              Do Not Disturb
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Pause all notifications indefinitely until turned off.
            </p>
          </div>
          <Toggle
            id="dnd-toggle"
            checked={settings.dndEnabled}
            onChange={handleDndToggle}
          />
        </div>
      </section>

      {/* Save indicator */}
      <div
        aria-live="polite"
        className={[
          "text-xs text-green-600 dark:text-green-400 transition-opacity duration-300",
          saved ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        Settings saved.
      </div>
    </div>
  );
}
