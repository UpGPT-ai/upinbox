/**
 * UpInbox Extension — Gmail Content Script
 *
 * Injects classification badges into Gmail's thread list.
 * Uses a MutationObserver to detect new email rows as Gmail renders them.
 *
 * Architecture:
 * - Content script extracts minimal metadata from the DOM (subject, sender snippet)
 * - Sends to background service worker for classification
 * - Background applies the 4-path router and returns a ClassificationResult
 * - Content script renders a badge pill next to the subject line
 */

import type { ClassificationResult, ExtensionMessage } from './types';

// ─── Category display config ──────────────────────────────────────────────────

const CATEGORY_DISPLAY: Record<string, { label: string; color: string }> = {
  ACTION_REQUIRED: { label: '⚡ Action', color: '#dc2626' },
  FYI:             { label: 'ℹ️ FYI',    color: '#2563eb' },
  NEWSLETTER:      { label: '📰 News',   color: '#7c3aed' },
  PROMOTIONAL:     { label: '🏷️ Promo',  color: '#d97706' },
  RECEIPT:         { label: '🧾 Receipt', color: '#059669' },
  SOCIAL:          { label: '👥 Social', color: '#0891b2' },
  SPAM:            { label: '🚫 Spam',   color: '#9ca3af' },
};

// ─── DOM helpers ──────────────────────────────────────────────────────────────

const CLASSIFIED_ATTR = 'data-upinbox-classified';

function extractEmailMetadata(row: Element): {
  subject?: string;
  fromName?: string;
  snippet?: string;
} | null {
  // Gmail uses various selectors across versions — try multiple
  const subjectEl =
    row.querySelector('[data-legacy-thread-id] span.bog') ??
    row.querySelector('span.bog') ??
    row.querySelector('[data-thread-id] .y6 span') ??
    row.querySelector('.y6 span');

  const senderEl =
    row.querySelector('.yW span[email]') ??
    row.querySelector('span[email]') ??
    row.querySelector('.bA4 span');

  const snippetEl =
    row.querySelector('.y2') ??
    row.querySelector('.Zt');

  if (!subjectEl && !senderEl) return null;

  return {
    subject: subjectEl?.textContent?.trim(),
    fromName: senderEl?.textContent?.trim(),
    snippet: snippetEl?.textContent?.trim(),
  };
}

function injectBadge(row: Element, result: ClassificationResult): void {
  // Remove existing badge if re-classifying
  row.querySelector('.upinbox-badge')?.remove();

  const display = CATEGORY_DISPLAY[result.category];
  if (!display) return;

  const badge = document.createElement('span');
  badge.className = 'upinbox-badge';
  badge.setAttribute('title', `${result.category} — ${Math.round(result.confidence * 100)}% confidence (${result.path})`);
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    color: white;
    background: ${display.color};
    margin-left: 6px;
    vertical-align: middle;
    opacity: 0.9;
    cursor: default;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    letter-spacing: 0.01em;
    line-height: 1.4;
  `;
  badge.textContent = display.label;

  // Insert after subject element
  const subjectEl = row.querySelector('span.bog') ?? row.querySelector('.y6 span');
  if (subjectEl?.parentElement) {
    subjectEl.parentElement.insertBefore(badge, subjectEl.nextSibling);
  }
}

// ─── Classification queue ─────────────────────────────────────────────────────

// Throttle: max 3 concurrent requests to avoid overwhelming the classifier
const classificationQueue: Set<Element> = new Set();
let activeRequests = 0;
const MAX_CONCURRENT = 3;

async function processQueue(): Promise<void> {
  if (activeRequests >= MAX_CONCURRENT || classificationQueue.size === 0) return;

  const row = classificationQueue.values().next().value;
  if (!row) return;
  classificationQueue.delete(row);

  const meta = extractEmailMetadata(row);
  if (!meta) return;

  activeRequests++;
  try {
    const message: ExtensionMessage = {
      type: 'CLASSIFY_EMAIL',
      payload: {
        subject: meta.subject,
        fromName: meta.fromName,
        snippet: meta.snippet,
      },
    };
    const result = await chrome.runtime.sendMessage<ExtensionMessage, ClassificationResult>(message);
    if (result?.category) {
      injectBadge(row, result);
    }
  } catch (err) {
    // Silent fail — don't disrupt Gmail UX
    console.debug('[UpInbox] classification error:', err);
  } finally {
    activeRequests--;
    processQueue(); // pick up next item
  }
}

function scheduleClassification(row: Element): void {
  if (row.hasAttribute(CLASSIFIED_ATTR)) return;
  row.setAttribute(CLASSIFIED_ATTR, '1');
  classificationQueue.add(row);
  processQueue();
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

// Gmail email rows match these selectors (multiple Gmail UI variants)
const ROW_SELECTORS = [
  'tr.zA',          // Thread list rows
  'tr[jscontroller]', // Newer Gmail
];

function isEmailRow(node: Node): node is Element {
  if (!(node instanceof Element)) return false;
  return ROW_SELECTORS.some((sel) => node.matches(sel));
}

function observeGmailThreadList(): void {
  // Process initially visible rows
  ROW_SELECTORS.forEach((sel) => {
    document.querySelectorAll(sel).forEach(scheduleClassification);
  });

  // Observe for newly rendered rows
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (isEmailRow(node)) {
          scheduleClassification(node);
        } else if (node instanceof Element) {
          // Check children too (Gmail sometimes nests rows)
          ROW_SELECTORS.forEach((sel) => {
            node.querySelectorAll(sel).forEach(scheduleClassification);
          });
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Check settings before injecting anything
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
  if (chrome.runtime.lastError) return;
  if (!settings?.autoClassify) return;
  observeGmailThreadList();
});

// Listen for settings changes to enable/disable live
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'UPDATE_SETTINGS') {
    const patch = message.payload;
    if ('autoClassify' in patch && !patch.autoClassify) {
      // Remove all badges
      document.querySelectorAll('.upinbox-badge').forEach((el) => el.remove());
    }
  }
});
