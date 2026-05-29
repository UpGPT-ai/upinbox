'use client';

import React, { useState } from 'react';
import { useAtomValue } from 'jotai';
import { byokApiKeyAtom, byokProviderAtom, byokModelAtom } from '@/atoms/mail';
import { Loader2, AlertTriangle, RefreshCw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tone = 'Formal' | 'Friendly' | 'Brief' | 'Apologetic';

const TONES: Tone[] = ['Formal', 'Friendly', 'Brief', 'Apologetic'];

export interface DraftGeneratorPanelProps {
  threadSubject?: string;
  latestFrom?: string;
  latestBody?: string;
  /** Optional: passed by compose-window but not used internally */
  accountId?: string;
  /** Optional: passed by compose-window but not used internally */
  draft?: unknown;
  onAccept: (body: string, bodyHtml?: string) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DraftGeneratorPanel({
  threadSubject,
  latestFrom,
  latestBody,
  onAccept,
  onClose,
}: DraftGeneratorPanelProps) {
  const apiKey = useAtomValue(byokApiKeyAtom);
  const provider = useAtomValue(byokProviderAtom);
  const model = useAtomValue(byokModelAtom);

  const [selectedTone, setSelectedTone] = useState<Tone>('Friendly');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const hasKey = apiKey && apiKey.length > 0;

  const generate = async () => {
    if (!hasKey) return;
    setLoading(true);
    setError(null);
    setDraft('');

    try {
      const res = await fetch('/api/upinbox/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadSubject,
          latestFrom,
          latestBody,
          tone: selectedTone,
          apiKey,
          provider,
          model,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      setDraft(data.body ?? '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleUse = () => {
    if (!draft) return;
    // Build a simple HTML version: preserve line breaks
    const bodyHtml = draft
      .split('\n')
      .map((line) => `<p>${line || '&nbsp;'}</p>`)
      .join('');
    onAccept(draft, bodyHtml);
    onClose();
  };

  return (
    <div className="absolute bottom-full mb-2 left-0 right-0 bg-background border shadow-xl rounded-2xl p-4 z-10 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">AI Draft</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close AI draft panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* No-key warning */}
      {!hasKey && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            No BYOK API key configured. Add your key in{' '}
            <strong>Settings &rsaquo; AI</strong> to generate drafts.
          </span>
        </div>
      )}

      {/* Tone chips */}
      <div className="flex flex-wrap gap-1.5">
        {TONES.map((tone) => (
          <button
            key={tone}
            onClick={() => setSelectedTone(tone)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              selectedTone === tone
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            )}
          >
            {tone}
          </button>
        ))}
      </div>

      {/* Generate button */}
      <Button
        size="sm"
        onClick={generate}
        disabled={!hasKey || loading}
        className="self-start"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Generating…
          </>
        ) : (
          'Generate Draft'
        )}
      </Button>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Draft preview */}
      {draft && (
        <>
          <Textarea
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
            className="min-h-[120px] text-sm resize-none"
            placeholder="Generated draft will appear here…"
          />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleUse} className="gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Use
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={generate}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
