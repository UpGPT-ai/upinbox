'use client';

import { useState } from 'react';

export interface UpgradePromptProps {
  /** The capability key that is missing (e.g. "gmail.send", "ai.byok"). */
  capability: string;
  /** Human-readable feature name (e.g. "Gmail Sending"). */
  feature: string;
  /** Optional longer description for full mode. */
  description?: string;
  /** Compact inline button vs full card. */
  compact?: boolean;
}

const SUBSCRIBE_URL = 'https://upgpt.ai/pricing';

function buildSubscribeUrl(capability: string, feature: string): string {
  const params = new URLSearchParams({
    source: 'upinbox',
    capability,
    feature,
  });
  return `${SUBSCRIBE_URL}?${params.toString()}`;
}

/**
 * UpgradePrompt — reusable upgrade CTA shown wherever a capability is missing.
 *
 * Used by the connect wizard, MCP page, billing panel, and any surface that
 * needs to ask the user to subscribe at UpGPT.ai. Keep all upgrade copy and
 * styling in this one component so every touchpoint stays consistent.
 */
export function UpgradePrompt({
  capability,
  feature,
  description,
  compact = false,
}: UpgradePromptProps) {
  const [hover, setHover] = useState(false);
  const href = buildSubscribeUrl(capability, feature);

  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-capability={capability}
        data-upgrade-prompt="compact"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={[
          'inline-flex items-center gap-2 rounded-md px-3 py-1.5',
          'text-sm font-medium text-white',
          'bg-gradient-to-r from-indigo-600 to-violet-600',
          'shadow-sm transition',
          hover ? 'opacity-95 shadow' : 'opacity-100',
          'hover:from-indigo-500 hover:to-violet-500',
          'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1',
        ].join(' ')}
      >
        <LockIcon />
        <span>
          Unlock {feature} — Subscribe at UpGPT.ai
        </span>
      </a>
    );
  }

  return (
    <div
      data-capability={capability}
      data-upgrade-prompt="full"
      className={[
        'w-full rounded-xl border border-zinc-200 bg-white p-5',
        'dark:border-zinc-800 dark:bg-zinc-900',
        'shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          <LockIcon />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {feature} is locked
          </h3>
          {description ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Subscribe at UpGPT.ai to enable {feature.toLowerCase()} and unlock the
              rest of the capabilities included in your plan.
            </p>
          )}

          <ul className="mt-3 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <BenefitRow text="One subscription unlocks every UpGPT product" />
            <BenefitRow text="Bring your own AI keys — no inference markup" />
            <BenefitRow text="Cancel anytime, keep your data" />
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={[
                'inline-flex items-center gap-2 rounded-md px-4 py-2',
                'text-sm font-semibold text-white',
                'bg-gradient-to-r from-indigo-600 to-violet-600',
                'shadow-sm transition',
                'hover:from-indigo-500 hover:to-violet-500',
                'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1',
              ].join(' ')}
            >
              Subscribe at UpGPT.ai
              <ArrowIcon />
            </a>
            <a
              href="https://upgpt.ai/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              See plans
            </a>
          </div>

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            Missing capability:{' '}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {capability}
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default UpgradePrompt;

/* ---------- internal bits ---------- */

function BenefitRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <CheckIcon />
      <span>{text}</span>
    </li>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 7V5a2 2 0 10-4 0v3h4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path
        fillRule="evenodd"
        d="M3 10a1 1 0 011-1h9.586L10.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}
