'use client';

import { useEffect, useState } from 'react';

type Capability = {
  key: string;
  label: string;
  product: string;
};

const CAPABILITIES: Capability[] = [
  { key: 'email', label: 'email', product: 'upinbox' },
  { key: 'mcp', label: 'mcp', product: 'mcp' },
  { key: 'byok', label: 'byok', product: 'byok' },
  { key: 'voice', label: 'voice', product: 'upvoice' },
  { key: 'sms', label: 'sms', product: 'upsms' },
  { key: 'calendar', label: 'calendar', product: 'upcalendar' },
];

type BillingResponse = {
  capabilities?: Record<string, boolean> | string[];
  active?: string[];
  manageUrl?: string;
};

export default function CapabilityBadges() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [manageUrl, setManageUrl] = useState<string>('https://upgpt.ai/billing');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/upinbox/billing', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BillingResponse = await res.json();

        const set = new Set<string>();
        if (Array.isArray(data.capabilities)) {
          data.capabilities.forEach((c) => set.add(c));
        } else if (data.capabilities && typeof data.capabilities === 'object') {
          Object.entries(data.capabilities).forEach(([k, v]) => {
            if (v) set.add(k);
          });
        }
        if (Array.isArray(data.active)) {
          data.active.forEach((c) => set.add(c));
        }

        if (!cancelled) {
          setActiveKeys(set);
          if (data.manageUrl) setManageUrl(data.manageUrl);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = CAPABILITIES.filter((c) => activeKeys.has(c.key)).length;
  const total = CAPABILITIES.length;

  const handleManage = () => {
    if (typeof window !== 'undefined') {
      window.open(manageUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const subscribeUrl = (product: string) =>
    `https://upgpt.ai/subscribe?product=${encodeURIComponent(product)}`;

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#fafafa',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          fontSize: 13,
          color: '#6b7280',
        }}
      >
        Loading capabilities…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          fontSize: 13,
          color: '#b91c1c',
        }}
      >
        Couldn’t load capabilities ({error})
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#fafafa',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 600, color: '#111827', marginRight: 4 }}>
        {activeCount} of {total} capabilities active
      </span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
        {CAPABILITIES.map((cap) => {
          const isActive = activeKeys.has(cap.key);
          if (isActive) {
            return (
              <span
                key={cap.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: '#dcfce7',
                  color: '#166534',
                  border: '1px solid #bbf7d0',
                  fontSize: 12,
                  fontWeight: 500,
                }}
                title={`${cap.label} active`}
              >
                <span aria-hidden>✓</span>
                {cap.label}
              </span>
            );
          }
          return (
            <span
              key={cap.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                borderRadius: 999,
                background: '#f3f4f6',
                color: '#6b7280',
                border: '1px solid #e5e7eb',
                fontSize: 12,
                fontWeight: 500,
              }}
              title={`${cap.label} not active`}
            >
              {cap.label}
              <a
                href={subscribeUrl(cap.product)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#2563eb',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Add
              </a>
            </span>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleManage}
        style={{
          padding: '4px 10px',
          borderRadius: 6,
          background: '#111827',
          color: '#ffffff',
          border: 'none',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Manage subscription at UpGPT.ai
      </button>
    </div>
  );
}
