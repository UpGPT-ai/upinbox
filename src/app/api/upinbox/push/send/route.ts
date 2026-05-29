export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface SendPushBody {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function POST(request: NextRequest) {
  // Verify internal cron/service caller
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, title, body, url, tag } = (await request.json()) as SendPushBody;

  if (!userId || !title || !body) {
    return NextResponse.json(
      { error: 'Missing required fields: userId, title, body' },
      { status: 400 }
    );
  }

  // Use service role to read push_subscriptions without RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rows, error: fetchError } = await (supabase as any)
    .schema('upinbox')
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId);

  if (fetchError) {
    console.error('[push/send] fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Attempt to load web-push — handle missing package gracefully
  let webpush: typeof import('web-push') | null = null;
  try {
    webpush = await import('web-push');
  } catch {
    console.warn('[push/send] web-push package not installed; skipping delivery');
    return NextResponse.json({ ok: true, sent: 0, warning: 'web-push not installed' });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:support@upinbox.ai';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[push/send] VAPID env vars not set');
    return NextResponse.json({ error: 'VAPID configuration missing' }, { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const payload = JSON.stringify({
    title,
    body,
    ...(url ? { url } : {}),
    ...(tag ? { tag } : {}),
  });

  let sent = 0;
  const staleSubscriptions: string[] = [];

  await Promise.allSettled(
    rows.map(async (row: { subscription: object }) => {
      try {
        await webpush!.sendNotification(row.subscription as any, payload);
        sent++;
      } catch (err: any) {
        // 410 Gone = subscription is expired/unsubscribed — clean it up
        if (err?.statusCode === 410) {
          staleSubscriptions.push(userId);
        } else {
          console.error('[push/send] delivery error:', err?.message ?? err);
        }
      }
    })
  );

  // Remove stale subscriptions
  if (staleSubscriptions.length > 0) {
    await (supabase as any)
      .schema('upinbox')
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId);
  }

  return NextResponse.json({ ok: true, sent });
}
