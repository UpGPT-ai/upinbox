/**
 * GET /api/upinbox/auth/[provider]
 *
 * OAuth redirect endpoint for Gmail and Outlook.
 * Initiates the OAuth flow — user is redirected to the provider's consent screen.
 *
 * After consent, the provider redirects to:
 *   /api/upinbox/auth/[provider]/callback?code=...&state=...
 *
 * Supported providers:
 *   gmail-oauth    → Google OAuth (gmail.readonly + gmail.send + gmail.modify)
 *   outlook-oauth  → Microsoft OAuth (IMAP.AccessAsUser.All + SMTP.Send)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const MICROSOFT_SCOPES = [
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send',
  'offline_access',
  'email',
  'openid',
  'profile',
].join(' ');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { provider } = await params;
  const redirectAfter = request.nextUrl.searchParams.get('redirect') ?? '/inbox';

  // Generate CSRF state token
  const state = crypto.randomUUID();

  // Store state in DB so we can verify on callback
  const supabase = await createServerSupabaseClient();
  await (supabase as any).from('upinbox.oauth_states').insert({
    user_id: user.id,
    state,
    provider,
    redirect_after: redirectAfter,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const callbackUrl = `${appUrl}/api/upinbox/auth/${provider}/callback`;

  if (provider === 'gmail-oauth') {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 });
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', googleClientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent'); // always request refresh token

    return NextResponse.redirect(authUrl.toString());
  }

  if (provider === 'outlook-oauth') {
    const msClientId = process.env.MICROSOFT_CLIENT_ID;
    if (!msClientId) {
      return NextResponse.json({ error: 'MICROSOFT_CLIENT_ID not configured' }, { status: 500 });
    }

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', msClientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', MICROSOFT_SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_mode', 'query');

    return NextResponse.redirect(authUrl.toString());
  }

  return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
}
