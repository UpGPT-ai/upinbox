/**
 * GET  /api/upinbox/accounts       — list all accounts for the current user
 * POST /api/upinbox/accounts       — connect a new mail account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getCurrentUser } from '@/lib/supabase-server';
import { encryptCredentials } from '@/lib/mail/crypto/credentials';
import { getMailProvider } from '@/lib/mail/providers';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET: list accounts ───────────────────────────────────────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('upinbox.accounts')
    .select('id, email_address, display_name, provider_type, is_primary, sync_enabled, last_synced_at, created_at')
    .eq('user_id', user.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Never return encrypted_credentials to the client
  return NextResponse.json({ accounts: data });
}

// ─── POST: connect a new account ─────────────────────────────────────────────

const ConnectAccountSchema = z.discriminatedUnion('provider_type', [
  z.object({
    provider_type: z.literal('jmap'),
    email_address: z.string().email(),
    display_name: z.string().optional(),
    jmap_session_url: z.string().url(),
    credentials: z.object({
      type: z.literal('jmap'),
      token: z.string().min(1),
    }),
  }),
  z.object({
    provider_type: z.literal('imap'),
    email_address: z.string().email(),
    display_name: z.string().optional(),
    credentials: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('imap'),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        username: z.string().min(1),
        password: z.string().min(1),
        smtp_host: z.string().min(1),
        smtp_port: z.number().int().min(1).max(65535),
        smtp_secure: z.boolean(),
      }),
      z.object({
        type: z.literal('oauth_imap'),
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        username: z.string().min(1),
        access_token: z.string().min(1),
        refresh_token: z.string().optional(),
        token_url: z.string().url().optional(),
        client_id: z.string().optional(),
        client_secret: z.string().optional(),
        smtp_host: z.string().min(1),
        smtp_port: z.number().int().min(1).max(65535),
        smtp_secure: z.boolean(),
      }),
    ]),
  }),
]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ConnectAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Test connectivity before saving
  const testAccount = {
    id: 'test',
    email_address: data.email_address,
    provider_type: data.provider_type,
    encrypted_credentials: '', // will be replaced
    jmap_session_url: 'jmap_session_url' in data ? data.jmap_session_url : undefined,
  };

  try {
    // Encrypt credentials immediately — plaintext never touches the DB
    const encrypted = await encryptCredentials(data.credentials as Parameters<typeof encryptCredentials>[0]);

    // Verify connectivity
    const provider = await getMailProvider({
      ...testAccount,
      encrypted_credentials: encrypted,
    });
    await provider.listMailboxes(); // throws if auth fails
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Could not connect to mail server',
        detail: err instanceof Error ? err.message : 'Connection failed',
      },
      { status: 422 }
    );
  }

  // Save to DB
  const supabase = await createServerSupabaseClient();

  // Check if this is the first account (make it primary)
  const { count } = await supabase
    .from('upinbox.accounts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const isPrimary = (count ?? 0) === 0;

  const encryptedForStorage = await encryptCredentials(data.credentials as Parameters<typeof encryptCredentials>[0]);

  const { data: account, error } = await supabase
    .from('upinbox.accounts')
    .insert({
      user_id: user.id,
      email_address: data.email_address,
      display_name: data.display_name ?? data.email_address,
      provider_type: data.provider_type,
      encrypted_credentials: encryptedForStorage,
      jmap_session_url: 'jmap_session_url' in data ? data.jmap_session_url : null,
      is_primary: isPrimary,
      sync_enabled: true,
    })
    .select('id, email_address, display_name, provider_type, is_primary, sync_enabled, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account }, { status: 201 });
}
