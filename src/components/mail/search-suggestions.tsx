'use client';

/**
 * SearchSuggestions
 *
 * Inline operator-aware autocomplete dropdown shown below the search input
 * as the user types. Suggestions are contextual:
 *
 *   - "from:"         → recent senders (from the `recentSenders` prop)
 *   - "to:"           → recent recipients (from the `recentRecipients` prop)
 *   - "label:"        → available labels (from the `labels` prop)
 *   - "subject:"      → hint row (freetext)
 *   - All other states → operator keyword suggestions filtered by the token
 *     the user is currently typing (e.g. typing "is" shows "is:unread",
 *     "is:flagged", "is:starred")
 *
 * Usage:
 *   <div className="relative">
 *     <input value={query} onChange={...} />
 *     <SearchSuggestions
 *       query={query}
 *       recentSenders={senders}
 *       labels={labels}
 *       onSelect={(completed) => setQuery(completed)}
 *     />
 *   </div>
 */

import { useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchSuggestionsProps {
  /** Current value of the search input. */
  query: string;
  /** Addresses shown when the user types "from:". */
  recentSenders?: string[];
  /** Addresses shown when the user types "to:". */
  recentRecipients?: string[];
  /** Label names shown when the user types "label:". */
  labels?: string[];
  /**
   * Called with the full replacement string when the user clicks a suggestion.
   * The parent should set the search input to this value.
   */
  onSelect: (replacement: string) => void;
}

interface Suggestion {
  /** Visible label in the dropdown. */
  display: string;
  /** The full query string that should replace the current one on selection. */
  replacement: string;
  /** Optional secondary hint shown right-aligned. */
  hint?: string;
}

// ─── Static operator keyword catalogue ───────────────────────────────────────

const OPERATOR_SUGGESTIONS: Array<{ label: string; hint: string }> = [
  { label: 'from:',        hint: 'Filter by sender'         },
  { label: 'to:',          hint: 'Filter by recipient'      },
  { label: 'subject:',     hint: 'Search subject line'      },
  { label: 'label:',       hint: 'Filter by label/folder'   },
  { label: 'has:attachment', hint: 'Has attachment'         },
  { label: 'has:link',     hint: 'Contains a link'          },
  { label: 'is:unread',    hint: 'Unread messages'          },
  { label: 'is:flagged',   hint: 'Flagged messages'         },
  { label: 'is:starred',   hint: 'Starred messages'         },
  { label: 'larger:',      hint: 'e.g. larger:5mb'          },
  { label: 'older_than:',  hint: 'e.g. older_than:30d'      },
  { label: 'newer_than:',  hint: 'e.g. newer_than:7d'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the last "active token" the user is editing — the rightmost
 * whitespace-separated token. If the query ends with whitespace the user
 * has finished that token and we return an empty string (no suggestion).
 */
function getActiveToken(query: string): string {
  if (!query || query.endsWith(' ')) return '';
  const tokens = query.split(/\s+/);
  return tokens[tokens.length - 1] ?? '';
}

/**
 * Replaces the active (last) token in `query` with `replacement`.
 * A trailing space is appended so the user can continue typing.
 */
function replaceActiveToken(query: string, replacement: string): string {
  if (!query || query.endsWith(' ')) {
    return query + replacement;
  }
  const tokens = query.split(/\s+/);
  tokens[tokens.length - 1] = replacement;
  return tokens.join(' ') + ' ';
}

// ─── Suggestion builder ───────────────────────────────────────────────────────

function buildSuggestions(
  query: string,
  recentSenders: string[],
  recentRecipients: string[],
  labels: string[],
): Suggestion[] {
  const token = getActiveToken(query);
  if (!token) return [];

  const lower = token.toLowerCase();

  // ── from: value completion ────────────────────────────────────────────────
  if (lower.startsWith('from:')) {
    const fragment = token.slice(5).toLowerCase();
    const matches = recentSenders
      .filter((s) => !fragment || s.toLowerCase().includes(fragment))
      .slice(0, 6);
    return matches.map((addr) => ({
      display: addr,
      replacement: replaceActiveToken(query, `from:${addr}`).trimEnd(),
      hint: 'sender',
    }));
  }

  // ── to: value completion ──────────────────────────────────────────────────
  if (lower.startsWith('to:')) {
    const fragment = token.slice(3).toLowerCase();
    const pool = recentRecipients.length ? recentRecipients : recentSenders;
    const matches = pool
      .filter((s) => !fragment || s.toLowerCase().includes(fragment))
      .slice(0, 6);
    return matches.map((addr) => ({
      display: addr,
      replacement: replaceActiveToken(query, `to:${addr}`).trimEnd(),
      hint: 'recipient',
    }));
  }

  // ── label: value completion ───────────────────────────────────────────────
  if (lower.startsWith('label:')) {
    const fragment = token.slice(6).toLowerCase();
    const matches = labels
      .filter((l) => !fragment || l.toLowerCase().includes(fragment))
      .slice(0, 8);
    return matches.map((label) => ({
      display: label,
      replacement: replaceActiveToken(query, `label:${label}`).trimEnd(),
      hint: 'label',
    }));
  }

  // ── subject: hint ─────────────────────────────────────────────────────────
  if (lower === 'subject:') {
    return [{
      display: 'subject:"..."',
      replacement: replaceActiveToken(query, 'subject:"').trimEnd(),
      hint: 'type to search subjects',
    }];
  }

  // ── Operator keyword completion (e.g. user typed "is", "has", "from") ─────
  const matchingOps = OPERATOR_SUGGESTIONS.filter(
    (op) => op.label.startsWith(lower) && op.label !== lower,
  ).slice(0, 6);

  return matchingOps.map(({ label, hint }) => ({
    display: label,
    replacement: replaceActiveToken(query, label).trimEnd(),
    hint,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchSuggestions({
  query,
  recentSenders = [],
  recentRecipients = [],
  labels = [],
  onSelect,
}: SearchSuggestionsProps) {
  const suggestions = useMemo(
    () => buildSuggestions(query, recentSenders, recentRecipients, labels),
    [query, recentSenders, recentRecipients, labels],
  );

  if (suggestions.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Search suggestions"
      className={[
        'absolute left-0 right-0 top-full z-50 mt-1',
        'bg-popover border border-border rounded-xl shadow-xl overflow-hidden',
        'max-h-64 overflow-y-auto',
      ].join(' ')}
    >
      {suggestions.map((s, i) => (
        <button
          key={i}
          role="option"
          aria-selected={false}
          type="button"
          onMouseDown={(e) => {
            // Use mousedown so the input doesn't lose focus before we capture it
            e.preventDefault();
            onSelect(s.replacement);
          }}
          className={[
            'w-full flex items-center gap-2 px-3 py-2 text-sm',
            'hover:bg-accent focus:bg-accent transition-colors text-left',
            'outline-none',
          ].join(' ')}
        >
          <span className="flex-1 font-mono text-foreground truncate">
            {s.display}
          </span>
          {s.hint && (
            <span className="flex-shrink-0 text-xs text-muted-foreground">
              {s.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Re-export parser helpers for convenience ─────────────────────────────────
export { parseSearchQuery, buildApiParams } from '@/lib/mail/search-operators';
export type { ParsedQuery } from '@/lib/mail/search-operators';
