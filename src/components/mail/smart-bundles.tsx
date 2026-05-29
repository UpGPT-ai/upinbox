'use client';

/**
 * SmartBundles — auto-groups same-sender newsletters into a single expandable row.
 *
 * Threshold: 3+ emails from the same sender address → bundled.
 * Senders below the threshold render as normal individual rows.
 *
 * Also exports BundleToggle — a small pill button for the list header.
 */

import { useState, useMemo } from 'react';
import type { JmapEmail } from '@/lib/mail/types';

// ─── Helpers (mirrors email-list.tsx conventions) ─────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isThisYear) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}

function getSenderEmail(email: JmapEmail): string {
  return email.from?.[0]?.email ?? '';
}

function getSenderLabel(email: JmapEmail): string {
  const from = email.from?.[0];
  if (!from) return 'Unknown';
  return from.name || from.email;
}

function getInitials(nameOrEmail: string): string {
  const name = nameOrEmail.trim();
  if (!name) return '?';
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function avatarHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) % 360;
}

// ─── Bundle threshold ─────────────────────────────────────────────────────────

const BUNDLE_MIN = 3;

// ─── Internal types ───────────────────────────────────────────────────────────

interface Bundle {
  senderEmail: string;
  senderLabel: string;
  emails: JmapEmail[];
  latestDate: string;
}

type ListItem =
  | { kind: 'bundle'; bundle: Bundle }
  | { kind: 'email'; email: JmapEmail };

// ─── Individual email row (lightweight, no mutations — caller owns actions) ───

interface PlainEmailRowProps {
  email: JmapEmail;
  isOpen: boolean;
  indented?: boolean;
  onEmailClick: (id: string) => void;
}

function PlainEmailRow({ email, isOpen, indented = false, onEmailClick }: PlainEmailRowProps) {
  const isRead = email.keywords?.['$seen'] ?? false;
  const senderLabel = getSenderLabel(email);

  return (
    <div
      onClick={() => onEmailClick(email.id)}
      className={`
        flex items-start gap-3 py-2.5 cursor-pointer border-b transition-colors select-none
        ${indented ? 'pl-10 pr-4' : 'px-4'}
        ${isOpen ? 'bg-accent' : 'hover:bg-muted/50'}
        ${!isRead ? 'font-medium' : ''}
      `}
    >
      {/* Unread dot */}
      <div className="mt-1.5 flex-shrink-0">
        <div className={`w-1.5 h-1.5 rounded-full ${!isRead ? 'bg-primary' : 'bg-transparent'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-xs truncate ${!isRead ? 'font-semibold' : 'text-muted-foreground'}`}>
            {senderLabel}
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">
            {formatDate(email.receivedAt ?? '')}
          </span>
        </div>
        <div className="text-sm truncate mt-0.5">{email.subject || '(no subject)'}</div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{email.preview ?? ''}</div>
      </div>
    </div>
  );
}

// ─── Bundle row ───────────────────────────────────────────────────────────────

interface BundleRowProps {
  bundle: Bundle;
  isExpanded: boolean;
  openEmailId: string | null;
  onToggle: () => void;
  onEmailClick: (id: string) => void;
}

function BundleRow({ bundle, isExpanded, openEmailId, onToggle, onEmailClick }: BundleRowProps) {
  const hue = avatarHue(bundle.senderEmail);
  const anyOpen = bundle.emails.some((e) => e.id === openEmailId);
  const hasUnread = bundle.emails.some((e) => !(e.keywords?.['$seen'] ?? false));

  return (
    <>
      {/* Bundle header */}
      <div
        onClick={onToggle}
        className={`
          flex items-center gap-3 px-4 py-3 cursor-pointer border-b transition-colors select-none
          ${anyOpen ? 'bg-accent' : 'hover:bg-muted/50'}
          ${hasUnread ? 'font-medium' : ''}
        `}
      >
        {/* Sender avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ring-2 ring-background"
          style={{
            backgroundColor: `hsl(${hue}, 55%, 65%)`,
            color: `hsl(${hue}, 55%, 20%)`,
          }}
        >
          {getInitials(bundle.senderLabel)}
        </div>

        {/* Bundle info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-sm truncate ${hasUnread ? 'font-semibold' : 'font-medium'}`}>
              {bundle.senderLabel}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Count badge */}
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold tabular-nums">
                {bundle.emails.length}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(bundle.latestDate)}
              </span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {bundle.emails.length} email{bundle.emails.length === 1 ? '' : 's'} from {bundle.senderLabel}
          </div>
        </div>

        {/* Expand toggle */}
        <span className="text-xs text-muted-foreground flex-shrink-0 select-none">
          {isExpanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded individual emails */}
      {isExpanded && bundle.emails.map((email) => (
        <PlainEmailRow
          key={email.id}
          email={email}
          isOpen={openEmailId === email.id}
          indented
          onEmailClick={onEmailClick}
        />
      ))}
    </>
  );
}

// ─── SmartBundles ─────────────────────────────────────────────────────────────

export interface SmartBundlesProps {
  emails: JmapEmail[];
  onEmailClick: (id: string) => void;
  /** Currently open email id — used to highlight active row */
  openEmailId?: string | null;
}

export function SmartBundles({ emails, onEmailClick, openEmailId = null }: SmartBundlesProps) {
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());

  /**
   * Build the ordered list of items to render.
   *
   * Algorithm:
   * 1. Count how many emails each sender address appears in.
   * 2. Senders with >= BUNDLE_MIN emails → bundle; others → flat.
   * 3. Preserve original list order: when we first encounter a bundleable sender,
   *    emit a bundle placeholder at that position. Subsequent emails from the same
   *    sender are consumed into the bundle and do not emit a row of their own.
   * 4. Non-bundled emails emit a plain row at their natural position.
   */
  const items: ListItem[] = useMemo(() => {
    // Count occurrences per sender address
    const countBySender: Record<string, number> = {};
    for (const email of emails) {
      const addr = getSenderEmail(email);
      if (!addr) continue;
      countBySender[addr] = (countBySender[addr] ?? 0) + 1;
    }

    // Collect emails per bundle sender in order of first appearance
    const bundleMap: Record<string, JmapEmail[]> = {};
    const bundleOrder: string[] = []; // sender addresses in first-seen order

    for (const email of emails) {
      const addr = getSenderEmail(email);
      if (addr && (countBySender[addr] ?? 0) >= BUNDLE_MIN) {
        if (!bundleMap[addr]) {
          bundleMap[addr] = [];
          bundleOrder.push(addr);
        }
        bundleMap[addr].push(email);
      }
    }

    // Build the output list, preserving order
    const emitted = new Set<string>(); // bundle sender addresses already emitted
    const result: ListItem[] = [];

    for (const email of emails) {
      const addr = getSenderEmail(email);
      const isBundled = addr && (countBySender[addr] ?? 0) >= BUNDLE_MIN;

      if (isBundled) {
        if (!emitted.has(addr)) {
          // First time we encounter this bundled sender → emit the bundle
          emitted.add(addr);
          const bundleEmails = bundleMap[addr];
          // Sort bundle emails newest-first
          const sorted = [...bundleEmails].sort(
            (a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime()
          );
          result.push({
            kind: 'bundle',
            bundle: {
              senderEmail: addr,
              senderLabel: getSenderLabel(sorted[0]),
              emails: sorted,
              latestDate: sorted[0].receivedAt ?? '',
            },
          });
        }
        // Subsequent emails from the same sender are consumed — no extra row
      } else {
        result.push({ kind: 'email', email });
      }
    }

    return result;
  }, [emails]);

  const toggleBundle = (senderEmail: string) => {
    setExpandedBundles((prev) => {
      const next = new Set(prev);
      if (next.has(senderEmail)) next.delete(senderEmail);
      else next.add(senderEmail);
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2 py-8">
        <span className="text-4xl">📭</span>
        <span className="text-sm">No emails found</span>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {items.map((item) => {
        if (item.kind === 'bundle') {
          return (
            <BundleRow
              key={`bundle:${item.bundle.senderEmail}`}
              bundle={item.bundle}
              isExpanded={expandedBundles.has(item.bundle.senderEmail)}
              openEmailId={openEmailId}
              onToggle={() => toggleBundle(item.bundle.senderEmail)}
              onEmailClick={onEmailClick}
            />
          );
        }
        return (
          <PlainEmailRow
            key={item.email.id}
            email={item.email}
            isOpen={openEmailId === item.email.id}
            onEmailClick={onEmailClick}
          />
        );
      })}
    </div>
  );
}

// ─── BundleToggle ─────────────────────────────────────────────────────────────

export interface BundleToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

/**
 * Small pill button for the email list header.
 * Renders "Bundle: ON" or "Bundle: OFF" with visual state indication.
 */
export function BundleToggle({ enabled, onToggle }: BundleToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
        enabled
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
      title={enabled ? 'Smart bundling on — click to show all emails individually' : 'Smart bundling off — click to group newsletters by sender'}
    >
      <span>📦</span>
      <span className="hidden sm:inline">Bundle: {enabled ? 'ON' : 'OFF'}</span>
    </button>
  );
}
