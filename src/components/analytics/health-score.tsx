'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Share2, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthScoreData {
  score: number;
  label: string;
  unreadCount: number;
  inboxCount: number;
  shareUrl: string;
  tips?: string[];
}

interface InboxHealthScoreProps {
  accountId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreColor(score: number): { stroke: string; text: string; bg: string } {
  if (score >= 75) return { stroke: '#22c55e', text: 'text-green-500', bg: 'bg-green-50' };
  if (score >= 40) return { stroke: '#f59e0b', text: 'text-amber-500', bg: 'bg-amber-50' };
  return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-50' };
}

function getLabelColor(score: number): string {
  if (score >= 75) return 'text-green-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

// ─── SVG Ring ────────────────────────────────────────────────────────────────

interface ScoreRingProps {
  score: number;
  size?: number;
}

function ScoreRing({ score, size = 128 }: ScoreRingProps) {
  const colors = getScoreColor(score);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`Inbox health score: ${score} out of 100`}
      role="img"
    >
      {/* Track ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={10}
      />
      {/* Progress ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out, stroke 0.4s ease' }}
      />
      {/* Score number */}
      <text
        x={center}
        y={center - 6}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={size * 0.22}
        fontWeight="700"
        fill="currentColor"
        className={colors.text}
        style={{ fill: colors.stroke }}
      >
        {score}
      </text>
      {/* "/100" label */}
      <text
        x={center}
        y={center + 14}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize={size * 0.1}
        fill="#9ca3af"
      >
        / 100
      </text>
    </svg>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-sm">
      <span className="font-semibold text-gray-900">{value.toLocaleString()}</span>
      <span className="text-gray-500">{label}</span>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HealthScore({ accountId }: InboxHealthScoreProps) {
  const [data, setData] = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/upinbox/health-score?accountId=${encodeURIComponent(accountId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const handleShare = useCallback(async () => {
    if (!data) return;
    const url = data.shareUrl;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement('textarea');
        el.value = url;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail — user can manually copy
    }
  }, [data]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-32 w-32 rounded-full bg-gray-100" />
        <div className="h-5 w-24 rounded bg-gray-100" />
        <div className="flex gap-2">
          <div className="h-7 w-20 rounded-full bg-gray-100" />
          <div className="h-7 w-20 rounded-full bg-gray-100" />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-600">Unable to load health score</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  const hasTips = data.tips && data.tips.length > 0;
  const labelColorClass = getLabelColor(data.score);

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      {/* Header */}
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
        Inbox Health Score
      </h2>

      {/* Ring + label */}
      <div className="flex flex-col items-center gap-1">
        <ScoreRing score={data.score} size={132} />
        <span className={`mt-1 text-base font-bold ${labelColorClass}`}>{data.label}</span>
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap justify-center gap-2">
        <StatPill label="unread" value={data.unreadCount} />
        <StatPill label="in inbox" value={data.inboxCount} />
      </div>

      {/* Share button */}
      <button
        type="button"
        onClick={handleShare}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-95"
        aria-label="Copy share link to clipboard"
      >
        {copied ? (
          <>
            <Check size={14} className="text-green-500" />
            <span className="text-green-600">Link copied!</span>
          </>
        ) : (
          <>
            <Share2 size={14} />
            Share score
          </>
        )}
      </button>

      {/* Collapsible tips */}
      {hasTips && (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setTipsOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            aria-expanded={tipsOpen}
          >
            <span>Tips to improve your score</span>
            {tipsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {tipsOpen && (
            <ul className="mt-2 space-y-1.5 px-3">
              {data.tips!.map((tip, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600"
                >
                  <span className="mt-0.5 shrink-0 text-gray-400">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
