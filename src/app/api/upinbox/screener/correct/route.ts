export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CorrectBody {
  accountId: string;
  messageId: string;
  correctCategory: string;
  originalCategory: string;
  senderEmail: string;
}

export async function POST(req: NextRequest) {
  let body: CorrectBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { accountId, messageId, correctCategory, originalCategory, senderEmail } = body;

  if (!accountId || !messageId || !correctCategory || !originalCategory || !senderEmail) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .schema('upinbox')
    .from('heuristic_overrides')
    .upsert(
      {
        account_id: accountId,
        sender_email: senderEmail,
        pattern_type: 'sender',
        category: correctCategory,
        source: 'manual',
        created_at: new Date().toISOString(),
      },
      {
        onConflict: 'account_id,sender_email',
      }
    );

  if (error) {
    console.error('[screener/correct] upsert error:', error);
    return NextResponse.json({ error: 'Failed to record correction' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
