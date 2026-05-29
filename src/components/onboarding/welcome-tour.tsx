'use client';

import { useState } from 'react';

interface WelcomeTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TOUR_STORAGE_KEY = 'upinbox:tour-completed';
const TOTAL_STEPS = 4;

export function WelcomeTour({ onComplete, onSkip }: WelcomeTourProps) {
  const [step, setStep] = useState(0);

  const persistAndComplete = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      }
    } catch {
      // localStorage may be unavailable (private mode, SSR, etc.) — fail silently
    }
    onComplete();
  };

  const persistAndSkip = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      }
    } catch {
      // ignore
    }
    onSkip();
  };

  const next = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      persistAndComplete();
    }
  };

  const goToSettingsAI = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/settings/ai';
    }
    persistAndComplete();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl flex flex-col">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6 pb-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              aria-label={`Step ${i + 1} of ${TOTAL_STEPS}`}
              className={`h-2 rounded-full transition-all ${
                i === step
                  ? 'w-8 bg-blue-600'
                  : i < step
                  ? 'w-2 bg-blue-400'
                  : 'w-2 bg-zinc-300 dark:bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-8 py-6 min-h-[280px] flex flex-col">
          {step === 0 && (
            <div className="flex-1 flex flex-col items-center text-center">
              <h2
                id="welcome-tour-title"
                className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3"
              >
                Welcome to UpInbox 📬
              </h2>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Privacy-first email with BYOK AI and MCP. Let&apos;s get you set up.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="flex-1 flex flex-col">
              <h2
                id="welcome-tour-title"
                className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3"
              >
                Meet the Smart Screener
              </h2>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-5">
                Incoming email is auto-routed by AI confidence — Action Needed at the top,
                newsletters tucked away. Tap the badge to correct any routing — it learns from you.
              </p>
              {/* Example feed tabs visual */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3">
                <div className="flex gap-2 text-xs font-medium">
                  <span className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    Action Needed · 3
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    FYI · 12
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                    Newsletters · 48
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex-1 flex flex-col items-center text-center">
              <h2
                id="welcome-tour-title"
                className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3"
              >
                Bring Your Own AI Keys
              </h2>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                AI features use YOUR API key — we never see it, never bill you for inference.
                Set up your key in Settings → AI &amp; Draft.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="flex-1 flex flex-col items-center text-center">
              <h2
                id="welcome-tour-title"
                className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3"
              >
                Use UpInbox from Claude
              </h2>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Generate an MCP token in Settings → MCP Tokens to use your inbox directly from
                Claude Desktop or claude.ai.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="px-8 pb-6 pt-2 flex items-center justify-between gap-3">
          {step === 0 && (
            <>
              <button
                type="button"
                onClick={persistAndSkip}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Skip tour
              </button>
              <button
                type="button"
                onClick={next}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Continue
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <span />
              <button
                type="button"
                onClick={next}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Continue
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={next}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
              >
                Later
              </button>
              <button
                type="button"
                onClick={goToSettingsAI}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Set up AI now
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <span />
              <button
                type="button"
                onClick={next}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Got it!
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default WelcomeTour;
