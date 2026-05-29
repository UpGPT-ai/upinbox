import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { exchangeCodeForTokens } from '@/lib/calendar/google-sync';
import { encryptString } from '@/lib/mail/crypto/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mail.upinbox.ai';
  const params = req.nextUrl.searchParams;
  const code = params.get('code');
  const error = params.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${base}/calendar?error=${encodeURIComponent(error ?? 'no_code')}`);
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${base}/auth/login?next=/calendar`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    const [encAccess, encRefresh] = await Promise.all([
      encryptString(tokens.accessToken),
      encryptString(tokens.refreshToken),
    ]);

    const supabase = await createServerSupabaseClient();
    await (supabase as any)
      .schema('upinbox')
      .from('google_calendar_tokens')
      .upsert(
        {
          user_id: user.id,
          alias: 'primary',
          encrypted_access_token: encAccess,
          encrypted_refresh_token: encRefresh,
          token_expiry: new Date(tokens.expiresAt).toISOString(),
          calendar_ids: ['primary'],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,alias' },
      );

    return NextResponse.redirect(`${base}/calendar?connected=google`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    return NextResponse.redirect(`${base}/calendar?error=${encodeURIComponent(msg)}`);
  }
}
