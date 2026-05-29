'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuleCriteria {
  from?: string;
  subjectContains?: string;
  olderThanDays?: number;
  labelId?: string;
}

interface AutoArchiveRule {
  id: string;
  name: string;
  criteria: RuleCriteria;
  enabled: boolean;
  last_run_at: string | null;
  archived_count: number;
  created_at: string;
}

interface AutoArchiveRulesProps {
  accountId: string;
}

// ─── Preset suggestions ───────────────────────────────────────────────────────

const PRESETS: Array<{ label: string; name: string; criteria: RuleCriteria }> = [
  {
    label: 'Newsletters older than 7 days',
    name: 'Old newsletters',
    criteria: { subjectContains: 'unsubscribe', olderThanDays: 7 },
  },
  {
    label: 'Notifications older than 3 days',
    name: 'Old notifications',
    criteria: { subjectContains: 'notification', olderThanDays: 3 },
  },
  {
    label: 'No-reply senders older than 14 days',
    name: 'No-reply auto-archive',
    criteria: { from: 'no-reply', olderThanDays: 14 },
  },
  {
    label: 'Receipts older than 30 days',
    name: 'Old receipts',
    criteria: { subjectContains: 'receipt', olderThanDays: 30 },
  },
  {
    label: 'Automated alerts older than 2 days',
    name: 'Automated alerts',
    criteria: { subjectContains: 'alert', olderThanDays: 2 },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function describeCriteria(c: RuleCriteria): string {
  const parts: string[] = [];
  if (c.from) parts.push(`from "${c.from}"`);
  if (c.subjectContains) parts.push(`subject contains "${c.subjectContains}"`);
  if (c.olderThanDays) parts.push(`older than ${c.olderThanDays}d`);
  if (c.labelId) parts.push(`in label "${c.labelId}"`);
  return parts.join(' · ') || 'No criteria';
}

// ─── Add-rule form state ──────────────────────────────────────────────────────

interface FormState {
  name: string;
  from: string;
  subjectContains: string;
  olderThanDays: string;
  labelId: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  from: '',
  subjectContains: '',
  olderThanDays: '',
  labelId: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AutoArchiveRules({ accountId }: AutoArchiveRulesProps) {
  const [rules, setRules] = useState<AutoArchiveRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [runStatus, setRunStatus] = useState<{
    type: 'idle' | 'running' | 'done' | 'error';
    message?: string;
  }>({ type: 'idle' });

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // ── Fetch rules ─────────────────────────────────────────────────────────────

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/upinbox/auto-archive?accountId=${encodeURIComponent(accountId)}`,
      );
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load');
      const json = await res.json();
      setRules(json.rules ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // ── Focus name field when form opens ────────────────────────────────────────

  useEffect(() => {
    if (showForm) {
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [showForm]);

  // ── Apply preset ────────────────────────────────────────────────────────────

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setForm({
      name: preset.name,
      from: preset.criteria.from ?? '',
      subjectContains: preset.criteria.subjectContains ?? '',
      olderThanDays: preset.criteria.olderThanDays?.toString() ?? '',
      labelId: preset.criteria.labelId ?? '',
    });
    setShowForm(true);
  }

  // ── Submit new rule ──────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const criteria: RuleCriteria = {};
    if (form.from.trim()) criteria.from = form.from.trim();
    if (form.subjectContains.trim()) criteria.subjectContains = form.subjectContains.trim();
    if (form.olderThanDays.trim()) {
      const n = parseInt(form.olderThanDays, 10);
      if (isNaN(n) || n < 1) {
        setFormError('"Older than" must be a positive number of days.');
        return;
      }
      criteria.olderThanDays = n;
    }
    if (form.labelId.trim()) criteria.labelId = form.labelId.trim();

    if (!criteria.from && !criteria.subjectContains && !criteria.olderThanDays && !criteria.labelId) {
      setFormError('Add at least one criterion.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Rule name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/upinbox/auto-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, name: form.name.trim(), criteria }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to create rule');
      }
      const json = await res.json();
      setRules((prev) => [json.rule, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Delete rule ──────────────────────────────────────────────────────────────

  async function handleDelete(ruleId: string) {
    setDeletingId(ruleId);
    try {
      const res = await fetch(
        `/api/upinbox/auto-archive?id=${encodeURIComponent(ruleId)}&accountId=${encodeURIComponent(accountId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? 'Delete failed');
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      console.error('[AutoArchiveRules] delete error:', err);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Run now ──────────────────────────────────────────────────────────────────

  async function handleRunNow() {
    setRunStatus({ type: 'running' });
    try {
      const res = await fetch(
        `/api/upinbox/auto-archive/run?accountId=${encodeURIComponent(accountId)}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? 'Run failed');
      const json = await res.json();
      setRunStatus({
        type: 'done',
        message: `${json.archived} email${json.archived !== 1 ? 's' : ''} archived across ${json.rulesRun} rule${json.rulesRun !== 1 ? 's' : ''}.`,
      });
      // Refresh to show updated last_run_at and archived_count
      await fetchRules();
    } catch (err) {
      setRunStatus({ type: 'error', message: (err as Error).message });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Auto-Archive Rules
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Automatically move matching emails to your archive mailbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Run-now button */}
          <button
            type="button"
            onClick={handleRunNow}
            disabled={runStatus.type === 'running' || rules.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {runStatus.type === 'running' ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                Running…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zm-.5 2.75a.75.75 0 0 1 1.28-.53l2.5 2.5a.75.75 0 0 1 0 1.06l-2.5 2.5a.75.75 0 0 1-1.28-.53V5.25z" />
                </svg>
                Run now
              </>
            )}
          </button>

          {/* Add rule button */}
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setFormError(null);
              if (!showForm) setForm(EMPTY_FORM);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {showForm ? 'Cancel' : '+ Add rule'}
          </button>
        </div>
      </div>

      {/* Run feedback */}
      {runStatus.type === 'done' && (
        <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          <span>{runStatus.message}</span>
          <button
            type="button"
            onClick={() => setRunStatus({ type: 'idle' })}
            className="ml-3 opacity-60 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}
      {runStatus.type === 'error' && (
        <div className="flex items-center justify-between rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/20 dark:text-rose-400">
          <span>{runStatus.message}</span>
          <button
            type="button"
            onClick={() => setRunStatus({ type: 'idle' })}
            className="ml-3 opacity-60 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Add-rule form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-900/10"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
            New rule
          </p>

          {/* Preset suggestions */}
          <div className="mb-4">
            <p className="mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">Quick presets:</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs text-zinc-600 transition hover:border-indigo-300 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Rule name */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Rule name <span className="text-rose-500">*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My auto-archive rule"
                maxLength={120}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* From */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Sender contains
              </label>
              <input
                type="text"
                value={form.from}
                onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                placeholder="e.g. no-reply"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Subject contains */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Subject contains
              </label>
              <input
                type="text"
                value={form.subjectContains}
                onChange={(e) => setForm((f) => ({ ...f, subjectContains: e.target.value }))}
                placeholder="e.g. unsubscribe"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Older than */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Older than (days)
              </label>
              <input
                type="number"
                min={1}
                value={form.olderThanDays}
                onChange={(e) => setForm((f) => ({ ...f, olderThanDays: e.target.value }))}
                placeholder="e.g. 7"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Label / mailbox ID */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Label / mailbox ID
              </label>
              <input
                type="text"
                value={form.labelId}
                onChange={(e) => setForm((f) => ({ ...f, labelId: e.target.value }))}
                placeholder="Optional mailbox filter"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {formError && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{formError}</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {submitting ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                'Save rule'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-400">
          {error}
          <button
            type="button"
            onClick={fetchRules}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400 dark:border-zinc-700">
          No auto-archive rules yet.
          <br />
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-1 text-indigo-600 underline hover:no-underline dark:text-indigo-400"
          >
            Add your first rule
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {/* Enabled indicator */}
                  <span
                    className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      rule.enabled
                        ? 'bg-emerald-500'
                        : 'bg-zinc-300 dark:bg-zinc-600'
                    }`}
                    title={rule.enabled ? 'Enabled' : 'Disabled'}
                  />
                  <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {rule.name}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {describeCriteria(rule.criteria)}
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>Last run: {formatDate(rule.last_run_at)}</span>
                  <span>{rule.archived_count} archived total</span>
                </div>
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDelete(rule.id)}
                disabled={deletingId === rule.id}
                className="flex-shrink-0 rounded p-1 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                title="Delete rule"
                aria-label={`Delete rule "${rule.name}"`}
              >
                {deletingId === rule.id ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5zM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1H3v9A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5v-9h1.5a.5.5 0 0 0 0-1H11zm-7.5 1h9v9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9zM6.5 5a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5z" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
