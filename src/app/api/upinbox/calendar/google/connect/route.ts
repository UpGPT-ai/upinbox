import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { getGoogleOAuthUrl } from '@/lib/calendar/google-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64url');
    const url = getGoogleOAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google Calendar not configured';
    // Redirect back to calendar with error query param
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mail.upinbox.ai';
    return NextResponse.redirect(`${base}/calendar?error=${encodeURIComponent(msg)}`);
  }
}
