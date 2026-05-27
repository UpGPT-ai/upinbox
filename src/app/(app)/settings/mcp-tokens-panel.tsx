'use client';

/**
 * MCP Tokens Panel — create and manage MCP tokens for AI assistant integration.
 *
 * Shows created tokens (display-once plaintext, then hash only).
 * Copy config snippets for Claude Desktop and Cursor.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface McpToken {
  id: string;
  description: string | null;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface CreateTokenResult {
  token: string;      // plaintext — shown once
  record: McpToken;
}

function useMcpTokens() {
  return useQuery({
    queryKey: ['upinbox', 'mcp-tokens'],
    queryFn: async (): Promise<McpToken[]> => {
      const res = await fetch('/api/upinbox/mcp-tokens');
      if (!res.ok) throw new Error('Failed to fetch tokens');
      const { tokens } = await res.json();
      return tokens;
    },
  });
}

export function McpTokensPanel() {
  const queryClient = useQueryClient();
  const { data: tokens = [], isLoading } = useMcpTokens();
  const [newDescription, setNewDescription] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read', 'write']);
  const [newToken, setNewToken] = useState<CreateTokenResult | null>(null);

  const createToken = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/upinbox/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newDescription, scopes: selectedScopes }),
      });
      if (!res.ok) throw new Error('Failed to create token');
      return res.json() as Promise<CreateTokenResult>;
    },
    onSuccess: (data) => {
      setNewToken(data);
      setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['upinbox', 'mcp-tokens'] });
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (tokenId: string) => {
      const res = await fetch(`/api/upinbox/mcp-tokens/${tokenId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke token');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upinbox', 'mcp-tokens'] });
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-instance.com';

  const claudeConfig = (token: string) => JSON.stringify({
    mcpServers: {
      upinbox: {
        url: `${appUrl}/api/upinbox/mcp`,
        auth: `Bearer ${token}`,
      },
    },
  }, null, 2);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">MCP Tokens</h2>
        <p className="text-sm text-muted-foreground mt-1">
          MCP tokens let AI assistants (Claude Desktop, Cursor, etc.) read and manage your email.
          Tokens are scoped — you control what each assistant can do.
        </p>
      </div>

      {/* New token display */}
      {newToken && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-green-900">
              ✓ Token created — copy it now. It won't be shown again.
            </p>
            <code className="mt-2 block text-xs font-mono bg-white border rounded p-2 break-all select-all">
              {newToken.token}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newToken.token)}
              className="mt-1 text-xs text-green-700 hover:underline"
            >
              Copy token
            </button>
          </div>

          <details>
            <summary className="text-xs font-medium text-green-800 cursor-pointer">
              Claude Desktop / Cursor config snippet
            </summary>
            <pre className="mt-2 text-xs bg-white border rounded p-2 overflow-x-auto">
              {claudeConfig(newToken.token)}
            </pre>
          </details>

          <button
            onClick={() => setNewToken(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create new token */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-sm">Create a new token</h3>
        <div>
          <label className="text-sm font-medium mb-1 block">Description</label>
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="e.g. Claude Desktop - personal laptop"
            className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Scopes</label>
          <div className="flex gap-3">
            {(['read', 'write', 'delete'] as const).map((scope) => (
              <label key={scope} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedScopes((s) => [...s, scope]);
                    } else {
                      setSelectedScopes((s) => s.filter((x) => x !== scope));
                    }
                  }}
                  className="rounded"
                />
                {scope}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            read: list/read emails · write: send/label/move · delete: trash emails
          </p>
        </div>
        <button
          onClick={() => createToken.mutate()}
          disabled={createToken.isPending || selectedScopes.length === 0}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {createToken.isPending ? 'Creating…' : 'Create token'}
        </button>
      </div>

      {/* Existing tokens */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">Active tokens</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
            No tokens yet. Create one above to get started.
          </p>
        ) : (
          tokens.map((token) => (
            <div key={token.id} className="flex items-center justify-between border rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium">{token.description ?? 'Unnamed token'}</p>
                <p className="text-xs text-muted-foreground">
                  Scopes: {token.scopes.join(', ')} ·{' '}
                  {token.last_used_at
                    ? `Last used ${new Date(token.last_used_at).toLocaleDateString()}`
                    : 'Never used'
                  } ·{' '}
                  Created {new Date(token.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => revokeToken.mutate(token.id)}
                disabled={revokeToken.isPending}
                className="text-xs text-destructive hover:underline disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
