'use client';

/**
 * AiSetupPanel — BYOK API key configuration.
 *
 * PRIVACY CRITICAL:
 * - The API key is stored in sessionStorage ONLY (byokApiKeyAtom)
 * - It is NEVER sent to UpInbox servers
 * - It IS sent directly to the AI provider (that's the user's choice)
 * - This component intentionally has no server-side interaction for the key
 *
 * The panel also configures:
 *   - UpLink (local Ollama) endpoint
 *   - Provider and model selection
 *   - Intelligence API JWT (for self-hosted users)
 */

import { useAtom } from 'jotai';
import { useState } from 'react';
import {
  byokApiKeyAtom,
  byokProviderAtom,
  byokModelAtom,
  useUplinkAtom,
  uplinkEndpointAtom,
  hasAiConfiguredAtom,
} from '@/atoms/mail';
import type { ByokProvider } from '@/atoms/mail';

const PROVIDERS: { id: ByokProvider; name: string; defaultModel: string; models: string[] }[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultModel: 'claude-haiku-4-5-20251001',
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
  },
];

const PROVIDER_LINKS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/app/apikey',
};

export function AiSetupPanel() {
  const [apiKey, setApiKey] = useAtom(byokApiKeyAtom);
  const [provider, setProvider] = useAtom(byokProviderAtom);
  const [model, setModel] = useAtom(byokModelAtom);
  const [useUplink, setUseUplink] = useAtom(useUplinkAtom);
  const [uplinkEndpoint, setUplinkEndpoint] = useAtom(uplinkEndpointAtom);
  const [hasAi] = useAtom(hasAiConfiguredAtom);

  const [showKey, setShowKey] = useState(false);
  const [uplinkStatus, setUplinkStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');

  const selectedProvider = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  const testUplink = async () => {
    try {
      const res = await fetch(`${uplinkEndpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      setUplinkStatus(res.ok ? 'ok' : 'error');
    } catch {
      setUplinkStatus('error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">AI Configuration</h2>
        {hasAi && (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
            ✓ Configured
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        UpInbox uses AI to triage your inbox and draft replies.
        Bring your own API key — it runs directly in your browser.
        We never see it.
      </p>

      {/* Option 1: BYOK */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Cloud AI (BYOK)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your API key. Your bill. Direct to the AI provider.
            </p>
          </div>
          {!useUplink && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Active</span>
          )}
        </div>

        {/* Provider selection */}
        <div>
          <label className="text-sm font-medium mb-2 block">Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => { setProvider(p.id); setModel(p.defaultModel); }}
                className={`
                  py-2 px-3 border rounded-md text-sm transition-colors
                  ${provider === p.id
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'hover:border-muted-foreground/50'
                  }
                `}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">API Key</label>
            <a
              href={PROVIDER_LINKS[provider ?? 'anthropic']}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Get key →
            </a>
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`${selectedProvider.id === 'anthropic' ? 'sk-ant-...' : selectedProvider.id === 'openai' ? 'sk-...' : 'AIza...'}`}
              className="w-full px-3 py-2 pr-16 border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Stored in sessionStorage only — cleared when you close this tab.
          </p>
        </div>

        {/* Model selection */}
        <div>
          <label className="text-sm font-medium mb-1 block">Model</label>
          <select
            value={model ?? selectedProvider.defaultModel}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {selectedProvider.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Option 2: UpLink */}
      <div className={`border rounded-lg p-4 space-y-4 ${useUplink ? 'border-primary/40' : ''}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              UpLink — Local AI
              <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-medium">100% Local</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ollama on your machine. No API key. No cloud. Complete privacy.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={useUplink}
              onChange={(e) => setUseUplink(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-checked:bg-primary rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:w-4 after:h-4 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {useUplink && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Ollama Endpoint</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={uplinkEndpoint}
                  onChange={(e) => setUplinkEndpoint(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="http://localhost:11434"
                />
                <button
                  onClick={testUplink}
                  className="px-3 py-2 border rounded-md text-sm hover:bg-muted transition-colors"
                >
                  Test
                </button>
              </div>
              {uplinkStatus === 'ok' && (
                <p className="text-xs text-green-600 mt-1">✓ UpLink connected</p>
              )}
              {uplinkStatus === 'error' && (
                <p className="text-xs text-destructive mt-1">
                  ✗ Cannot reach UpLink.{' '}
                  <a href="https://uplink.upgpt.ai" target="_blank" rel="noopener noreferrer" className="underline">
                    Install UpLink →
                  </a>
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              UpLink runs phi4-mini by default. Install at{' '}
              <a href="https://uplink.upgpt.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                uplink.upgpt.ai
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Status summary */}
      {!hasAi && (
        <div className="text-sm text-muted-foreground border border-dashed rounded-lg p-4">
          <p className="font-medium text-foreground mb-1">No AI configured</p>
          <p>
            Without AI, UpInbox uses the free{' '}
            <a href="https://www.npmjs.com/package/@upgpt/email-classifier" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              @upgpt/email-classifier
            </a>{' '}
            heuristic (70% accuracy). Add a key above for full AI triage.
          </p>
        </div>
      )}
    </div>
  );
}
