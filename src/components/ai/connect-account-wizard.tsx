'use client';

/**
 * ConnectAccountWizard — multi-step wizard for connecting a mail account.
 *
 * Capability gate: fetches /api/upinbox/billing on mount. If the user's UpGPT
 * subscription does NOT include the 'email' capability, an upgrade card is
 * shown instead of the wizard.
 *
 * Step 1: Choose provider (Gmail OAuth, Outlook OAuth, JMAP, Manual IMAP)
 * Step 2: Enter credentials / complete OAuth
 * Step 3: Test connection
 * Step 4: Success + AI setup prompt
 *
 * Auto-detection for known IMAP providers (gmail, outlook, yahoo, etc.)
 */

import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { showConnectWizardAtom } from '@/atoms/mail';
import { useQueryClient } from '@tanstack/react-query';

type ProviderType = 'gmail-oauth' | 'outlook-oauth' | 'imap' | 'jmap' | 'upinbox';

interface Step {
  id: number;
  label: string;
}

const STEPS: Step[] = [
  { id: 1, label: 'Choose provider' },
  { id: 2, label: 'Credentials' },
  { id: 3, label: 'Connecting' },
  { id: 4, label: 'Done' },
];

// Auto-detection map for known providers
const IMAP_PRESETS: Record<string, { host: string; port: number; smtp_host: string; smtp_port: number }> = {
  'gmail.com': { host: 'imap.gmail.com', port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587 },
  'googlemail.com': { host: 'imap.gmail.com', port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587 },
  'outlook.com': { host: 'outlook.office365.com', port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
  'hotmail.com': { host: 'outlook.office365.com', port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587 },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 465 },
  'fastmail.com': { host: 'imap.fastmail.com', port: 993, smtp_host: 'smtp.fastmail.com', smtp_port: 587 },
  'icloud.com': { host: 'imap.mail.me.com', port: 993, smtp_host: 'smtp.mail.me.com', smtp_port: 587 },
  'protonmail.com': { host: '127.0.0.1', port: 1143, smtp_host: '127.0.0.1', smtp_port: 1025 },
  'upgpt.ai': { host: '127.0.0.1', port: 993, smtp_host: '127.0.0.1', smtp_port: 587 },
};

const PROVIDER_OPTIONS: { id: ProviderType; label: string; description: string; badge?: string }[] = [
  { id: 'gmail-oauth', label: 'Gmail', description: 'Sign in with Google. Recommended for Gmail accounts.', badge: 'OAuth' },
  { id: 'outlook-oauth', label: 'Outlook / Microsoft 365', description: 'Sign in with Microsoft. Works with @outlook, @hotmail, @live, and work accounts.', badge: 'OAuth' },
  { id: 'imap', label: 'IMAP / SMTP', description: 'Fastmail, Yahoo, iCloud, Proton Bridge, or any IMAP server.' },
  { id: 'jmap', label: 'JMAP', description: 'Fastmail native JMAP, Stalwart, or any JMAP server.', badge: 'Fast' },
];

const UPGRADE_URL = 'https://upgpt.ai/account/subscribe?product=upinbox';
const SELF_HOSTING_URL = 'https://github.com/upgpt/upinbox/blob/main/SELF-HOSTING.md';

const INCLUDED_FEATURES = [
  'Smart Screener with AI confidence scoring',
  'BYOK AI drafts (your keys, your inference)',
  'MCP server (use email from Claude)',
  'Tracker stripper with per-email count',
  'Snooze, Send Later, Follow-ups',
  'Native UpLink mobile (free download)',
];

export function ConnectAccountWizard() {
  const [, setShowWizard] = useAtom(showConnectWizardAtom);
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [providerType, setProviderType] = useState<ProviderType | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [jmapUrl, setJmapUrl] = useState('');
  const [jmapToken, setJmapToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);

  // Capability gating
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [hasEmailCapability, setHasEmailCapability] = useState(false);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/upinbox/billing', { credentials: 'include' });
        if (!res.ok) throw new Error(`Billing check failed (${res.status})`);
        const data = await res.json();
        const capabilities: string[] =
          (Array.isArray(data?.capabilities) && data.capabilities) ||
          (Array.isArray(data?.entitlements?.capabilities) && data.entitlements.capabilities) ||
          [];
        if (!cancelled) {
          setHasEmailCapability(capabilities.includes('email'));
          setCapabilityLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setCapabilityError(err instanceof Error ? err.message : 'Could not verify subscription');
          setHasEmailCapability(false);
          setCapabilityLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-detect IMAP settings from email domain
  const handleEmailChange = (e: string) => {
    setEmail(e);
    const domain = e.split('@')[1]?.toLowerCase();
    if (domain && IMAP_PRESETS[domain]) {
      const preset = IMAP_PRESETS[domain];
      setImapHost(preset.host);
      setImapPort(preset.port);
      setSmtpHost(preset.smtp_host);
      setSmtpPort(preset.smtp_port);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    setStep(3);

    try {
      let body: unknown;

      if (providerType === 'imap') {
        body = {
          provider_type: 'imap',
          email_address: email,
          credentials: {
            type: 'imap',
            imapHost,
            imapPort,
            imapTls: imapPort === 993,
            username: email,
            password,
            smtpHost,
            smtpPort,
            smtpTls: smtpPort === 465,
          },
        };
      } else if (providerType === 'jmap') {
        body = {
          provider_type: 'jmap',
          email_address: email,
          jmap_session_url: jmapUrl,
          credentials: { type: 'jmap', token: jmapToken },
        };
      } else if (providerType === 'upinbox') {
        // @upinbox.ai accounts use our Stalwart JMAP server
        body = {
          provider_type: 'jmap',
          email_address: email,
          jmap_session_url: 'https://mail.upinbox.ai/jmap/session/',
          credentials: { type: 'jmap', token: jmapToken },
        };
      } else {
        // OAuth flows — redirect to OAuth page
        window.location.href = `/api/upinbox/auth/${providerType}?redirect=/inbox`;
        return;
      }

      const res = await fetch('/api/upinbox/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        const msg = data.error ?? 'Connection failed';
        const detail = data.detail ? `: ${data.detail}` : '';
        throw new Error(msg + detail);
      }

      const data = await res.json();
      setConnectedAccount(data.account.email_address);

      // Invalidate accounts query so sidebar refreshes
      queryClient.invalidateQueries({ queryKey: ['upinbox', 'accounts'] });

      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setStep(2); // Go back to credentials
    } finally {
      setIsConnecting(false);
    }
  };

  const close = () => setShowWizard(false);

  // --- Capability gate states ----------------------------------------------

  if (capabilityLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background border rounded-xl shadow-lg w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold">Connect email account</h2>
            <button onClick={close} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              ✕
            </button>
          </div>
          <div className="flex flex-col items-center py-12 gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Checking your UpGPT subscription…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasEmailCapability) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background border rounded-xl shadow-lg w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold">Connect email account</h2>
            <button onClick={close} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              ✕
            </button>
          </div>

          {/* Upgrade card */}
          <div className="px-6 py-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="text-4xl">📬</div>
              <h3 className="text-xl font-semibold">Unlock UpInbox</h3>
              <p className="text-sm text-muted-foreground">
                UpInbox email is part of your UpGPT subscription. Add the email capability at UpGPT.ai to
                connect your inbox.
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-accent/30 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What's included</p>
              <ul className="space-y-1.5">
                {INCLUDED_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {capabilityError && (
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Note: {capabilityError}
              </p>
            )}

            <a
              href={UPGRADE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full block text-center py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Subscribe at UpGPT.ai
            </a>

            <p className="text-xs text-center text-muted-foreground">
              Self-hosting UpInbox? It's free under MIT →{' '}
              <a
                href={SELF_HOSTING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                SELF-HOSTING.md on GitHub
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Wizard (capability present) -----------------------------------------

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-xl shadow-lg w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-semibold">Connect email account</h2>
            <p className="text-xs text-muted-foreground">Step {step} of {STEPS.length}</p>
          </div>
          <button onClick={close} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex gap-1">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s.id <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {/* Step 1: Choose provider */}
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="font-medium">Choose your email provider</h3>
              {PROVIDER_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProviderType(p.id); setStep(2); }}
                  className="w-full flex items-center gap-3 p-3 border rounded-lg hover:border-primary/50 hover:bg-accent/50 transition-colors text-left"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{p.label}</span>
                      {p.badge && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  </div>
                  <span className="text-muted-foreground">›</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Credentials */}
          {step === 2 && (
            <div className="space-y-4">
              <button
                onClick={() => setStep(1)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                ‹ Back
              </button>

              {(providerType === 'gmail-oauth' || providerType === 'outlook-oauth') && (
                <div className="space-y-3">
                  <p className="text-sm">
                    You'll be redirected to {providerType === 'gmail-oauth' ? 'Google' : 'Microsoft'} to authorize access.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    UpInbox only requests access to read and send email. We never store your OAuth tokens in plaintext.
                  </p>
                  <button
                    onClick={handleConnect}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Continue to {providerType === 'gmail-oauth' ? 'Google' : 'Microsoft'}
                  </button>
                </div>
              )}

              {providerType === 'imap' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Password or App Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="App password recommended for Gmail"
                    />
                  </div>

                  {/* IMAP server fields — pre-filled from auto-detection */}
                  <details>
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                      IMAP/SMTP server settings {imapHost ? `(${imapHost})` : ''}
                    </summary>
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-xs font-medium mb-1 block">IMAP host</label>
                          <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className="w-full px-2 py-1.5 border rounded text-xs bg-background" />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Port</label>
                          <input type="number" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value))} className="w-full px-2 py-1.5 border rounded text-xs bg-background" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-xs font-medium mb-1 block">SMTP host</label>
                          <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="w-full px-2 py-1.5 border rounded text-xs bg-background" />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Port</label>
                          <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="w-full px-2 py-1.5 border rounded text-xs bg-background" />
                        </div>
                      </div>
                    </div>
                  </details>

                  {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}

                  <button
                    onClick={handleConnect}
                    disabled={!email || !password || !imapHost}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Connect
                  </button>
                </div>
              )}

              {providerType === 'jmap' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Email address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="you@fastmail.com" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">JMAP Session URL</label>
                    <input type="url" value={jmapUrl} onChange={(e) => setJmapUrl(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="https://api.fastmail.com/jmap/session" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Bearer Token</label>
                    <input type="password" value={jmapToken} onChange={(e) => setJmapToken(e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-ring" placeholder="fmu1-xxxxxx..." />
                  </div>
                  {error && <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>}
                  <button onClick={handleConnect} disabled={!email || !jmapUrl || !jmapToken} className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">Connect</button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Connecting */}
          {step === 3 && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Testing connection…</p>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="text-center py-6 space-y-4">
              <div className="text-4xl">✅</div>
              <div>
                <h3 className="font-semibold">Connected!</h3>
                <p className="text-sm text-muted-foreground mt-1">{connectedAccount}</p>
              </div>
              <button
                onClick={close}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Open inbox
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
