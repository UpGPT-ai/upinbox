'use client';

import { useQuery } from '@tanstack/react-query';

interface BillingResponse {
  hasEmail: boolean;
  plan?: string;
  planName?: string;
  capabilities?: string[];
  accountsUsed?: number;
  accountsLimit?: number;
  subscribeUrl: string;
  manageUrl: string;
}

const CAPABILITY_LABELS: Record<string, string> = {
  email: 'Email',
  byok: 'BYOK AI',
  mcp: 'MCP',
  mobile: 'Mobile',
  uplink: 'UpLink',
  upgpt: 'UpGPT',
  drafts: 'AI Drafts',
  labels: 'Smart Labels',
  teams: 'Teams',
  api: 'Intelligence API',
};

const FEATURE_LIST = [
  { icon: '✉', label: 'UpInbox email — ZK-encrypted, BYOK AI triage' },
  { icon: '🔑', label: 'BYOK — bring Claude, GPT, Gemini keys' },
  { icon: '🔌', label: 'MCP server access — connect your tools' },
  { icon: '📱', label: 'Mobile apps — iOS and Android' },
  { icon: '🔗', label: 'UpLink features — agent orchestration' },
  { icon: '🤖', label: 'UpGPT workflows — multi-agent automation' },
];

function useBilling() {
  return useQuery({
    queryKey: ['upinbox', 'billing'],
    queryFn: async (): Promise<BillingResponse> => {
      const res = await fetch('/api/upinbox/billing');
      if (!res.ok) throw new Error('Failed to fetch billing');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function BillingPanel() {
  const { data: billing, isLoading } = useBilling();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-muted rounded w-32 animate-pulse" />
        <div className="h-24 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Billing</h2>
        <p className="text-sm text-muted-foreground">Unable to load billing information.</p>
      </div>
    );
  }

  const subscribeUrl = billing.subscribeUrl || 'https://upgpt.ai/pricing';
  const manageUrl = billing.manageUrl || 'https://upgpt.ai/account/billing';

  // No email capability → show upgrade card
  if (!billing.hasEmail) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">Billing</h2>

        <div className="border-2 border-primary/30 rounded-lg p-6 space-y-4 bg-primary/5">
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Unlock UpInbox email</h3>
            <p className="text-sm text-muted-foreground">
              Billing is managed at UpGPT.ai — your one subscription unlocks UpInbox,
              UpLink features, and more.
            </p>
          </div>

          <ul className="space-y-2">
            {FEATURE_LIST.map((feature) => (
              <li key={feature.label} className="flex items-start gap-2 text-sm">
                <span className="text-primary font-medium">{feature.icon}</span>
                <span>{feature.label}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => window.open(subscribeUrl, '_blank')}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Subscribe at UpGPT.ai →
            </button>
          </div>
        </div>

        <div className="border border-dashed rounded-lg p-4 space-y-1">
          <p className="text-sm font-medium">Self-hosting?</p>
          <p className="text-xs text-muted-foreground">
            UpInbox is free under MIT license when you host it yourself.
          </p>
          <a
            href="/docs/SELF-HOSTING.md"
            className="text-xs text-primary hover:underline inline-block"
            target="_blank"
            rel="noopener noreferrer"
          >
            Self-hosting docs →
          </a>
        </div>
      </div>
    );
  }

  // Has email capability → show active state
  const capabilities = billing.capabilities ?? [];
  const planName = billing.planName ?? billing.plan ?? 'UpGPT Subscription';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Billing</h2>

      <div className="border rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{planName}</span>
              <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground">UpGPT subscription</p>
          </div>
          <button
            onClick={() => window.open(manageUrl, '_blank')}
            className="px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors whitespace-nowrap"
          >
            Manage at UpGPT.ai →
          </button>
        </div>

        {capabilities.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Active capabilities
            </p>
            <div className="flex flex-wrap gap-2">
              {capabilities.map((cap) => (
                <span
                  key={cap}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-800 text-xs rounded-md border border-green-200"
                >
                  <span>{CAPABILITY_LABELS[cap] ?? cap}</span>
                  <span>✓</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {typeof billing.accountsUsed === 'number' && typeof billing.accountsLimit === 'number' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Email accounts</span>
              <span className="font-medium">
                {billing.accountsUsed} / {billing.accountsLimit === -1 ? '∞' : billing.accountsLimit}
              </span>
            </div>
            {billing.accountsLimit > 0 && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (billing.accountsUsed / billing.accountsLimit) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-dashed rounded-lg p-4">
        <p className="text-xs text-muted-foreground">
          All UpGPT billing is at UpGPT.ai — UpInbox is just one of your capabilities.
        </p>
      </div>
    </div>
  );
}
