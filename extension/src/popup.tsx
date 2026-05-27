/**
 * UpInbox Extension — Popup UI
 *
 * Shows current classification stats, tier info, and settings.
 * BYOK API key is stored in popup sessionStorage only — NOT in chrome.storage.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { ExtensionSettings, ByokProvider, UpInboxTier } from './types';
import { DEFAULT_SETTINGS, normalizeTier } from './types';

// ─── Storage helpers (popup context) ─────────────────────────────────────────

function getByokKey(): string {
  return sessionStorage.getItem('upinbox:byokKey') ?? '';
}
function setByokKey(key: string): void {
  sessionStorage.setItem('upinbox:byokKey', key);
  // Forward to background (in-memory only, clears on SW restart)
  chrome.runtime.sendMessage({ type: 'SET_BYOK_KEY', payload: { apiKey: key } });
}

async function sendMessage<T>(msg: object): Promise<T> {
  return chrome.runtime.sendMessage(msg);
}

// ─── Popup component ──────────────────────────────────────────────────────────

const PROVIDER_MODELS: Record<ByokProvider, string[]> = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
  uplink: ['phi4-mini', 'llama3.2', 'mistral'],
};

const TIER_LABELS: Record<UpInboxTier, { label: string; color: string }> = {
  free:     { label: 'Free', color: '#6b7280' },
  plus:     { label: 'Plus', color: '#2563eb' },
  business: { label: 'Business', color: '#7c3aed' },
};

function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [byokKey, setByokKeyState] = useState('');
  const [uplinkStatus, setUplinkStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [uplinkError, setUplinkError] = useState('');
  const [saved, setSaved] = useState(false);

  // Load settings on mount
  useEffect(() => {
    sendMessage<ExtensionSettings>({ type: 'GET_SETTINGS' }).then((s) => {
      setSettings({ ...DEFAULT_SETTINGS, ...s });
    });
    setByokKeyState(getByokKey());
  }, []);

  const save = useCallback(async (patch: Partial<ExtensionSettings>) => {
    const updated = await sendMessage<ExtensionSettings>({ type: 'UPDATE_SETTINGS', payload: patch });
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const handleByokKeyChange = (key: string) => {
    setByokKeyState(key);
    setByokKey(key);
  };

  const handleProviderChange = async (provider: ByokProvider) => {
    const model = PROVIDER_MODELS[provider][0];
    await save({ byokProvider: provider, byokModel: model });
  };

  const testUplink = async () => {
    setUplinkStatus('checking');
    setUplinkError('');
    const res = await sendMessage<{ type: string; payload: { ok: boolean; model?: string; error?: string } }>({
      type: 'TEST_UPLINK',
    });
    if (res.payload.ok) {
      setUplinkStatus('ok');
    } else {
      setUplinkStatus('error');
      setUplinkError(res.payload.error ?? 'Connection failed');
    }
  };

  const tier = normalizeTier(settings.tier);
  const tierDisplay = TIER_LABELS[tier];

  return (
    <div style={{ width: 340, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 13, color: '#111' }}>
      {/* Header */}
      <div style={{ background: '#111', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>UpInbox</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>AI Email Intelligence</span>
        </div>
        <span style={{
          background: tierDisplay.color, color: '#fff', fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em',
        }}>
          {tierDisplay.label}
        </span>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Auto-classify toggle */}
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <span style={{ fontWeight: 600 }}>Auto-classify emails</span>
          <input
            type="checkbox"
            checked={settings.autoClassify}
            onChange={(e) => save({ autoClassify: e.target.checked })}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
        </label>

        {/* AI provider */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>AI Provider</div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {(['claude', 'openai', 'gemini', 'uplink'] as ByokProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid',
                  borderColor: settings.byokProvider === p ? '#111' : '#d1d5db',
                  background: settings.byokProvider === p ? '#111' : '#fff',
                  color: settings.byokProvider === p ? '#fff' : '#374151',
                  fontWeight: settings.byokProvider === p ? 700 : 400,
                  cursor: 'pointer',
                  fontSize: 12,
                  textTransform: 'capitalize',
                }}
              >
                {p === 'uplink' ? '🔒 UpLink' : p === 'claude' ? '✦ Claude' : p === 'openai' ? 'OpenAI' : 'Gemini'}
              </button>
            ))}
          </div>

          {/* API key — not shown for uplink */}
          {settings.byokProvider !== 'uplink' && (
            <input
              type="password"
              placeholder={`${settings.byokProvider} API key (session only)`}
              value={byokKey}
              onChange={(e) => handleByokKeyChange(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', border: '1px solid #d1d5db',
                borderRadius: 4, fontSize: 12, boxSizing: 'border-box',
              }}
            />
          )}

          {/* Model selector */}
          <select
            value={settings.byokModel}
            onChange={(e) => save({ byokModel: e.target.value })}
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, marginTop: 4 }}
          >
            {PROVIDER_MODELS[settings.byokProvider].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* UpLink settings */}
        {settings.byokProvider === 'uplink' && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>🔒 UpLink (Local AI)</div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12 }}>Enable UpLink</span>
              <input
                type="checkbox"
                checked={settings.uplinkEnabled}
                onChange={(e) => save({ uplinkEnabled: e.target.checked })}
              />
            </label>

            <input
              type="text"
              value={settings.uplinkUrl}
              onChange={(e) => save({ uplinkUrl: e.target.value })}
              placeholder="http://localhost:11434"
              style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 3, fontSize: 11, marginBottom: 4, boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={testUplink}
                disabled={uplinkStatus === 'checking'}
                style={{
                  padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db',
                  background: '#fff', cursor: 'pointer', fontSize: 11,
                }}
              >
                {uplinkStatus === 'checking' ? 'Testing…' : 'Test connection'}
              </button>
              {uplinkStatus === 'ok' && <span style={{ color: '#059669', fontSize: 11 }}>✓ Connected</span>}
              {uplinkStatus === 'error' && <span style={{ color: '#dc2626', fontSize: 11 }}>✗ {uplinkError}</span>}
            </div>
          </div>
        )}

        {/* Intelligence API (business) */}
        {tier === 'business' && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div>
              <span style={{ fontWeight: 600 }}>Intelligence API</span>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Hosted 95% accuracy • metadata only</div>
            </div>
            <input
              type="checkbox"
              checked={settings.intelligenceEnabled}
              onChange={(e) => save({ intelligenceEnabled: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
          </label>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a
            href="https://upinbox.ai/settings"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#2563eb', fontSize: 11, textDecoration: 'none' }}
          >
            Full settings →
          </a>
          {saved && <span style={{ color: '#059669', fontSize: 11 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
