'use client';

import { useState, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { useLabels } from '@/hooks/use-labels';
import { buildLabelTree, type LabelTreeNode } from '@/lib/mail/label-tree';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NestedLabelsProps {
  accountId: string;
  onSelect: (labelId: string) => void;
  /** Highlight this label id as selected */
  selectedLabelId?: string;
}

// ─── Toast (minimal, no external dep) ────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = setTimeout(() => setMessage(null), 2500);
  }, []);

  return { message, show };
}

// ─── Single tree node ─────────────────────────────────────────────────────────

interface TreeItemProps {
  node: LabelTreeNode;
  depth: number;
  selectedLabelId?: string;
  onSelect: (labelId: string) => void;
  onNestRequest: (nodeId: string) => void;
}

function TreeItem({
  node,
  depth,
  selectedLabelId,
  onSelect,
  onNestRequest,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isGhost = node.id.startsWith('__ghost__:');
  const isSelected = node.id === selectedLabelId;

  // Long-press detection
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      onNestRequest(node.id);
    }, 600);
  }, [node.id, onNestRequest]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleClick = useCallback(() => {
    if (!isGhost) onSelect(node.id);
  }, [isGhost, node.id, onSelect]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded((v) => !v);
    },
    []
  );

  return (
    <li className="select-none">
      <div
        role={isGhost ? 'group' : 'button'}
        tabIndex={isGhost ? -1 : 0}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm cursor-pointer',
          'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isSelected && !isGhost && 'bg-accent font-medium',
          isGhost && 'cursor-default opacity-70'
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Collapse/expand chevron — only visible when there are children */}
        <span
          className={cn(
            'flex-none w-4 h-4 flex items-center justify-center text-muted-foreground',
            !hasChildren && 'invisible'
          )}
          onClick={hasChildren ? handleToggle : undefined}
          aria-hidden="true"
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )
          ) : null}
        </span>

        {/* Color dot */}
        <span
          className="flex-none w-2.5 h-2.5 rounded-full border border-black/10"
          style={{ backgroundColor: node.color }}
          aria-hidden="true"
        />

        {/* Label name */}
        <span className="flex-1 truncate text-foreground/90">
          {node.displayName}
        </span>

        {/* Placeholder unread badge — callers may pass unread counts
            via an extended prop in the future; shown as 0 for now so
            the slot is always reserved in the layout. */}
        {/* Intentionally omitted until unread count data is wired */}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <ul role="group" className="m-0 p-0 list-none">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedLabelId={selectedLabelId}
              onSelect={onSelect}
              onNestRequest={onNestRequest}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NestedLabels({
  accountId,
  onSelect,
  selectedLabelId,
}: NestedLabelsProps) {
  const { data: labels, isLoading, error } = useLabels(accountId);
  const { message: toastMsg, show: showToast } = useToast();

  const tree = labels ? buildLabelTree(labels) : [];

  const handleNestRequest = useCallback(
    (_nodeId: string) => {
      showToast('Drag nesting coming soon');
    },
    [showToast]
  );

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse">
        Loading labels...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-destructive">
        Failed to load labels.
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5" />
        No labels yet
      </div>
    );
  }

  return (
    <nav aria-label="Labels" className="relative">
      <ul role="tree" className="m-0 p-0 list-none space-y-0.5">
        {tree.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            selectedLabelId={selectedLabelId}
            onSelect={onSelect}
            onNestRequest={handleNestRequest}
          />
        ))}
      </ul>

      {/* Inline toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'absolute bottom-0 left-0 right-0 mx-2 mb-1',
            'rounded-md bg-popover border border-border shadow-md',
            'px-3 py-1.5 text-xs text-foreground text-center',
            'pointer-events-none z-50',
            'animate-in fade-in slide-in-from-bottom-1 duration-150'
          )}
        >
          {toastMsg}
        </div>
      )}
    </nav>
  );
}
