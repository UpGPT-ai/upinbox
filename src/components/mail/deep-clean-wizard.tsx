'use client';

import { useState, useCallback } from 'react';
import { X, Loader2, CheckCircle2, Trash2, Mail, Paperclip, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';

// ---- Types ----

type Step = 'SCAN' | 'REVIEW' | 'EXECUTE' | 'DONE';

interface ScanResult {
  oldEmails: number;
  newsletters: number;
  largeAttachments: number;
  totalCandidates: number;
}

interface SelectedActions {
  oldEmails: boolean;
  newsletters: boolean;
  largeAttachments: boolean;
}

interface Props {
  accountId: string;
  onClose: () => void;
}

// ---- Step indicator ----

const STEPS: Step[] = ['SCAN', 'REVIEW', 'EXECUTE', 'DONE'];

function StepIndicator({ current }: { current: Step }) {
  const labels: Record<Step, string> = {
    SCAN: 'Scan',
    REVIEW: 'Review',
    EXECUTE: 'Cleaning',
    DONE: 'Done',
  };
  const currentIndex = STEPS.indexOf(current);

  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, idx) => {
        const isComplete = idx < currentIndex;
        const isActive = idx === currentIndex;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={[
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors',
                isComplete
                  ? 'bg-green-500 text-white'
                  : isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              {isComplete ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
            </div>
            <span
              className={[
                'text-xs font-medium',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              {labels[step]}
            </span>
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  'h-px w-8 transition-colors',
                  isComplete ? 'bg-green-500' : 'bg-muted',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Scan step ----

function ScanStep({
  accountId,
  onComplete,
}: {
  accountId: string;
  onComplete: (result: ScanResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/upinbox/deep-clean?accountId=${encodeURIComponent(accountId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const data: ScanResult = await res.json();
      onComplete(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [accountId, onComplete]);

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
          <Mail className="w-7 h-7 text-blue-600" />
        </div>
        <h3 className="text-base font-semibold">Ready to scan your mailbox</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          We'll find old emails, newsletters, and large attachments you can safely remove.
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded px-3 py-2 w-full text-center">
          {error}
        </p>
      )}
      <Button onClick={runScan} disabled={loading} className="w-full max-w-xs">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Scanning…
          </>
        ) : (
          'Start Scan'
        )}
      </Button>
    </div>
  );
}

// ---- Review step ----

interface ReviewAction {
  key: keyof SelectedActions;
  label: string;
  description: string;
  count: number;
  icon: React.ReactNode;
}

function ReviewStep({
  scanResult,
  onExecute,
}: {
  scanResult: ScanResult;
  onExecute: (actions: SelectedActions) => void;
}) {
  const [selected, setSelected] = useState<SelectedActions>({
    oldEmails: false,
    newsletters: false,
    largeAttachments: false,
  });

  const actions: ReviewAction[] = [
    {
      key: 'oldEmails',
      label: 'Old emails',
      description: 'Emails older than 1 year with no replies',
      count: scanResult.oldEmails,
      icon: <Mail className="w-4 h-4 text-muted-foreground" />,
    },
    {
      key: 'newsletters',
      label: 'Newsletters',
      description: 'Bulk senders and mailing lists',
      count: scanResult.newsletters,
      icon: <Newspaper className="w-4 h-4 text-muted-foreground" />,
    },
    {
      key: 'largeAttachments',
      label: 'Large attachments',
      description: 'Emails with attachments over 5 MB',
      count: scanResult.largeAttachments,
      icon: <Paperclip className="w-4 h-4 text-muted-foreground" />,
    },
  ];

  const totalSelected = actions
    .filter((a) => selected[a.key])
    .reduce((sum, a) => sum + a.count, 0);

  const anySelected = Object.values(selected).some(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Found <span className="font-semibold text-foreground">{scanResult.totalCandidates}</span>{' '}
        candidates. Select what to clean:
      </p>
      <div className="flex flex-col gap-3">
        {actions.map((action) => (
          <label
            key={action.key}
            className={[
              'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
              selected[action.key]
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-border hover:bg-muted/50',
            ].join(' ')}
          >
            <Checkbox
              checked={selected[action.key]}
              onCheckedChange={(checked: boolean) =>
                setSelected((prev) => ({ ...prev, [action.key]: Boolean(checked) }))
              }
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {action.icon}
                <span className="text-sm font-medium">{action.label}</span>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">
                  {action.count.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
            </div>
          </label>
        ))}
      </div>
      <Button
        onClick={() => onExecute(selected)}
        disabled={!anySelected}
        variant="destructive"
        className="w-full mt-2"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete {totalSelected > 0 ? `${totalSelected.toLocaleString()} emails` : 'selected'}
      </Button>
    </div>
  );
}

// ---- Execute step ----

function ExecuteStep({
  accountId,
  actions,
  onComplete,
}: {
  accountId: string;
  actions: SelectedActions;
  onComplete: (cleaned: number) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const run = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // Animate progress while request is in flight
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 4, 85));
    }, 150);

    try {
      const res = await fetch('/api/upinbox/deep-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, selectedActions: actions }),
      });
      clearInterval(interval);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setProgress(100);
      const data: { cleaned: number } = await res.json();
      setTimeout(() => onComplete(data.cleaned), 400);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [accountId, actions, onComplete, started]);

  // Kick off on mount
  useState(() => {
    run();
  });

  // useEffect-equivalent via ref trick — trigger once
  if (!started) {
    run();
  }

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center">
        {error ? (
          <X className="w-7 h-7 text-red-500" />
        ) : progress < 100 ? (
          <Loader2 className="w-7 h-7 text-red-500 animate-spin" />
        ) : (
          <CheckCircle2 className="w-7 h-7 text-green-500" />
        )}
      </div>
      <div className="w-full">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{error ? 'Error' : progress < 100 ? 'Cleaning…' : 'Complete'}</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
      {error && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded px-3 py-2 w-full text-center">
          {error}
        </p>
      )}
    </div>
  );
}

// ---- Done step ----

function DoneStep({ cleaned, onClose }: { cleaned: number; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-950 flex items-center justify-center">
        <CheckCircle2 className="w-9 h-9 text-green-500" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">
          {cleaned.toLocaleString()} email{cleaned !== 1 ? 's' : ''} cleaned
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Deleted items have been moved to your undo vault and can be restored within 30 days.
        </p>
      </div>
      <Button onClick={onClose} className="w-full max-w-xs">
        Done
      </Button>
    </div>
  );
}

// ---- Main wizard ----

export function DeepCleanWizard({ accountId, onClose }: Props) {
  const [step, setStep] = useState<Step>('SCAN');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedActions, setSelectedActions] = useState<SelectedActions | null>(null);
  const [cleanedCount, setCleanedCount] = useState(0);

  const handleScanComplete = useCallback((result: ScanResult) => {
    setScanResult(result);
    setStep('REVIEW');
  }, []);

  const handleExecute = useCallback((actions: SelectedActions) => {
    setSelectedActions(actions);
    setStep('EXECUTE');
  }, []);

  const handleExecuteComplete = useCallback((cleaned: number) => {
    setCleanedCount(cleaned);
    setStep('DONE');
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-background rounded-xl shadow-2xl border p-6">
        {/* Close button — not shown during EXECUTE */}
        {step !== 'EXECUTE' && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <h2 className="text-lg font-bold mb-1">Deep Clean</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Permanently remove clutter from your mailbox.
        </p>

        <StepIndicator current={step} />

        {step === 'SCAN' && (
          <ScanStep accountId={accountId} onComplete={handleScanComplete} />
        )}
        {step === 'REVIEW' && scanResult && (
          <ReviewStep scanResult={scanResult} onExecute={handleExecute} />
        )}
        {step === 'EXECUTE' && selectedActions && (
          <ExecuteStep
            accountId={accountId}
            actions={selectedActions}
            onComplete={handleExecuteComplete}
          />
        )}
        {step === 'DONE' && (
          <DoneStep cleaned={cleanedCount} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
