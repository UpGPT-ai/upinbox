'use client';

/**
 * MCP Integration Guide — /inbox/mcp
 *
 * Three-tab layout:
 *   1. Claude Desktop  — JSON config snippet + copy button + setup steps
 *   2. Claude.ai       — Remote MCP URL + OAuth auth + steps
 *   3. API             — curl examples using a bearer token
 *
 * Fetches the user's MCP tokens from GET /api/upinbox/mcp-tokens to
 * pre-populate code examples with a real token.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface McpToken {
  id: string;
  description: string | null;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// ─── Available MCP tools listing ───────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: 'list_emails',
    scope: 'read',
    description: 'List emails from a mailbox with optional filters (label, unread, search query, limit).',
  },
  {
    name: 'get_email',
    scope: 'read',
    description: 'Fetch the full content of a single email by ID, including headers, body, and attachments.',
  },
  {
    name: 'search_emails',
    scope: 'read',
    description: 'Full-text search across all connected mailboxes using Gmail-style query syntax.',
  },
  {
    name: 'send_email',
    scope: 'write',
    description: 'Compose and send an email. Supports To, Cc, Bcc, Reply-To, and inline attachments.',
  },
  {
    name: 'reply_email',
    scope: 'write',
    description: 'Reply to an existing thread, automatically threading the conversation.',
  },
  {
    name: 'forward_email',
    scope: 'write',
    description: 'Forward an email to new recipients, preserving the original message.',
  },
  {
    name: 'move_email',
    scope: 'write',
    description: 'Move an email to a different label or folder.',
  },
  {
    name: 'label_email',
    scope: 'write',
    description: 'Apply or remove labels on an email.',
  },
  {
    name: 'mark_read',
    scope: 'write',
    description: 'Mark one or more emails as read or unread.',
  },
  {
    name: 'snooze_email',
    scope: 'write',
    description: 'Snooze an email — hide it until a specified date/time.',
  },
  {
    name: 'trash_email',
    scope: 'delete',
    description: 'Move an email to trash. Requires delete scope.',
  },
  {
    name: 'list_accounts',
    scope: 'read',
    description: 'List all connected email accounts for the current user.',
  },
  {
    name: 'get_mailboxes',
    scope: 'read',
    description: 'List all mailboxes (labels/folders) for a given account.',
  },
] as const;

const SCOPE_COLORS: Record<string, string> = {
  read: 'bg-blue-50 text-blue-700 border-blue-200',
  write: 'bg-amber-50 text-amber-700 border-amber-200',
  delete: 'bg-red-50 text-red-700 border-red-200',
};

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useMcpTokens() {
  return useQuery<McpToken[]>({
    queryKey: ['upinbox', 'mcp-tokens'],
    queryFn: async () => {
      const res = await fetch('/api/upinbox/mcp-tokens');
      if (!res.ok) throw new Error('Failed to fetch tokens');
      const { tokens } = await res.json();
      return tokens as McpToken[];
    },
  });
}

// ─── Small UI primitives ───────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  return (
    <div className="relative group">
      <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono leading-relaxed border border-border">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
        {n}
      </div>
      <div className="flex-1 pb-1">
        <p className="font-medium text-sm mb-1">{title}</p>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
      <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold mt-8 mb-3">{children}</h2>;
}

// ─── Tab panels ────────────────────────────────────────────────────────────────

function ClaudeDesktopTab({ token, appUrl }: { token: string; appUrl: string }) {
  const config = JSON.stringify(
    {
      mcpServers: {
        upinbox: {
          url: `${appUrl}/api/upinbox/mcp`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-6">
      <InfoBox>
        Claude Desktop supports MCP servers via a local config file.
        Paste the snippet below into your <code className="font-mono text-xs bg-blue-100 px-1 py-0.5 rounded">claude_desktop_config.json</code> to connect UpInbox.
      </InfoBox>

      <div>
        <SectionTitle>1. Get your MCP token</SectionTitle>
        <p className="text-sm text-muted-foreground mb-3">
          Go to{' '}
          <a href="/settings" className="text-primary underline underline-offset-2">
            Settings &rarr; MCP Tokens
          </a>{' '}
          and create a token. Copy the plaintext value — it's shown only once.
        </p>
        {token === '<YOUR_MCP_TOKEN>' && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            No token found — create one in Settings first, then return here to see it pre-filled.
          </div>
        )}
      </div>

      <div>
        <SectionTitle>2. Add to Claude Desktop config</SectionTitle>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">
            Open <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded border">~/Library/Application Support/Claude/claude_desktop_config.json</code> and add:
          </p>
          <CopyButton text={config} label="Copy config" />
        </div>
        <CodeBlock code={config} language="json" />
      </div>

      <div>
        <SectionTitle>3. Restart Claude Desktop</SectionTitle>
        <div className="space-y-3">
          <Step n={1} title="Quit Claude Desktop completely">
            <p>Use Claude menu &rarr; Quit, or press <code className="font-mono text-xs bg-muted px-1 rounded border">⌘Q</code>.</p>
          </Step>
          <Step n={2} title="Re-open Claude Desktop">
            <p>Launch it from Applications or Spotlight.</p>
          </Step>
          <Step n={3} title="Verify the connection">
            <p>
              Open a new conversation and ask Claude:{' '}
              <span className="italic">"What email tools do you have access to?"</span>
              — it should list the UpInbox tools.
            </p>
          </Step>
        </div>
      </div>
    </div>
  );
}

function ClaudeAiTab({ token, appUrl }: { token: string; appUrl: string }) {
  const mcpUrl = `${appUrl}/api/upinbox/mcp`;

  return (
    <div className="space-y-6">
      <InfoBox>
        Claude.ai (web) supports remote MCP servers via{' '}
        <strong>Integrations</strong>. You'll authorize UpInbox using OAuth — no manual token copy required.
      </InfoBox>

      <div>
        <SectionTitle>MCP Server URL</SectionTitle>
        <div className="flex items-center gap-3">
          <code className="flex-1 block font-mono text-sm bg-muted border border-border rounded-lg px-4 py-3 select-all break-all">
            {mcpUrl}
          </code>
          <CopyButton text={mcpUrl} label="Copy URL" />
        </div>
      </div>

      <div>
        <SectionTitle>Setup steps</SectionTitle>
        <div className="space-y-4">
          <Step n={1} title="Open Claude.ai">
            <p>
              Go to{' '}
              <a href="https://claude.ai" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                claude.ai
              </a>{' '}
              and sign in to your account.
            </p>
          </Step>
          <Step n={2} title="Navigate to Integrations">
            <p>
              Click your profile icon &rarr; <strong>Settings</strong> &rarr; <strong>Integrations</strong>.
            </p>
          </Step>
          <Step n={3} title="Add a new integration">
            <p>
              Click <strong>Add Integration</strong>, then paste the MCP Server URL above.
            </p>
          </Step>
          <Step n={4} title="Authorize UpInbox">
            <p>
              Claude.ai will open an authorization dialog. Sign in with your UpInbox account and grant access.
              OAuth handles authentication — no manual token needed.
            </p>
          </Step>
          <Step n={5} title="Test the connection">
            <p>
              Start a new conversation and ask:{' '}
              <span className="italic">"List my unread emails from today."</span>
            </p>
          </Step>
        </div>
      </div>

      <div>
        <SectionTitle>Manual bearer token (alternative)</SectionTitle>
        <p className="text-sm text-muted-foreground mb-3">
          If your Claude.ai plan supports custom headers, you can authenticate with a bearer token instead of OAuth:
        </p>
        {token !== '<YOUR_MCP_TOKEN>' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Header</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 font-mono text-sm bg-muted border border-border rounded-lg px-4 py-2 truncate">
                Authorization: Bearer {token}
              </code>
              <CopyButton text={`Bearer ${token}`} label="Copy" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ApiTab({ token, appUrl }: { token: string; appUrl: string }) {
  const baseUrl = `${appUrl}/api/upinbox/mcp`;

  const listEmailsExample = `curl -X POST ${baseUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_emails",
      "arguments": {
        "label": "INBOX",
        "unread": true,
        "limit": 10
      }
    }
  }'`;

  const searchEmailsExample = `curl -X POST ${baseUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_emails",
      "arguments": {
        "query": "from:boss@company.com subject:invoice",
        "limit": 5
      }
    }
  }'`;

  const sendEmailExample = `curl -X POST ${baseUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "send_email",
      "arguments": {
        "to": ["recipient@example.com"],
        "subject": "Hello from the API",
        "body": "This was sent via the UpInbox MCP API."
      }
    }
  }'`;

  const listToolsExample = `curl -X POST ${baseUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 0,
    "method": "tools/list"
  }'`;

  return (
    <div className="space-y-6">
      <InfoBox>
        The UpInbox MCP server implements the{' '}
        <a href="https://modelcontextprotocol.io/specification" target="_blank" rel="noreferrer" className="underline underline-offset-2 text-blue-700">
          Model Context Protocol 2025-03-26
        </a>{' '}
        spec over HTTP. All requests are JSON-RPC 2.0.
        Authenticate with a bearer token from{' '}
        <a href="/settings" className="underline underline-offset-2 text-blue-700">
          Settings &rarr; MCP Tokens
        </a>.
      </InfoBox>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium">Endpoint</p>
        </div>
        <div className="flex items-center gap-3">
          <code className="flex-1 font-mono text-sm bg-muted border border-border rounded-lg px-4 py-2 break-all">
            POST {baseUrl}
          </code>
          <CopyButton text={baseUrl} label="Copy" />
        </div>
      </div>

      <div>
        <SectionTitle>List available tools</SectionTitle>
        <CodeBlock code={listToolsExample} language="bash" />
      </div>

      <div>
        <SectionTitle>List unread emails</SectionTitle>
        <CodeBlock code={listEmailsExample} language="bash" />
      </div>

      <div>
        <SectionTitle>Search emails</SectionTitle>
        <CodeBlock code={searchEmailsExample} language="bash" />
      </div>

      <div>
        <SectionTitle>Send an email</SectionTitle>
        <CodeBlock code={sendEmailExample} language="bash" />
      </div>

      <div>
        <SectionTitle>Token scopes</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-6 font-medium text-muted-foreground">Scope</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Permitted operations</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="py-2.5 pr-6"><span className="font-mono text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">read</span></td>
                <td className="py-2.5 text-muted-foreground">list_emails, get_email, search_emails, list_accounts, get_mailboxes</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-6"><span className="font-mono text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">write</span></td>
                <td className="py-2.5 text-muted-foreground">send_email, reply_email, forward_email, move_email, label_email, mark_read, snooze_email</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-6"><span className="font-mono text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded">delete</span></td>
                <td className="py-2.5 text-muted-foreground">trash_email</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Available Tools section ───────────────────────────────────────────────────

function AvailableToolsSection() {
  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Available tools</h2>
      <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
        {MCP_TOOLS.map((tool) => (
          <div key={tool.name} className="flex items-start gap-4 px-4 py-3">
            <div className="flex-shrink-0 w-5 mt-0.5">
              <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border ${SCOPE_COLORS[tool.scope]}`}>
                {tool.scope[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <code className="text-sm font-mono text-foreground">{tool.name}</code>
              <p className="text-sm text-muted-foreground mt-0.5">{tool.description}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border mr-1 ${SCOPE_COLORS.read}`}>R</span>read scope
        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border mx-1 ${SCOPE_COLORS.write}`}>W</span>write scope
        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border mx-1 ${SCOPE_COLORS.delete}`}>D</span>delete scope
      </p>
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'desktop', label: 'Claude Desktop' },
  { id: 'claudeai', label: 'Claude.ai' },
  { id: 'api', label: 'API' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function McpIntegrationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('desktop');
  const { data: tokens = [] } = useMcpTokens();

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.upinbox.ai');

  // Use the first available token as a real example, otherwise a placeholder
  const exampleToken =
    tokens.length > 0 ? `upib_••••••••••${tokens[0].id.slice(-6)}` : '<YOUR_MCP_TOKEN>';

  // For config we need a real token — guide users to Settings if none exists
  const configToken = tokens.length > 0 ? exampleToken : '<YOUR_MCP_TOKEN>';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <a href="/inbox" className="hover:text-foreground transition-colors">Inbox</a>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Claude Integration</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Connect Claude to your inbox</h1>
          <p className="text-muted-foreground">
            Give Claude secure, scoped access to your email via the Model Context Protocol.
            Read, search, send, and manage email — all from within Claude conversations.
          </p>
        </div>

        {/* No tokens notice */}
        {tokens.length === 0 && (
          <div className="flex items-start gap-3 p-4 mb-6 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              You don't have any MCP tokens yet. Code examples below use a placeholder.{' '}
              <a href="/settings" className="underline underline-offset-2 font-medium">
                Create a token in Settings
              </a>{' '}
              to see real values here.
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border border-border rounded-xl overflow-hidden mb-8">
          <div className="flex border-b border-border bg-muted/40">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground border-b-2 border-primary -mb-px'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-6">
            {activeTab === 'desktop' && (
              <ClaudeDesktopTab token={configToken} appUrl={appUrl} />
            )}
            {activeTab === 'claudeai' && (
              <ClaudeAiTab token={configToken} appUrl={appUrl} />
            )}
            {activeTab === 'api' && (
              <ApiTab token={configToken} appUrl={appUrl} />
            )}
          </div>
        </div>

        {/* Available tools */}
        <AvailableToolsSection />

        {/* Footer links */}
        <div className="mt-10 pt-6 border-t border-border flex flex-wrap gap-4 text-sm text-muted-foreground">
          <a href="/settings" className="hover:text-foreground transition-colors">
            Manage MCP tokens
          </a>
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            MCP specification
          </a>
          <a
            href="https://docs.anthropic.com/claude/docs/claude-desktop"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Claude Desktop docs
          </a>
        </div>
      </div>
    </div>
  );
}
