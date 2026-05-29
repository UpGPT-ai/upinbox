'use client';

/**
 * DraftProfilePanel — AI draft personalization settings.
 *
 * Saves a user profile (name, title, company, tone, extra context) to
 * /api/upinbox/draft-profile so the AI draft engine can produce replies
 * that sound like the user.
 *
 * Data is stored server-side (per account) and injected into the system
 * prompt at draft time. This is NOT PII-sensitive beyond what the user
 * deliberately provides — it's their professional bio for AI context.
 */

import { useState, useEffect, useCallback } from 'react';

type WritingTone = 'professional' | 'friendly' | 'concise' | 'direct';

interface DraftProfile {
  fullName: string;
  jobTitle: string;
  company: string;
  writingTone: WritingTone;
  extraContext: string;
}

const TONE_OPTIONS: { value: WritingTone; label: string; description: string }[] = [
  {
    value: 'professional',
    label: 'Professional',
    description: 'Formal and polished — suitable for clients and executives',
  },
  {
    value: 'friendly',
    label: 'Friendly',
    description: 'Warm and approachable — great for teammates and regular contacts',
  },
  {
    value: 'concise',
    label: 'Concise',
    description: 'Short and direct — ideal for busy people who value brevity',
  },
  {
    value: 'direct',
    label: 'Direct',
    description: 'Clear and assertive — no fluff, no hedging',
  },
];

const DEFAULT_PROFILE: DraftProfile = {
  fullName: '',
  jobTitle: '',
  company: '',
  writingTone: 'professional',
  extraContext: '',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function DraftProfilePanel() {
  const [profile, setProfile] = useState<DraftProfile>(DEFAULT_PROFILE);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Load existing profile on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/upinbox/draft-profile');
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            setProfile({ ...DEFAULT_PROFILE, ...data.profile });
          }
        }
      } catch {
        // Non-fatal — just start with empty profile
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = useCallback(
    <K extends keyof DraftProfile>(field: K, value: DraftProfile[K]) => {
      setProfile((prev) => ({ ...prev, [field]: value }));
      // Reset save feedback when user edits
      if (saveState === 'saved' || saveState === 'error') {
        setSaveState('idle');
      }
    },
    [saveState],
  );

  const handleSave = async () => {
    setSaveState('saving');
    setErrorMessage('');

    try {
      const res = await fetch('/api/upinbox/draft-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      setSaveState('saved');

      // Auto-reset success badge after 3 seconds
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="h-10 w-full bg-muted rounded" />
        <div className="h-10 w-full bg-muted rounded" />
        <div className="h-10 w-full bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Draft Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell the AI a bit about you. This context is injected into every draft so replies
          sound like <em>you</em> — not a generic assistant.
        </p>
      </div>

      {/* Context callout */}
      <div className="flex gap-3 bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="shrink-0 mt-0.5 text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-sm text-primary/90">
          The more context you add, the better the AI can match your voice, sign-offs, and
          level of formality. Your data is used only to generate drafts — never shared.
        </p>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        {/* Full name */}
        <div>
          <label htmlFor="draft-fullName" className="block text-sm font-medium mb-1.5">
            Full Name
          </label>
          <input
            id="draft-fullName"
            type="text"
            value={profile.fullName}
            onChange={(e) => handleChange('fullName', e.target.value)}
            placeholder="Jane Smith"
            maxLength={120}
            className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Used in sign-offs and greeting lines.
          </p>
        </div>

        {/* Job title */}
        <div>
          <label htmlFor="draft-jobTitle" className="block text-sm font-medium mb-1.5">
            Job Title
          </label>
          <input
            id="draft-jobTitle"
            type="text"
            value={profile.jobTitle}
            onChange={(e) => handleChange('jobTitle', e.target.value)}
            placeholder="Head of Product"
            maxLength={120}
            className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>

        {/* Company */}
        <div>
          <label htmlFor="draft-company" className="block text-sm font-medium mb-1.5">
            Company
          </label>
          <input
            id="draft-company"
            type="text"
            value={profile.company}
            onChange={(e) => handleChange('company', e.target.value)}
            placeholder="Acme Corp"
            maxLength={120}
            className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>

        {/* Writing tone */}
        <div>
          <label className="block text-sm font-medium mb-2">Writing Tone</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TONE_OPTIONS.map((tone) => (
              <button
                key={tone.value}
                type="button"
                onClick={() => handleChange('writingTone', tone.value)}
                title={tone.description}
                className={`
                  px-3 py-2.5 border rounded-md text-sm text-left transition-colors
                  ${
                    profile.writingTone === tone.value
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <span className="block font-medium leading-none mb-1">{tone.label}</span>
                <span className="block text-xs leading-snug opacity-75">{tone.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Extra context */}
        <div>
          <label htmlFor="draft-extraContext" className="block text-sm font-medium mb-1.5">
            Extra Context
            <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="draft-extraContext"
            value={profile.extraContext}
            onChange={(e) => handleChange('extraContext', e.target.value)}
            placeholder={
              'Anything the AI should know about you or your communication style.\n\nExamples:\n- I work in healthcare — always HIPAA-safe language\n- Never use bullet points in my replies\n- I prefer to offer two options when scheduling\n- My clients are non-technical — avoid jargon'
            }
            rows={6}
            maxLength={2000}
            className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground resize-y font-sans"
          />
          <div className="flex justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              Industry, communication quirks, things to always or never do.
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {profile.extraContext.length}/2000
            </p>
          </div>
        </div>
      </div>

      {/* Save row */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="text-sm">
          {saveState === 'saved' && (
            <span className="text-green-600 font-medium flex items-center gap-1.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
              Profile saved
            </span>
          )}
          {saveState === 'error' && (
            <span className="text-destructive text-xs">{errorMessage}</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className={`
            px-4 py-2 rounded-md text-sm font-medium transition-colors
            ${
              saveState === 'saving'
                ? 'bg-primary/60 text-primary-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80'
            }
          `}
        >
          {saveState === 'saving' ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
