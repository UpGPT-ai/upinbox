/**
 * Development seed script
 *
 * Creates:
 * - 1 demo user (dev@upinbox.ai / password: devsecret123)
 * - 1 IMAP account (FastMail demo)
 * - Sample screener rules (the default set)
 * - 1 MCP token (dev-mcp-token-for-testing)
 * - A free subscription record
 *
 * Usage:
 *   npx tsx scripts/seed-dev.ts
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-dev.ts
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DEMO_USER_EMAIL = 'dev@upinbox.ai';
const DEMO_USER_PASSWORD = 'devsecret123';

// ─── Default screener rules (mirrors production defaults) ─────────────────────

function buildDefaultRules(userId: string) {
  return [
    { user_id: userId, name: 'Newsletters → Feed', priority: 100, trigger_type: 'category', trigger_value: 'NEWSLETTER', action: 'feed-news', is_active: true },
    { user_id: userId, name: 'Promotions → Feed', priority: 90, trigger_type: 'category', trigger_value: 'PROMOTIONAL', action: 'feed-promos', is_active: true },
    { user_id: userId, name: 'Receipts → Feed', priority: 80, trigger_type: 'category', trigger_value: 'RECEIPT', action: 'feed-receipts', is_active: true },
    { user_id: userId, name: 'Social → Feed', priority: 70, trigger_type: 'category', trigger_value: 'SOCIAL', action: 'feed-social', is_active: true },
    { user_id: userId, name: 'Spam → Trash', priority: 60, trigger_type: 'category', trigger_value: 'SPAM', action: 'trash', is_active: true },
    { user_id: userId, name: 'Low confidence → Inbox', priority: 50, trigger_type: 'confidence-below', trigger_value: '0.5', action: 'inbox', is_active: true },
    { user_id: userId, name: 'Action Required → Inbox', priority: 40, trigger_type: 'category', trigger_value: 'ACTION_REQUIRED', action: 'inbox', is_active: true },
  ];
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding development database...\n');

  // 1. Create or find demo user
  console.log(`Creating user ${DEMO_USER_EMAIL}...`);
  let userId: string;

  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users.find((u) => u.email === DEMO_USER_EMAIL);

  if (existing) {
    userId = existing.id;
    console.log(`  → Found existing user: ${userId}`);
  } else {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
      email_confirm: true,
    });
    if (error || !newUser.user) throw new Error(`Failed to create user: ${error?.message}`);
    userId = newUser.user.id;
    console.log(`  → Created user: ${userId}`);
  }

  // 2. Subscription record (free tier)
  console.log('Creating subscription (free tier)...');
  await supabase.schema('upinbox').from('subscriptions').upsert({
    user_id: userId,
    tier: 'free',
    status: 'active',
  }, { onConflict: 'user_id' });
  console.log('  → Done');

  // 3. IMAP account (FastMail-shaped, won't actually connect without real creds)
  console.log('Creating demo IMAP account...');
  const { data: existingAccount } = await supabase
    .schema('upinbox')
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('email_address', 'dev@fastmail.com')
    .maybeSingle();

  if (!existingAccount) {
    await supabase.schema('upinbox').from('accounts').insert({
      user_id: userId,
      email_address: 'dev@fastmail.com',
      display_name: 'Dev FastMail',
      provider: 'imap',
      provider_type: 'fastmail',
      // encrypted_credentials would be real AES-256-GCM ciphertext in production
      encrypted_credentials: Buffer.from(JSON.stringify({
        type: 'imap_password',
        host: 'imap.fastmail.com',
        port: 993,
        tls: true,
        username: 'dev@fastmail.com',
        password: 'demo-password-not-real',
      })).toString('base64'),
      is_active: true,
    });
    console.log('  → Created (note: won\'t connect without real credentials)');
  } else {
    console.log('  → Already exists, skipping');
  }

  // 4. Screener rules
  console.log('Creating default screener rules...');
  const { data: existingRules } = await supabase
    .schema('upinbox')
    .from('screener_rules')
    .select('id')
    .eq('user_id', userId);

  if (!existingRules || existingRules.length === 0) {
    await supabase.schema('upinbox').from('screener_rules').insert(buildDefaultRules(userId));
    console.log('  → Created 7 default rules');
  } else {
    console.log(`  → ${existingRules.length} rules already exist, skipping`);
  }

  // 5. MCP token (for testing)
  console.log('Creating dev MCP token...');
  const plaintext = 'upinbox_mcp_dev_testing_token_do_not_use_in_production';
  const tokenHash = crypto.createHash('sha256').update(plaintext).digest('hex');

  const { data: existingToken } = await supabase
    .schema('upinbox')
    .from('mcp_tokens')
    .select('id')
    .eq('user_id', userId)
    .eq('description', 'Dev testing token')
    .maybeSingle();

  if (!existingToken) {
    await supabase.schema('upinbox').from('mcp_tokens').insert({
      user_id: userId,
      token_hash: tokenHash,
      description: 'Dev testing token',
      scopes: ['read', 'write'],
    });
    console.log(`  → Created. Token (dev only, NOT for production):\n    ${plaintext}`);
  } else {
    console.log(`  → Already exists, token hash: ${tokenHash.slice(0, 16)}...`);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log('\n✅ Seed complete!\n');
  console.log('  User ID: ', userId);
  console.log('  Email:   ', DEMO_USER_EMAIL);
  console.log('  Password:', DEMO_USER_PASSWORD);
  console.log('\n  Open http://localhost:3000 and sign in with the credentials above.');
  console.log('  The MCP token above can be used with Claude Desktop for local testing.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
