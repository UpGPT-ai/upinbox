'use client';

import { useQuery } from '@tanstack/react-query';
import { PRICING } from '@/lib/billing/tiers';

interface Subscription {
  tier: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

function useSubscription() {
  return useQuery({
    queryKey: ['upinbox', 'subscription'],
    queryFn: async (): Promise<Subscription> => {
      const res = await fetch('/api/upinbox/billing');
      if (!res.ok) throw new Error('Failed to fetch subscription');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

const TIER_INFO: Record<string, { label: string; description: string; color: string }> = {
  free: {
    label: 'Free',
    description: 'Heuristic classification (70%), 1 account, BYOK AI',
    color: 'text-muted-foreground',
  },
  plus: {
    label: 'Plus',
    description: 'BYOK AI (95%), 3 accounts, smart labels, AI drafts, Reply Later',
    color: 'text-blue-600',
  },
  business: {
    label: 'Business',
    description: 'Intelligence API (95%, no API key needed), unlimited accounts, teams',
    color: 'text-purple-600',
  },
  community: {
    label: 'Self-Host Community',
    description: 'Free forever, ≤10 users, heuristic + BYOK',
    color: 'text-green-600',
  },
};

export function BillingPanel() {
  const { data: subscription, isLoading } = useSubscription();

  const handleUpgrade = async (plan: string) => {
    const res = await fetch('/api/upinbox/billing?action=checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.checkout_url) window.location.href = data.checkout_url;
  };

  const handlePortal = async () => {
    const res = await fetch('/api/upinbox/billing?action=portal', { method: 'POST' });
    const data = await res.json();
    if (data.portal_url) window.location.href = data.portal_url;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-muted rounded w-32 animate-pulse" />
        <div className="h-24 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const tier = subscription?.tier ?? 'free';
  const tierInfo = TIER_INFO[tier] ?? TIER_INFO.free;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Billing</h2>

      {/* Current plan */}
      <div className="border rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className={`font-semibold text-sm ${tierInfo.color}`}>{tierInfo.label}</span>
            {subscription?.status === 'active' && tier !== 'free' && (
              <span className="ml-2 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">Active</span>
            )}
          </div>
          {tier !== 'free' && tier !== 'community' && (
            <button
              onClick={handlePortal}
              className="text-sm text-primary hover:underline"
            >
              Manage subscription →
            </button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{tierInfo.description}</p>
        {subscription?.current_period_end && (
          <p className="text-xs text-muted-foreground">
            {subscription.cancel_at_period_end ? 'Cancels' : 'Renews'} on{' '}
            {new Date(subscription.current_period_end).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Upgrade options — only for free users */}
      {tier === 'free' && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Upgrade your plan</h3>

          {/* Plus */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold">Plus</span>
                <span className="ml-2 text-sm text-muted-foreground">${PRICING.plus.monthly}/mo · ${PRICING.plus.annual}/yr</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpgrade('plus_monthly')}
                  className="px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors"
                >
                  Monthly
                </button>
                <button
                  onClick={() => handleUpgrade('plus_annual')}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                >
                  Annual (save 22%)
                </button>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              <li>✓ BYOK AI triage (Claude, GPT, Gemini)</li>
              <li>✓ Up to 3 email accounts</li>
              <li>✓ Smart labels + auto-archive</li>
              <li>✓ AI draft writer + Reply Later</li>
            </ul>
          </div>

          {/* Business */}
          <div className="border rounded-lg p-4 space-y-3 border-primary/30">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold">Business</span>
                <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">Per seat</span>
                <span className="ml-2 text-sm text-muted-foreground">${PRICING.business.monthly}/seat/mo</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpgrade('business_monthly')}
                  className="px-3 py-1.5 border rounded-md text-sm hover:bg-muted transition-colors"
                >
                  Monthly
                </button>
                <button
                  onClick={() => handleUpgrade('business_annual')}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                >
                  Annual (save 21%)
                </button>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              <li>✓ Intelligence API — 95% accuracy, no API key needed</li>
              <li>✓ Unlimited email accounts</li>
              <li>✓ All Plus features</li>
              <li>✓ Team inbox + shared labels</li>
            </ul>
          </div>

          {/* Self-host */}
          <div className="border border-dashed rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Self-host for your org?</p>
            <p className="text-xs text-muted-foreground">
              Docker Compose. Your server. Your data. UpInbox never stores your email.
              Community tier is free forever. Business license: ${PRICING.selfhost_business.annual}/year.
            </p>
            <a
              href="/docs/SELF-HOSTING.md"
              className="text-xs text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Self-hosting guide →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
