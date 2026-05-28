'use server';

/**
 * GET  /api/upinbox/labels?accountId=…  — list labels for account
 * POST /api/upinbox/labels              — create label
 * DELETE /api/upinbox/labels?id=…       — delete label (non-system only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const SYSTEM_LABELS = [
  { name: 'Work',        color: '#2563eb', is_system: true },
  { name: 'Personal',    color: '#16a34a', is_system: true },
  { name: 'Finance',     color: '#ca8a04', is_system: true },
  { name: 'Travel',      color: '#0891b2', is_system: true },
  { name: 'Social',      color: '#9333ea', is_system: true },
  { name: 'Newsletter',  color: '#dc2626', is_system: true },
  { name: 'Important',   color: '#ea580c', is_system: true },
];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = req.nextUrl.searchParams.get('accountId');
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

    // Verify account ownership
    const { data: acct } = await (supabase as any)
      .schema('upinbox')
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();
    if (!acct) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Seed system labels if missing
    const { data: existing } = await (supabase as any)
      .schema('upinbox')
      .from('labels')
      .select('name')
      .eq('account_id', accountId)
      .eq('is_system', true);

    const existingNames = new Set((existing ?? []).map((r: any) => r.name));
    const missing = SYSTEM_LABELS.filter((l) => !existingNames.has(l.name));
    if (missing.length > 0) {
      await (supabase as any)
        .schema('upinbox')
        .from('labels')
        .insert(missing.map((l) => ({ ...l, account_id: accountId })));
    }

    const { data: labels } = await (supabase as any)
      .schema('upinbox')
      .from('labels')
      .select('*')
      .eq('account_id', accountId)
      .order('is_system', { ascending: false })
      .order('name');

    return NextResponse.json(labels ?? []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, name, color } = await req.json();
    if (!accountId || !name) return NextResponse.json({ error: 'accountId and name required' }, { status: 400 });

    const { data: acct } = await (supabase as any)
      .schema('upinbox')
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();
    if (!acct) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await (supabase as any)
      .schema('upinbox')
      .from('labels')
      .insert({ account_id: accountId, name: name.trim(), color: color ?? '#6366f1', is_system: false })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data: label } = await (supabase as any)
      .schema('upinbox')
      .from('labels')
      .select('id, is_system, account_id')
      .eq('id', id)
      .single();

    if (!label) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (label.is_system) return NextResponse.json({ error: 'Cannot delete system label' }, { status: 400 });

    // Verify ownership via account
    const { data: acct } = await (supabase as any)
      .schema('upinbox')
      .from('accounts')
      .select('id')
      .eq('id', label.account_id)
      .eq('user_id', user.id)
      .single();
    if (!acct) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await (supabase as any)
      .schema('upinbox')
      .from('labels')
      .delete()
      .eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
