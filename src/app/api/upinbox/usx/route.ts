/**
 * USX API routes — server-side endpoints for the USX protocol.
 *
 * GET  /api/upinbox/usx/public-key?email={email}
 *   Returns the user's public key for external USX senders.
 *   No auth required (public key is public).
 *
 * POST /api/upinbox/usx/receive
 *   Receives a USX ciphertext message from an external sender.
 *   Stores in upinbox.usx_inbox for pickup on next sync.
 *
 * POST /api/upinbox/usx/discover
 *   Discovers the USX record for a domain (cached).
 *   Used by the compose window to show USX badge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { discoverUsxRecord } from '@/lib/encryption/usx';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Route dispatch ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');
  if (action === 'public-key') return handlePublicKey(request);
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');
  if (action === 'receive') return handleReceive(request);
  if (action === 'discover') return handleDiscover(request);
  if (action === 'register-key') return handleRegisterKey(request);
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ─── GET ?action=public-key&email={email} ─────────────────────────────────────

async function handlePublicKey(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data } = await (supabase as ReturnType<typeof createServiceSupabaseClient>)
    .from('upinbox.user_keys')
    .select('public_key_armored, fingerprint')
    .eq('email_address', email.toLowerCase())
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    return NextResponse.json({ error: 'User not found or no USX key' }, { status: 404 });
  }

  return NextResponse.json(
    {
      email,
      publicKey: data.public_key_armored,
      fingerprint: data.fingerprint,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600', // keys are stable
        'X-USX-Version': '1',
      },
    }
  );
}

// ─── POST ?action=receive ─────────────────────────────────────────────────────

const ReceiveSchema = z.object({
  from: z.string().email(),
  to: z.string().email(),
  ciphertext: z.string().min(1).max(10 * 1024 * 1024), // 10MB max
  nonce: z.string().min(1).max(64),
});

async function handleReceive(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = ReceiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { from, to, ciphertext, nonce } = parsed.data;

  const supabase = createServiceSupabaseClient();

  // Verify recipient exists and has USX enabled
  const { data: recipient } = await (supabase as ReturnType<typeof createServiceSupabaseClient>)
    .from('upinbox.user_keys')
    .select('user_id')
    .eq('email_address', to.toLowerCase())
    .eq('revoked', false)
    .single();

  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found or USX not enabled' }, { status: 404 });
  }

  // Idempotency check — reject duplicate nonces
  const { data: existing } = await (supabase as ReturnType<typeof createServiceSupabaseClient>)
    .from('upinbox.usx_inbox')
    .select('id')
    .eq('nonce', nonce)
    .single();

  if (existing) {
    return NextResponse.json({ messageId: existing.id, duplicate: true });
  }

  // Store ciphertext — server never decrypts this
  const { data: saved, error } = await (supabase as ReturnType<typeof createServiceSupabaseClient>)
    .from('upinbox.usx_inbox')
    .insert({
      recipient_user_id: recipient.user_id,
      from_email: from,
      to_email: to,
      ciphertext,              // server stores but cannot read — encrypted for recipient
      nonce,
      received_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
  }

  return NextResponse.json({ messageId: saved.id }, { status: 201 });
}

// ─── POST ?action=discover ────────────────────────────────────────────────────

const DiscoverSchema = z.object({
  domain: z.string().min(1),
});

async function handleDiscover(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = DiscoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 });
  }

  const { domain } = parsed.data;

  // Check local cache first
  const supabase = await createServerSupabaseClient();
  const { data: cached } = await supabase
    .from('upinbox.usx_cache')
    .select('*')
    .eq('domain', domain)
    .gt('fetched_at', new Date(Date.now() - 3600 * 1000).toISOString()) // 1h cache
    .single();

  if (cached) {
    return NextResponse.json({ record: cached, cached: true });
  }

  // DNS lookup
  const record = await discoverUsxRecord(domain);

  if (record) {
    // Cache the result
    await supabase.from('upinbox.usx_cache').upsert(
      {
        domain,
        endpoint: record.endpoint,
        fingerprint: record.fingerprint,
        ttl: 3600,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'domain' }
    );
  }

  return NextResponse.json({ record, cached: false });
}

// ─── POST ?action=register-key ────────────────────────────────────────────────

const RegisterKeySchema = z.object({
  emailAddress: z.string().email(),
  publicKeyArmored: z.string().min(1),
  encryptedPrivateKeyArmored: z.string().min(1), // passphrase-locked
  fingerprint: z.string().min(1),
});

async function handleRegisterKey(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = RegisterKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  const { emailAddress, publicKeyArmored, encryptedPrivateKeyArmored, fingerprint } = parsed.data;

  const supabase = await createServerSupabaseClient();

  // Revoke old keys for this email
  await supabase
    .from('upinbox.user_keys')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('email_address', emailAddress.toLowerCase());

  // Insert new key
  const { data, error } = await supabase
    .from('upinbox.user_keys')
    .insert({
      user_id: user.id,
      email_address: emailAddress.toLowerCase(),
      public_key_armored: publicKeyArmored,
      encrypted_private_key_armored: encryptedPrivateKeyArmored, // server stores but cannot unlock
      fingerprint,
      revoked: false,
    })
    .select('id, fingerprint, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ key: data }, { status: 201 });
}
