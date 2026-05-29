'use client';

/**
 * InboxInsights — proactive AI insights panel.
 *
 * Fetches from GET /api/upinbox/ai/insights?accountId=...
 * Slides in from the bottom when new (non-dismissed) insights arrive.
 * Each insight card can be dismissed; dismissed IDs are persisted to
 * localStorage under the key `upinbox:dismissed-insights`.
 *
 * Insight types handled:
 *   follow_up       — "N follow-ups due today" / single subject line
 *   dormant_contact — "You haven't replied to X in N days"
 *   inbox_spike     — health-score drop detected
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightType = 'follow_up' | 'dormant_contact' | 'inbox_spike';
type InsightSeverity = 'info' | 'warning';

interface Insight {
  type: InsightType;
  message: string;
  emailId?: string;
  contactEmail?: string;
  severity: InsightSeverity;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface InboxInsightsProps {
  accountId: string;
  /** Polling interval in ms. Defaults to 5 minutes. */
  pollIntervalMs?: number;
  /** Called when the user clicks the action button for a follow_up insight. */
  onFollowUpAction?: (emailId?: string) => void;
  /** Called when the user clicks the action button for a dormant_contact insight. */
  onDormantContactAction?: (contactEmail?: string) => void;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'upinbox:dismissed-insights';

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

/** Stable string key for an insight (used as the dismiss ID). */
function insightKey(insight: Insight): string {
  return `${insight.type}:${insight.emailId ?? insight.contactEmail ?? insight.message.slice(0, 40)}`;
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function InsightIcon({ type }: { type: InsightType }) {
  if (type === 'follow_up') {
    return (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  if (type === 'dormant_contact') {
    return (
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }

  // inbox_spike
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

// ─── Action label helpers ─────────────────────────────────────────────────────

function actionLabel(type: InsightType): string {
  if (type === 'follow_up') return 'Review';
  if (type === 'dormant_contact') return 'Send follow-up';
  return 'View inbox';
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InboxInsights({
  accountId,
  pollIntervalMs = 5 * 60 * 1000,
  onFollowUpAction,
  onDormantContactAction,
}: InboxInsightsProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/upinbox/ai/insights?accountId=${encodeURIComponent(accountId)}`,
        { credentials: 'same-origin' },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { insights?: Insight[] };
      const fresh = json.insights ?? [];
      setInsights(fresh);

      const currentDismissed = loadDismissed();
      const hasNew = fresh.some((i) => !currentDismissed.has(insightKey(i)));
      if (hasNew) setVisible(true);
    } catch {
      // network error — swallow silently
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchInsights();

    timerRef.current = setInterval(fetchInsights, pollIntervalMs);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [fetchInsights, pollIntervalMs]);

  const dismiss = useCallback((insight: Insight) => {
    const key = insightKey(insight);
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveDismissed(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    const next = new Set(dismissed);
    insights.forEach((i) => next.add(insightKey(i)));
    saveDismissed(next);
    setDismissed(next);
    setVisible(false);
  }, [dismissed, insights]);

  const handleAction = useCallback(
    (insight: Insight) => {
      if (insight.type === 'follow_up') {
        onFollowUpAction?.(insight.emailId);
      } else if (insight.type === 'dormant_contact') {
        onDormantContactAction?.(insight.contactEmail);
      }
      dismiss(insight);
    },
    [dismiss, onFollowUpAction, onDormantContactAction],
  );

  const visibleInsights = insights.filter((i) => !dismissed.has(insightKey(i)));

  if (!visible || visibleInsights.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Inbox insights"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '360px',
        width: '100%',
        // Slide-in animation via keyframe defined below
        animation: 'upinbox-slide-up 240ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Inject keyframe once */}
      <style>{`
        @keyframes upinbox-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '2px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-muted-foreground, #6b7280)',
          }}
        >
          AI Insights {loading && '…'}
        </span>
        <button
          onClick={dismissAll}
          aria-label="Dismiss all insights"
          style={{
            fontSize: '11px',
            color: 'var(--color-muted-foreground, #6b7280)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
          }}
        >
          Dismiss all
        </button>
      </div>

      {/* Insight cards */}
      {visibleInsights.map((insight) => {
        const key = insightKey(insight);
        const isWarning = insight.severity === 'warning';

        return (
          <div
            key={key}
            role="alert"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'var(--color-card, #ffffff)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              borderLeft: `3px solid ${isWarning ? '#f59e0b' : '#3b82f6'}`,
            }}
          >
            {/* Icon */}
            <span
              style={{
                flexShrink: 0,
                marginTop: '1px',
                color: isWarning ? '#f59e0b' : '#3b82f6',
              }}
            >
              <InsightIcon type={insight.type} />
            </span>

            {/* Body */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: '0 0 8px',
                  fontSize: '13px',
                  lineHeight: '1.45',
                  color: 'var(--color-foreground, #111827)',
                  wordBreak: 'break-word',
                }}
              >
                {insight.message}
              </p>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => handleAction(insight)}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#ffffff',
                    background: isWarning ? '#f59e0b' : '#3b82f6',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {actionLabel(insight.type)}
                </button>

                <button
                  onClick={() => dismiss(insight)}
                  aria-label="Dismiss this insight"
                  style={{
                    fontSize: '12px',
                    color: 'var(--color-muted-foreground, #6b7280)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 6px',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => dismiss(insight)}
              aria-label="Close insight"
              style={{
                flexShrink: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-muted-foreground, #9ca3af)',
                padding: '0',
                lineHeight: 1,
              }}
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
      })}
    </div>
  );
}
