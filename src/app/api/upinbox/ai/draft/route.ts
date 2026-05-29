export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { generateDraft } from '@/lib/ai/draft-generator';
import { checkRateLimit, getRateLimitFromRequest } from '@/lib/rate-limit';

interface DraftBody {
  // canonical field names
  subject?: string;
  from?: string;
  body?: string;
  // client-side aliases
  threadSubject?: string;
  latestFrom?: string;
  latestBody?: string;
  tone: string;
  byokKey?: string;
  byokProvider?: string;
  byokModel?: string;
  // draft-generator-panel aliases
  apiKey?: string;
  provider?: string;
  model?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const key = getRateLimitFromRequest(request, 'ai:draft');
  const limit = checkRateLimit(key, { windowMs: 3600000, maxRequests: 30, identifier: 'ai:draft' });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: Math.ceil((limit.retryAfterMs ?? 0) / 1000) },
      { status: 429 }
    );
  }

  let raw: DraftBody;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const subject = raw.subject ?? raw.threadSubject;
  const from = raw.from ?? raw.latestFrom;
  const emailBody = raw.body ?? raw.latestBody;
  const { tone, byokKey: rawByokKey, byokProvider: rawByokProvider, byokModel: rawByokModel, apiKey, provider, model } = raw;
  const byokKey = rawByokKey ?? apiKey;
  const byokProvider = rawByokProvider ?? provider;
  const byokModel = rawByokModel ?? model;

  if (!subject || !from || !emailBody || !tone) {
    return NextResponse.json(
      { error: 'subject, from, body, and tone are required' },
      { status: 400 }
    );
  }

  try {
    const result = await generateDraft({
      threadSubject: subject,
      latestMessageFrom: from,
      latestMessageBody: emailBody,
      tone,
      byokKey,
      byokProvider,
      byokModel,
    });

    return NextResponse.json({
      body: result.body,
      bodyHtml: result.bodyHtml,
      provider: result.provider,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Draft generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
