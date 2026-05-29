'use client';

/**
 * Settings shell — tabbed settings pages.
 *
 * Tabs: General | AI Config | Accounts | Screener Rules | Billing | MCP Tokens
 */

import { useState } from 'react';
import { useAtom } from 'jotai';
import { undoDurationMsAtom } from '@/atoms/mail';
import { AiSetupPanel } from '@/components/ai/ai-setup-panel';
import { BillingPanel } from './billing-panel';
import { McpTokensPanel } from './mcp-tokens-panel';

type Tab = 'general' | 'ai' | 'accounts' | 'screener' | 'billing' | 'mcp';

const UNDO_OPTIONS: { label: string; value: number }[] = [
  { label: '5s',  value: 5000 },
  { label: '10s', value: 10000 },
  { label: '15s', value: 15000 },
  { label: '30s', value: 30000 },
  { label: '1 min', value: 60000 },
];

function GeneralPanel() {
  const [undoDurationMs, setUndoDurationMs] = useAtom(undoDurationMsAtom);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground mt-1">Preferences that apply across all your accounts.</p>
      </div>

      {/* Undo duration */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Undo duration</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            How long you have to undo an archive or delete before it becomes permanent.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
          {UNDO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setUndoDurationMs(opt.value)}
              className={`
                px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${undoDurationMs === opt.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Currently: <span className="font-medium text-foreground">
            {UNDO_OPTIONS.find(o => o.value === undoDurationMs)?.label ?? `${undoDurationMs / 1000}s`}
          </span>
        </p>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'ai', label: 'AI & Privacy', icon: '🤖' },
  { id: 'accounts', label: 'Accounts', icon: '📧' },
  { id: 'screener', label: 'Screener Rules', icon: '🔀' },
  { id: 'billing', label: 'Billing', icon: '💳' },
  { id: 'mcp', label: 'MCP Tokens', icon: '🔌' },
];

export function SettingsShell() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar nav */}
      <div className="w-52 border-r flex-shrink-0 p-4 space-y-1">
        <div className="flex items-center gap-2 px-2 py-1 mb-4">
          <a href="/inbox" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to inbox
          </a>
        </div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
          Settings
        </h2>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left
              ${activeTab === tab.id
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }
            `}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        {activeTab === 'general' && <GeneralPanel />}
        {activeTab === 'ai' && <AiSetupPanel />}
        {activeTab === 'accounts' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Connected accounts</h2>
            <p className="text-sm text-muted-foreground">
              Manage your connected email accounts.
              Add or remove Gmail, Outlook, IMAP, or @upinbox.ai accounts.
            </p>
            <a
              href="/inbox"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Manage accounts in inbox →
            </a>
          </div>
        )}
        {activeTab === 'screener' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Screener rules</h2>
            <p className="text-sm text-muted-foreground">
              Configure how UpInbox routes incoming mail.
              Rules are applied in priority order.
            </p>
            <div className="border rounded-lg p-4 text-sm text-muted-foreground">
              Screener rule editor — coming in next release.
              Rules are active and seeded with defaults.
            </div>
          </div>
        )}
        {activeTab === 'billing' && <BillingPanel />}
        {activeTab === 'mcp' && <McpTokensPanel />}
      </div>
    </div>
  );
}
