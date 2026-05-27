'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Mode = 'sign-in' | 'sign-up' | 'magic-link';

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      if (mode === 'magic-link') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/inbox` },
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Check your email for the magic link!' });
      } else if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/inbox` },
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Account created! Check your email to confirm.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/inbox';
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'An error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
      {/* Mode tabs */}
      <div className="flex rounded-lg bg-muted p-1 gap-1">
        {(['sign-in', 'sign-up', 'magic-link'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setMessage(null); }}
            className={`
              flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors
              ${mode === m
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {m === 'sign-in' ? 'Sign in' : m === 'sign-up' ? 'Sign up' : 'Magic link'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="you@example.com"
          />
        </div>

        {mode !== 'magic-link' && (
          <div>
            <label className="text-sm font-medium mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
        )}

        {message && (
          <div className={`
            text-sm p-3 rounded-md
            ${message.type === 'error'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-green-50 text-green-800 border border-green-200'
            }
          `}>
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isLoading
            ? 'Loading...'
            : mode === 'sign-in'
            ? 'Sign in'
            : mode === 'sign-up'
            ? 'Create account'
            : 'Send magic link'
          }
        </button>
      </form>
    </div>
  );
}
