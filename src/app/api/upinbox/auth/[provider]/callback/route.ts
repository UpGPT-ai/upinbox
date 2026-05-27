/**
 * GET /api/upinbox/auth/[provider]/callback
 *
 * OAuth callback handler. Exchanges authorization code for tokens,
 * encrypts tokens, saves account.
 *
 * After saving, redirects to the `redirect_after` URL from the state record.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { encryptCredentials } from '@/lib/mail/crypto/credentials';
import { getMailProvider } from '@/lib/mail/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GMAIL_IMAP_HOST = 'imap.gmail.com';
const GMAIL_IMAP_PORT = 993;
const GMAIL_SMTP_HOST = 'smtp.gmail.com';
const GMAIL_SMTP_PORT = 587;

const OUTLOOK_IMAP_HOST = 'outlook.office365.com';
const OUTLOOK_IMAP_PORT = 993;
const OUTLOOK_SMTP_HOST = 'smtp.office365.com';
const OUTLOOK_SMTP_PORT = 587;

export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/inbox?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/inbox?error=missing_params', request.url));
  }

  // Verify CSRF state
  const supabase = await createServerSupabaseClient();
  const { data: stateRecord, error: stateError } = await supabase
    .from('upinbox.oauth_states')
    .select('*')
    .eq('state', state)
    .eq('provider', provider)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (stateError || !stateRecord) {
    return NextResponse.redirect(new URL('/inbox?error=invalid_state', request.url));
  }

  // Delete state (single-use)
  await supabase.from('upinbox.oauth_states').delete().eq('state', state);

  const user = await getCurrentUser();
  if (!user || user.id !== stateRecord.user_id) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const callbackUrl = `${appUrl}/api/upinbox/auth/${provider}/callback`;

  try {
    if (provider === 'gmail-oauth') {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) throw new Error('Failed to exchange Google OAuth code');
      const tokens = await tokenRes.json();

      // Get user email
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userRes.json();
      const email = userInfo.email as string;

      // Build OAuth IMAP credentials
      const credentials = {
        type: 'oauth_imap' as const,
        host: GMAIL_IMAP_HOST,
        port: GMAIL_IMAP_PORT,
        secure: true,
        username: email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_url: 'https://oauth2.googleapis.com/token',
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        smtp_host: GMAIL_SMTP_HOST,
        smtp_port: GMAIL_SMTP_PORT,
        smtp_secure: false,
      };

      const encrypted = await encryptCredentials(credentials);

      // Verify connectivity
      const testAccount = {
        id: 'test',
        email_address: email,
        provider_type: 'imap' as const,
        encrypted_credentials: encrypted,
      };
      const provider_instance = await getMailProvider(testAccount);
      await provider_instance.listMailboxes();

      // Save account
      const serviceClient = createServiceSupabaseClient();
      const { count } = await serviceClient
        .from('upinbox.accounts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      await serviceClient.from('upinbox.accounts').insert({
        user_id: user.id,
        email_address: email,
        display_name: userInfo.name ?? email,
        provider_type: 'imap',
        encrypted_credentials: encrypted,
        is_primary: (count ?? 0) === 0,
        sync_enabled: true,
      });
    }

    if (provider === 'outlook-oauth') {
      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) throw new Error('Failed to exchange Microsoft OAuth code');
      const tokens = await tokenRes.json();

      // Get user email
      const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userRes.json();
      const email = userInfo.mail ?? userInfo.userPrincipalName;

      const credentials = {
        type: 'oauth_imap' as const,
        host: OUTLOOK_IMAP_HOST,
        port: OUTLOOK_IMAP_PORT,
        secure: true,
        username: email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        smtp_host: OUTLOOK_SMTP_HOST,
        smtp_port: OUTLOOK_SMTP_PORT,
        smtp_secure: false,
      };

      const encrypted = await encryptCredentials(credentials);
      const serviceClient = createServiceSupabaseClient();
      const { count } = await serviceClient
        .from('upinbox.accounts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      await serviceClient.from('upinbox.accounts').insert({
        user_id: user.id,
        email_address: email,
        display_name: userInfo.displayName ?? email,
        provider_type: 'imap',
        encrypted_credentials: encrypted,
        is_primary: (count ?? 0) === 0,
        sync_enabled: true,
      });
    }

    return NextResponse.redirect(
      new URL(stateRecord.redirect_after ?? '/inbox', request.url)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth failed';
    return NextResponse.redirect(
      new URL(`/inbox?error=${encodeURIComponent(msg)}`, request.url)
    );
  }
}
