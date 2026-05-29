import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

// Small word lists for readable alias generation
const ADJECTIVES = [
  'swift', 'brave', 'calm', 'dark', 'eager', 'fair', 'glad', 'high',
  'idle', 'just', 'keen', 'lean', 'mild', 'neat', 'open', 'pale',
  'quiet', 'rare', 'safe', 'tame', 'utter', 'vast', 'warm', 'young',
  'zesty', 'amber', 'crisp', 'dusty', 'early', 'faint', 'grand', 'hazy',
];

const NOUNS = [
  'pine', 'lake', 'bird', 'cave', 'dawn', 'edge', 'fern', 'gate',
  'hill', 'iris', 'jade', 'knoll', 'leaf', 'mist', 'nest', 'oak',
  'path', 'reed', 'sage', 'tide', 'vale', 'wave', 'yarrow', 'zinc',
  'basin', 'cliff', 'dune', 'ember', 'fjord', 'grove', 'haven', 'inlet',
];

function generateAlias(): { id: string; address: string } {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const id = `${adj}-${noun}-${num}`;
  return { id, address: `${id}@mail.upinbox.ai` };
}

type AliasRecord = {
  id: string;
  address: string;
  label?: string;
  active: boolean;
  createdAt: string;
};

type UserAliases = {
  upinboxAliases?: AliasRecord[];
};

// GET ?accountId — list aliases
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meta = (user.user_metadata ?? {}) as UserAliases;
  const aliases = (meta.upinboxAliases ?? []).filter(
    (a) => a.id.startsWith(`acct:${accountId}:`) || !a.id.startsWith('acct:')
  );

  return NextResponse.json({ aliases });
}

// POST {accountId, label?} — generate new alias
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { accountId, label } = body as { accountId?: string; label?: string };

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meta = (user.user_metadata ?? {}) as UserAliases;
  const existing = meta.upinboxAliases ?? [];

  // Retry up to 5 times to avoid collisions
  let generated: { id: string; address: string } | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = generateAlias();
    if (!existing.some((a) => a.address === candidate.address)) {
      generated = candidate;
      break;
    }
  }

  if (!generated) {
    return NextResponse.json({ error: 'Could not generate unique alias' }, { status: 500 });
  }

  const newAlias: AliasRecord = {
    id: generated.id,
    address: generated.address,
    label: label?.trim() || undefined,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const updated = [...existing, newAlias];

  const { error: updateErr } = await supabase.auth.updateUser({
    data: { upinboxAliases: updated },
  });

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    alias: newAlias.address,
    id: newAlias.id,
    label: newAlias.label,
    active: newAlias.active,
  });
}

// DELETE ?id&accountId — revoke alias
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const accountId = req.nextUrl.searchParams.get('accountId');

  if (!id || !accountId) {
    return NextResponse.json({ error: 'id and accountId required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const meta = (user.user_metadata ?? {}) as UserAliases;
  const existing = meta.upinboxAliases ?? [];

  const target = existing.find((a) => a.id === id);
  if (!target) {
    return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
  }

  const updated = existing.map((a) =>
    a.id === id ? { ...a, active: false } : a
  );

  const { error: updateErr } = await supabase.auth.updateUser({
    data: { upinboxAliases: updated },
  });

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id, revoked: true });
}
