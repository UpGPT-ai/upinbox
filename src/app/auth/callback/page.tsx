'use client';

/**
 * Auth Callback — explicit handler for both PKCE and implicit flow.
 *
 * PKCE:     ?code=xxx          → exchangeCodeForSession(code)
 * Implicit: #access_token=xxx  → setSession({ access_token, refresh_token })
 *
 * We read the URL explicitly rather than relying on auto-detection,
 * which is unreliable across Supabase SSR versions.
 */

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const handleAuth = async () => {
      // --- PKCE: ?code=xxx in query string ---
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { router.replace('/inbox'); return; }
        setStatus('error');
        return;
      }

      // --- Implicit: #access_token=xxx in hash ---
      const hash = window.location.hash.slice(1); // strip leading #
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') ?? '';

      if (accessToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) { router.replace('/inbox'); return; }
        setStatus('error');
        return;
      }

      // --- Already signed in? ---
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { router.replace('/inbox'); return; }

      setStatus('error');
    };

    handleAuth();
  }, [router]);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-6">
          <div className="text-2xl">⚠️</div>
          <h1 className="text-lg font-semibold">Sign-in link expired or invalid</h1>
          <p className="text-sm text-muted-foreground">
            Magic links expire after 1 hour. Request a new one below.
          </p>
          <a
            href="/login"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
