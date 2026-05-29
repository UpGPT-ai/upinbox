export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subscription } = body as { subscription: object };

    if (!subscription || typeof subscription !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid subscription object' },
        { status: 400 }
      );
    }

    const { error: upsertError } = await (supabase as any)
      .schema('upinbox')
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          subscription,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('[push/subscribe] upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
