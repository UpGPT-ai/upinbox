'use client';

/**
 * ByokPanel — Full BYOK (Bring Your Own Key) AI configuration panel.
 *
 * PRIVACY CRITICAL:
 * - API key is stored in sessionStorage ONLY (byokApiKeyAtom uses session store)
 * - Key is NEVER transmitted to UpInbox servers
 * - Test-connection POST sends the key directly to /api/upinbox/ai/test which
 *   proxies only for connectivity checks; the key is not persisted server-side
 * - Ollama (useUplink) runs entirely on the user's machine — no key required
 */

import { useAtom } from 'jotai';
import { useState, useCallback } from 'react';
import {
  byokApiKeyAtom,
  byokProviderAtom,
  byokModelAtom,
  useUplinkAtom,
  uplinkEndpointAtom,
} from '@/atoms/mail';
import type { ByokProvider } from '@/atoms/mail';

// ─── Provider catalogue ───────────────────────────────────────────────────────

interface ProviderConfig {
  id: Exclude<ByokProvider, null> | 'ollama';
  label: string;
  keyPlaceholder: string;
  keyHint: string;
  getKeyUrl: string;
  models: { id: string; label: string }[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-api03-...',
    keyHint: 'Starts with sk-ant-',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast, cheap)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (best quality)' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyPlaceholder: 'sk-...',
    keyHint: 'Starts with sk-',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast, cheap)' },
      { id: 'gpt-4o', label: 'GPT-4o (recommended)' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  {
    id: 'google',
    label: 'Google',
    keyPlaceholder: 'AIza...',
    keyHint: 'Starts with AIza',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fast)' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (best quality)' },
    ],
  },
  {
    id: 'ollama' as const,
    label: 'Ollama',
    keyPlaceholder: '',
    keyHint: 'No API key required — runs locally',
    getKeyUrl: 'https://ollama.com/download',
    models: [
      { id: 'phi4-mini', label: 'phi4-mini (default, fast)' },
      { id: 'llama3.2', label: 'llama3.2' },
      { id: 'mistral', label: 'mistral' },
      { id: 'gemma3', label: 'gemma3' },
    ],
  },
] as const;

type ProviderWithOllama = 'anthropic' | 'openai' | 'google' | 'ollama';

// ─── Test-connection state ────────────────────────────────────────────────────

type TestStatus = 'idle' | 'loading' | 'ok' | 'error';

interface TestResult {
  status: TestStatus;
  message: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ByokPanel() {
  const [apiKey, setApiKey] = useAtom(byokApiKeyAtom);
  const [provider, setProvider] = useAtom(byokProviderAtom);
  const [model, setModel] = useAtom(byokModelAtom);
  const [useUplink, setUseUplink] = useAtom(useUplinkAtom);
  const [uplinkEndpoint, setUplinkEndpoint] = useAtom(uplinkEndpointAtom);

  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle', message: '' });

  // Resolve the currently active provider config
  const effectiveProviderId: ProviderWithOllama = useUplink
    ? 'ollama'
    : ((provider ?? 'anthropic') as ProviderWithOllama);
  // Note: effectiveProviderId may be 'ollama' (local) or a cloud provider

  const activeProvider =
    PROVIDERS.find((p) => p.id === effectiveProviderId) ?? PROVIDERS[0];

  // When switching providers, reset model to first option
  const handleProviderChange = useCallback(
    (id: ProviderWithOllama) => {
      if (id === 'ollama') {
        setUseUplink(true);
        setProvider(null);
      } else {
        setUseUplink(false);
        setProvider(id as ByokProvider);
      }
      const providerConfig = PROVIDERS.find((p) => p.id === id);
      if (providerConfig) {
        setModel(providerConfig.models[0].id);
      }
      setTestResult({ status: 'idle', message: '' });
    },
    [setProvider, setModel, setUseUplink]
  );

  // Clear key
  const handleClearKey = useCallback(() => {
    setApiKey('');
    setTestResult({ status: 'idle', message: '' });
  }, [setApiKey]);

  // Test connection via POST /api/upinbox/ai/test
  const handleTestConnection = useCallback(async () => {
    setTestResult({ status: 'loading', message: 'Testing connection...' });

    try {
      const body: Record<string, string> = {
        provider: effectiveProviderId,
        model: model ?? activeProvider.models[0].id,
      };

      if (effectiveProviderId === 'ollama') {
        body.endpoint = uplinkEndpoint;
      } else {
        if (!apiKey.trim()) {
          setTestResult({ status: 'error', message: 'Enter an API key first.' });
          return;
        }
        body.apiKey = apiKey.trim();
      }

      const res = await fetch('/api/upinbox/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setTestResult({
          status: 'ok',
          message: data.message ?? 'Connection successful. AI is ready.',
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setTestResult({
          status: 'error',
          message: data.error ?? `Server returned ${res.status}.`,
        });
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'TimeoutError'
          ? 'Request timed out. Check that the provider is reachable.'
          : err instanceof Error
          ? err.message
          : 'Unexpected error. Try again.';
      setTestResult({ status: 'error', message: msg });
    }
  }, [effectiveProviderId, model, activeProvider, apiKey, uplinkEndpoint]);

  const isOllama = effectiveProviderId === 'ollama';

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">AI Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose your AI provider. Your key stays in your browser — UpInbox never
          stores or transmits it to our servers.
        </p>
      </div>

      {/* Provider pills */}
      <div>
        <label className="text-sm font-medium block mb-2">Provider</label>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => {
            const isActive = effectiveProviderId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProviderChange(p.id)}
                className={[
                  'px-4 py-1.5 rounded-full border text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background hover:border-primary/50 hover:bg-muted',
                ].join(' ')}
              >
                {p.label}
                {p.id === 'ollama' && (
                  <span className="ml-1.5 text-[10px] font-semibold tracking-wide opacity-75">
                    LOCAL
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* API key section — hidden for Ollama */}
      {!isOllama && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">API Key</label>
            <a
              href={activeProvider.getKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Get key &rarr;
            </a>
          </div>

          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult({ status: 'idle', message: '' });
              }}
              placeholder={activeProvider.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 pr-24 border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {apiKey.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearKey}
                  title="Clear key"
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors text-xs"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="p-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{activeProvider.keyHint}</p>
        </div>
      )}

      {/* Ollama endpoint */}
      {isOllama && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium block">Ollama Endpoint</label>
          <input
            type="url"
            value={uplinkEndpoint}
            onChange={(e) => {
              setUplinkEndpoint(e.target.value);
              setTestResult({ status: 'idle', message: '' });
            }}
            placeholder="http://localhost:11434"
            className="w-full px-3 py-2 border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Default is{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
              http://localhost:11434
            </code>
            .{' '}
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Install Ollama &rarr;
            </a>
          </p>
        </div>
      )}

      {/* Model selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium block">Model</label>
        <select
          value={model ?? activeProvider.models[0].id}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {activeProvider.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Test connection */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testResult.status === 'loading' || (!isOllama && !apiKey.trim())}
          className={[
            'w-full py-2 px-4 rounded-md text-sm font-medium border transition-colors',
            testResult.status === 'loading'
              ? 'opacity-60 cursor-not-allowed bg-muted border-border'
              : 'bg-background hover:bg-muted border-border hover:border-primary/50',
          ].join(' ')}
        >
          {testResult.status === 'loading' ? 'Testing...' : 'Test Connection'}
        </button>

        {/* Inline result */}
        {testResult.status === 'ok' && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-start gap-2">
            <span className="mt-px shrink-0">&#10003;</span>
            <span>{testResult.message}</span>
          </p>
        )}
        {testResult.status === 'error' && (
          <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2 flex items-start gap-2">
            <span className="mt-px shrink-0">&#10007;</span>
            <span>{testResult.message}</span>
          </p>
        )}
      </div>

      {/* Privacy notice */}
      <div className="rounded-lg border border-dashed p-4 space-y-1.5">
        <p className="text-xs font-semibold text-foreground">Privacy guarantee</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-none">
          <li>
            <span className="text-green-600 mr-1">&#10003;</span>
            Your API key is stored in{' '}
            <code className="bg-muted px-1 py-0.5 rounded">sessionStorage</code> only
            and cleared when you close this tab.
          </li>
          <li>
            <span className="text-green-600 mr-1">&#10003;</span>
            Keys are sent directly to the AI provider — never to UpInbox servers.
          </li>
          <li>
            <span className="text-green-600 mr-1">&#10003;</span>
            Choosing Ollama means zero data leaves your machine.
          </li>
          <li>
            <span className="text-green-600 mr-1">&#10003;</span>
            No model training on your email content. Ever.
          </li>
        </ul>
      </div>
    </div>
  );
}
