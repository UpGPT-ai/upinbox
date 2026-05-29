'use client';

import { useState, useEffect, useCallback } from 'react';

type AliasRecord = {
  id: string;
  address: string;
  label?: string;
  active: boolean;
  createdAt: string;
};

interface AliasManagerProps {
  accountId: string;
}

export function AliasManager({ accountId }: AliasManagerProps) {
  const [aliases, setAliases] = useState<AliasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAliases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/upinbox/aliases?accountId=${encodeURIComponent(accountId)}`);
      if (!res.ok) throw new Error('Failed to load aliases');
      const data = await res.json();
      setAliases(data.aliases ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchAliases();
  }, [fetchAliases]);

  async function generateAlias() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/upinbox/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, label: newLabel.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to generate alias');
      }
      const data = await res.json();
      setAliases((prev) => [
        ...prev,
        {
          id: data.id,
          address: data.alias,
          label: data.label,
          active: data.active,
          createdAt: new Date().toISOString(),
        },
      ]);
      setNewLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  }

  async function revokeAlias(id: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/upinbox/aliases?id=${encodeURIComponent(id)}&accountId=${encodeURIComponent(accountId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to revoke alias');
      }
      setAliases((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: false } : a))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  const activeAliases = aliases.filter((a) => a.active);
  const revokedAliases = aliases.filter((a) => !a.active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Email Aliases</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Each alias forwards to your real address. Revoke anytime to block a sender.
        </p>
      </div>

      {/* Info callout */}
      <div className="flex gap-3 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
        <span className="text-blue-500 mt-0.5 flex-shrink-0">ℹ</span>
        <p className="text-blue-700 dark:text-blue-300">
          Aliases protect your real address when signing up for services.
          Any mail sent to an alias is forwarded to your connected inbox.
          Revoking an alias permanently blocks all future mail from it.
        </p>
      </div>

      {/* Generate new alias */}
      <div className="space-y-3 p-4 border rounded-lg">
        <h3 className="text-sm font-medium">Generate new alias</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (optional, e.g. Shopping)"
            className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !generating) generateAlias();
            }}
          />
          <button
            onClick={generateAlias}
            disabled={generating}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Aliases follow the format <code className="font-mono bg-muted px-1 py-0.5 rounded">word-word-1234@mail.upinbox.ai</code>
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Active aliases */}
      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading aliases...</div>
      ) : (
        <div className="space-y-4">
          {activeAliases.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground border rounded-lg">
              No active aliases. Generate one above to get started.
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active ({activeAliases.length})
              </h3>
              {activeAliases.map((alias) => (
                <AliasTile
                  key={alias.id}
                  alias={alias}
                  copiedId={copiedId}
                  onCopy={copyToClipboard}
                  onRevoke={revokeAlias}
                />
              ))}
            </div>
          )}

          {revokedAliases.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Revoked ({revokedAliases.length})
              </h3>
              {revokedAliases.map((alias) => (
                <AliasTile
                  key={alias.id}
                  alias={alias}
                  copiedId={copiedId}
                  onCopy={copyToClipboard}
                  onRevoke={revokeAlias}
                  revoked
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Individual alias row
function AliasTile({
  alias,
  copiedId,
  onCopy,
  onRevoke,
  revoked = false,
}: {
  alias: AliasRecord;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onRevoke: (id: string) => void;
  revoked?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const isCopied = copiedId === alias.id;

  function handleRevokeClick() {
    if (confirming) {
      onRevoke(alias.id);
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  }

  return (
    <div
      className={`flex items-center gap-3 p-3 border rounded-lg text-sm transition-opacity ${
        revoked ? 'opacity-50' : ''
      }`}
    >
      {/* Address + label */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs truncate">{alias.address}</p>
        {alias.label && (
          <p className="text-xs text-muted-foreground mt-0.5">{alias.label}</p>
        )}
      </div>

      {/* Status badge */}
      <span
        className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
          alias.active
            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
        }`}
      >
        {alias.active ? 'Active' : 'Revoked'}
      </span>

      {/* Actions */}
      {alias.active && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Copy address */}
          <button
            onClick={() => onCopy(alias.address, alias.id)}
            title="Copy alias address"
            className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {isCopied ? 'Copied!' : 'Copy'}
          </button>

          {/* Use in compose */}
          <button
            onClick={() => onCopy(alias.address, alias.id)}
            title="Copy alias to use in compose"
            className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Use
          </button>

          {/* Revoke */}
          <button
            onClick={handleRevokeClick}
            title={confirming ? 'Click again to confirm revoke' : 'Revoke alias'}
            className={`px-2 py-1 rounded-md text-xs transition-colors ${
              confirming
                ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                : 'text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400'
            }`}
          >
            {confirming ? 'Confirm?' : 'Revoke'}
          </button>
        </div>
      )}
    </div>
  );
}
