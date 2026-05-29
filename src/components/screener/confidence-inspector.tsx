'use client';

import { useState } from 'react';

const CATEGORIES = [
  'Action Needed',
  'Focus',
  'Newsletter',
  'Notification',
  'Promotional',
  'Social',
  'Update',
  'Other',
];

const RULE_EXPLANATIONS: Record<string, string> = {
  sender: 'This sender was matched against a known heuristic override or learned pattern.',
  subject_keyword: 'A keyword in the subject line matched a category rule.',
  header: 'Email headers (e.g. List-Unsubscribe, X-Mailer) indicated the category.',
  domain: 'The sender domain is associated with this category.',
  default: 'The screener applied a default classification based on combined signals.',
};

interface Props {
  emailId: string;
  accountId: string;
  currentCategory: string;
  confidence: number;
  trigger?: string;
  senderEmail?: string;
}

export function ConfidenceInspector({
  emailId,
  accountId,
  currentCategory,
  confidence,
  trigger,
  senderEmail = '',
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState(currentCategory);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [showWhy, setShowWhy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const confidencePct = Math.round(confidence * 100);
  const triggerKey = trigger ?? 'default';
  const explanation = RULE_EXPLANATIONS[triggerKey] ?? RULE_EXPLANATIONS.default;

  async function handleCorrect() {
    if (selectedCategory === currentCategory) {
      setDismissed(true);
      return;
    }

    setStatus('loading');

    try {
      const res = await fetch('/api/upinbox/screener/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          messageId: emailId,
          correctCategory: selectedCategory,
          originalCategory: currentCategory,
          senderEmail,
        }),
      });

      if (!res.ok) throw new Error('Request failed');
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  if (dismissed) return null;

  if (status === 'done') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        Got it! I'll route{senderEmail ? ` ${senderEmail}` : ' this sender'} to{' '}
        <strong>{selectedCategory}</strong> from now on.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-900">
          Routed to <span className="text-indigo-600">{currentCategory}</span> with{' '}
          <span className="text-indigo-600">{confidencePct}%</span> confidence
        </p>
        {trigger && (
          <p className="mt-1 text-xs text-gray-500">
            Trigger: <span className="font-mono">{trigger}</span>
          </p>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <label
            htmlFor={`category-select-${emailId}`}
            className="block text-xs font-medium text-gray-700 mb-1"
          >
            Actually this is:
          </label>
          <select
            id={`category-select-${emailId}`}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCorrect}
            disabled={status === 'loading'}
            className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? 'Saving...' : 'Correct'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            This is correct
          </button>
        </div>

        {status === 'error' && (
          <p className="text-xs text-red-600">Something went wrong. Please try again.</p>
        )}

        <button
          onClick={() => setShowWhy((v) => !v)}
          className="text-xs text-indigo-600 hover:underline focus:outline-none"
        >
          {showWhy ? 'Hide explanation' : 'Why was this categorized here?'}
        </button>

        {showWhy && (
          <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700 leading-relaxed">
            <p className="font-medium mb-1">Rule logic</p>
            <p>{explanation}</p>
            {trigger && trigger !== 'default' && (
              <p className="mt-1">
                Matched rule type: <span className="font-mono">{trigger}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
