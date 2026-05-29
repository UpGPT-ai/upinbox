/**
 * Demo seed script — populates a fresh UpInbox instance with realistic data
 * for product evaluation / screenshots / sales demos.
 *
 * Unlike `seed-dev.ts` (which provisions a working dev user + IMAP account),
 * this seeder fills the database with believable mail content: threads,
 * categories, attachments, calendar proposals, phishing test cases, labels,
 * signatures, and a saved search — all tied to an existing user.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts <user_id>
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo.ts <user_id>
 *
 * Prerequisite migrations (must be applied before running):
 *   - supabase/migrations/*_upinbox_core.sql           — accounts, mailboxes, messages, threads
 *   - supabase/migrations/*_upinbox_labels.sql         — labels, message_labels
 *   - supabase/migrations/*_upinbox_attachments.sql    — attachments
 *   - supabase/migrations/*_upinbox_signatures.sql     — signatures
 *   - supabase/migrations/*_upinbox_saved_searches.sql — saved_searches
 *   - supabase/migrations/*_upinbox_categories.sql     — message classification columns
 *
 * The script is idempotent on (user_id, demo_marker='upinbox-demo-seed'):
 * re-running it deletes prior demo rows for the user before re-inserting.
 *
 * Note: no real IMAP connection is created. The demo account is provider_type
 * 'imap' with placeholder credentials — UI surfaces will render it as a
 * standard inbox without ever attempting to fetch from a server.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: npx tsx scripts/seed-demo.ts <user_id>');
  process.exit(1);
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error(`Invalid user_id (expected UUID): ${userId}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const db = supabase.schema('upinbox');

const DEMO_MARKER = 'upinbox-demo-seed';

// ─── Time helpers ─────────────────────────────────────────────────────────────

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Returns an ISO timestamp `offsetMs` milliseconds before NOW. */
function ago(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MAILBOXES = ['INBOX', 'Sent', 'Drafts', 'Archive', 'Trash', 'Spam'] as const;
type MailboxName = (typeof MAILBOXES)[number];

const LABELS: Array<{ name: string; parent?: string; color: string }> = [
  { name: 'Clients', color: '#2563eb' },
  { name: 'Clients/Acme', parent: 'Clients', color: '#1d4ed8' },
  { name: 'Personal', color: '#16a34a' },
];

interface DemoMessage {
  /** Stable key used only within this script (e.g. for threading). */
  key: string;
  mailbox: MailboxName;
  subject: string;
  from_name: string;
  from_email: string;
  to_email: string;
  snippet: string;
  body_text: string;
  body_html?: string;
  receivedAtMs: number; // ms ago
  is_read: boolean;
  is_starred?: boolean;
  category?: 'PRIMARY' | 'NEWSLETTER' | 'PROMOTIONAL' | 'RECEIPT' | 'SOCIAL' | 'ACTION_REQUIRED' | 'SPAM';
  confidence?: number;
  thread_key?: string; // groups messages into a thread
  has_attachment?: boolean;
  attachment?: { filename: string; mime: string; size: number };
  calendar_proposal?: { startsAt: string; durationMin: number; title: string };
  labels?: string[];
  flags?: { phishing_risk?: boolean; auto_reply?: boolean; tracker_count?: number };
}

const MESSAGES: DemoMessage[] = [
  // 1. Welcome — Inbox, unread
  {
    key: 'welcome',
    mailbox: 'INBOX',
    subject: 'Welcome to UpInbox',
    from_name: 'UpInbox Team',
    from_email: 'team@upinbox.ai',
    to_email: 'demo@upinbox.ai',
    snippet: 'Thanks for trying UpInbox — here is a quick tour of what your new mail experience can do.',
    body_text:
      'Hi there,\n\nThanks for trying UpInbox. Your new inbox is private by default — ' +
      'no third party sees your mail. Try the Screener to triage newsletters and the ' +
      'AI summary on any long thread.\n\n— The UpInbox Team',
    receivedAtMs: 5 * MIN,
    is_read: false,
    category: 'PRIMARY',
    confidence: 0.99,
  },

  // 2. Stripe invoice — has attachment, unread
  {
    key: 'invoice',
    mailbox: 'INBOX',
    subject: 'Your invoice #1234',
    from_name: 'Stripe Billing',
    from_email: 'billing@stripe.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'Your monthly invoice is attached. Total: $49.00. Payment was charged successfully.',
    body_text:
      'Hi,\n\nYour invoice #1234 for $49.00 has been paid successfully. ' +
      'The PDF is attached for your records.\n\nStripe',
    receivedAtMs: 2 * HOUR,
    is_read: false,
    category: 'RECEIPT',
    confidence: 0.97,
    has_attachment: true,
    attachment: { filename: 'invoice-1234.pdf', mime: 'application/pdf', size: 84_211 },
  },

  // 3. Meeting proposal — triggers calendar detection
  {
    key: 'meeting',
    mailbox: 'INBOX',
    subject: 'Meeting tomorrow at 2pm',
    from_name: 'Priya Shah',
    from_email: 'priya@acme.co',
    to_email: 'demo@upinbox.ai',
    snippet: 'Can we sync tomorrow at 2pm for 30 minutes to walk through the deck?',
    body_text:
      'Hey,\n\nCan we sync tomorrow at 2:00pm PT for 30 minutes to walk through the deck? ' +
      'I added a placeholder on my calendar. Reply to confirm and I will send an invite.\n\nPriya',
    receivedAtMs: 4 * HOUR,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.92,
    calendar_proposal: {
      startsAt: new Date(NOW + DAY).toISOString().slice(0, 10) + 'T14:00:00-07:00',
      durationMin: 30,
      title: 'Sync with Priya — deck walkthrough',
    },
    labels: ['Clients/Acme'],
  },

  // 4. Newsletter
  {
    key: 'newsletter',
    mailbox: 'INBOX',
    subject: 'Newsletter: AI weekly digest',
    from_name: 'AI Weekly',
    from_email: 'newsletter@example.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'This week: open-weights gains, agent harnesses, and the regulatory roundup.',
    body_text:
      'Top stories this week:\n\n1. Open-weights models gain ground...\n2. Agent harnesses standardize on MCP...\n3. EU AI Act enforcement timelines...\n\nUnsubscribe at the bottom.',
    receivedAtMs: 18 * HOUR,
    is_read: false,
    category: 'NEWSLETTER',
    confidence: 0.95,
    flags: { tracker_count: 6 },
  },

  // 5–8. "Re: Project status" thread (4 messages)
  {
    key: 'proj-1',
    mailbox: 'INBOX',
    subject: 'Project status',
    from_name: 'Marcus Lee',
    from_email: 'marcus@acme.co',
    to_email: 'demo@upinbox.ai',
    snippet: 'Quick status before our 1:1 — phase 2 is on track, phase 3 needs a decision.',
    body_text:
      'Quick status before our 1:1:\n- Phase 2: on track for Friday\n- Phase 3: blocked on a vendor decision\n- Phase 4: scoping next week\n\n— Marcus',
    receivedAtMs: 3 * DAY,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.93,
    thread_key: 'project-status',
    labels: ['Clients/Acme'],
  },
  {
    key: 'proj-2',
    mailbox: 'Sent',
    subject: 'Re: Project status',
    from_name: 'Demo User',
    from_email: 'demo@upinbox.ai',
    to_email: 'marcus@acme.co',
    snippet: 'Thanks. For phase 3, let us go with vendor B — cheaper and ships next week.',
    body_text:
      'Thanks Marcus. For phase 3, let us go with vendor B — cheaper and ships next week. ' +
      'Can you loop in legal for the MSA?\n\n— D',
    receivedAtMs: 3 * DAY - 2 * HOUR,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.99,
    thread_key: 'project-status',
  },
  {
    key: 'proj-3',
    mailbox: 'INBOX',
    subject: 'Re: Project status',
    from_name: 'Marcus Lee',
    from_email: 'marcus@acme.co',
    to_email: 'demo@upinbox.ai',
    snippet: 'Looped in legal. Vendor B confirmed. Will share the MSA draft Monday.',
    body_text:
      'Looped in legal. Vendor B confirmed and will send pricing addendum. ' +
      'I will share the MSA draft Monday morning.\n\n— Marcus',
    receivedAtMs: 3 * DAY - 5 * HOUR,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.94,
    thread_key: 'project-status',
  },
  {
    key: 'proj-4',
    mailbox: 'INBOX',
    subject: 'Re: Project status',
    from_name: 'Legal — Acme',
    from_email: 'legal@acme.co',
    to_email: 'demo@upinbox.ai',
    snippet: 'MSA draft attached. Highlighted indemnity and SLA sections for review.',
    body_text:
      'Attached is the MSA draft. Two sections need your eyes: indemnity (§7) and SLA (§12). ' +
      'Happy to jump on a call if easier.\n\n— Acme Legal',
    receivedAtMs: 1 * DAY,
    is_read: false,
    category: 'ACTION_REQUIRED',
    confidence: 0.88,
    thread_key: 'project-status',
    has_attachment: true,
    attachment: { filename: 'acme-msa-draft-v3.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 142_900 },
    labels: ['Clients/Acme'],
  },

  // 9. Manager — Action Needed
  {
    key: 'manager-sync',
    mailbox: 'INBOX',
    subject: 'Can we sync on Q3 plans?',
    from_name: 'Sara Okafor',
    from_email: 'sara@upgpt.ai',
    to_email: 'demo@upinbox.ai',
    snippet: 'Want to lock the Q3 OKRs by Friday — can you send your draft today?',
    body_text:
      'Hey — want to lock Q3 OKRs by Friday. Could you send your draft today so I can ' +
      'circulate before our Thursday review?\n\nThanks,\nSara',
    receivedAtMs: 6 * HOUR,
    is_read: false,
    category: 'ACTION_REQUIRED',
    confidence: 0.96,
    is_starred: true,
  },

  // 10. Amazon receipt — archive candidate
  {
    key: 'amazon',
    mailbox: 'Archive',
    subject: 'Receipt — Amazon order #112-9988776-5544332',
    from_name: 'Amazon.com',
    from_email: 'auto-confirm@amazon.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'Order placed for "USB-C Hub" — total $34.99. Arriving Tuesday.',
    body_text:
      'Thanks for your order. Total: $34.99. Estimated delivery: Tuesday. ' +
      'You can track your package in the Amazon app.',
    receivedAtMs: 5 * DAY,
    is_read: true,
    category: 'RECEIPT',
    confidence: 0.99,
  },

  // 11. Marketing — tracker-heavy
  {
    key: 'promo',
    mailbox: 'INBOX',
    subject: '50% off — this weekend only',
    from_name: 'StoreCo Promotions',
    from_email: 'promotions@store.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'Our biggest sale of the season. 50% off everything through Sunday night.',
    body_text:
      'Our biggest sale of the season. 50% off everything through Sunday night. Shop now.',
    body_html:
      '<html><body><img src="https://track.store.com/o/abc?u=1" width="1" height="1"/>' +
      '<img src="https://pixel.facebook.com/x.gif" width="1" height="1"/>' +
      '<img src="https://analytics.google.com/x.gif" width="1" height="1"/>' +
      '<h1>50% OFF</h1><p>This weekend only. <a href="https://store.com/sale?ref=email&utm=promo">Shop now</a></p>' +
      '<img src="https://track.store.com/o/def?u=2" width="1" height="1"/>' +
      '<img src="https://track.store.com/o/ghi?u=3" width="1" height="1"/>' +
      '</body></html>',
    receivedAtMs: 12 * HOUR,
    is_read: false,
    category: 'PROMOTIONAL',
    confidence: 0.98,
    flags: { tracker_count: 5 },
  },

  // 12. Social
  {
    key: 'social',
    mailbox: 'INBOX',
    subject: 'Jordan invited you to connect',
    from_name: 'LinkedIn',
    from_email: 'invitations@linkedin.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'Jordan Rivera would like to connect on LinkedIn.',
    body_text: 'Jordan Rivera would like to connect on LinkedIn. View profile to accept.',
    receivedAtMs: 2 * DAY,
    is_read: true,
    category: 'SOCIAL',
    confidence: 0.99,
  },

  // 13. Phishing test — screener candidate
  {
    key: 'phishing',
    mailbox: 'INBOX',
    subject: 'Action required: Verify your account',
    from_name: 'Securlty Team',
    from_email: 'no-reply@account-security-verlfy.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'Your account will be suspended unless you verify within 24 hours.',
    body_text:
      'Dear customer,\n\nYour account will be permanently suspended in 24 hours ' +
      'unless you verify your password at the link below.\n\nhttps://account-security-verlfy.com/verify?u=demo\n\nThank you,\nSecurlty Team',
    body_html:
      '<p>Dear customer,</p><p>Your account will be permanently suspended in 24 hours unless you ' +
      '<a href="https://account-security-verlfy.com/verify?u=demo">verify your password</a> immediately.</p>',
    receivedAtMs: 8 * HOUR,
    is_read: false,
    category: 'SPAM',
    confidence: 0.82,
    flags: { phishing_risk: true },
  },

  // 14–15. Conference call summary thread (2 messages)
  {
    key: 'conf-1',
    mailbox: 'INBOX',
    subject: 'Conference call summary — vendor pricing review',
    from_name: 'Operations',
    from_email: 'ops@upgpt.ai',
    to_email: 'demo@upinbox.ai',
    snippet: 'Notes from today\'s vendor pricing call: three vendors, two finalists, decision Friday.',
    body_text:
      'Notes:\n- 3 vendors reviewed\n- Finalists: VendorA, VendorB\n- Decision due Friday\n- Action items assigned in attached doc',
    receivedAtMs: 4 * DAY,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.91,
    thread_key: 'conf-call',
  },
  {
    key: 'conf-2',
    mailbox: 'INBOX',
    subject: 'Re: Conference call summary — vendor pricing review',
    from_name: 'Finance',
    from_email: 'finance@upgpt.ai',
    to_email: 'demo@upinbox.ai',
    snippet: 'Adding the budget impact estimate — VendorA is 12% under the cap.',
    body_text: 'Budget impact: VendorA is 12% under cap, VendorB is 4% over. Recommend VendorA.\n\n— Finance',
    receivedAtMs: 4 * DAY - 4 * HOUR,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.93,
    thread_key: 'conf-call',
  },

  // 16. Vacation auto-reply
  {
    key: 'vacation',
    mailbox: 'INBOX',
    subject: 'Out of office: Re: quick question',
    from_name: 'Alex Chen',
    from_email: 'alex@partner.co',
    to_email: 'demo@upinbox.ai',
    snippet: 'I am out of office until next Monday with limited email access.',
    body_text:
      'I am out of office until next Monday with limited email access. ' +
      'For urgent matters please contact priya@partner.co.\n\n— Alex',
    receivedAtMs: 7 * DAY,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.99,
    flags: { auto_reply: true },
  },

  // 17. Personal
  {
    key: 'personal',
    mailbox: 'INBOX',
    subject: 'Dinner Saturday?',
    from_name: 'Sam',
    from_email: 'sam.friend@gmail.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'Hey — free Saturday around 7? Trying that new ramen spot.',
    body_text: 'Hey — free Saturday around 7? Trying that new ramen spot. Let me know!\n\n— S',
    receivedAtMs: 14 * HOUR,
    is_read: false,
    category: 'PRIMARY',
    confidence: 0.96,
    labels: ['Personal'],
  },

  // 18. Older newsletter (archive)
  {
    key: 'oldnews',
    mailbox: 'Archive',
    subject: 'Newsletter: Product Hunt weekly',
    from_name: 'Product Hunt',
    from_email: 'digest@producthunt.com',
    to_email: 'demo@upinbox.ai',
    snippet: 'Top launches this week — AI coding tools dominated the leaderboard.',
    body_text: 'Top launches this week: 1) X 2) Y 3) Z. Unsubscribe at the bottom.',
    receivedAtMs: 20 * DAY,
    is_read: true,
    category: 'NEWSLETTER',
    confidence: 0.97,
    flags: { tracker_count: 3 },
  },

  // 19. Draft
  {
    key: 'draft',
    mailbox: 'Drafts',
    subject: 'Q3 OKRs — draft for review',
    from_name: 'Demo User',
    from_email: 'demo@upinbox.ai',
    to_email: 'sara@upgpt.ai',
    snippet: '(draft) Here is the Q3 OKR draft — three objectives, eight key results...',
    body_text: 'Hey Sara,\n\nDraft below — three objectives, eight KRs. Open to feedback.\n\n[draft in progress]',
    receivedAtMs: 1 * HOUR,
    is_read: true,
    category: 'PRIMARY',
    confidence: 0.99,
  },

  // 20. Spam
  {
    key: 'spam',
    mailbox: 'Spam',
    subject: 'You won a prize! Claim now!!!',
    from_name: 'Prize Center',
    from_email: 'prizes@randomdomain.xyz',
    to_email: 'demo@upinbox.ai',
    snippet: 'Congratulations! You have been selected to receive...',
    body_text: 'Congratulations! Click here to claim your prize!!!',
    receivedAtMs: 9 * DAY,
    is_read: true,
    category: 'SPAM',
    confidence: 0.99,
  },
];

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function wipePriorDemo() {
  console.log('Wiping prior demo rows for user...');
  // Order matters: delete children before parents.
  // We rely on the demo_marker column where it exists; otherwise we scope by user_id.
  await db.from('attachments').delete().eq('demo_marker', DEMO_MARKER);
  await db.from('message_labels').delete().eq('demo_marker', DEMO_MARKER);
  await db.from('messages').delete().eq('demo_marker', DEMO_MARKER);
  await db.from('threads').delete().eq('demo_marker', DEMO_MARKER);
  await db.from('labels').delete().eq('user_id', userId).eq('demo_marker', DEMO_MARKER);
  await db.from('mailboxes').delete().eq('demo_marker', DEMO_MARKER);
  await db.from('accounts').delete().eq('user_id', userId).eq('demo_marker', DEMO_MARKER);
  await db.from('signatures').delete().eq('user_id', userId).eq('demo_marker', DEMO_MARKER);
  await db.from('saved_searches').delete().eq('user_id', userId).eq('demo_marker', DEMO_MARKER);
  console.log('  → Done');
}

async function createAccount(): Promise<string> {
  console.log('Creating demo account...');
  const { data, error } = await db
    .from('accounts')
    .insert({
      user_id: userId,
      email_address: 'demo@upinbox.ai',
      display_name: 'Demo Inbox',
      provider: 'imap',
      provider_type: 'imap',
      encrypted_credentials: Buffer.from(
        JSON.stringify({
          type: 'demo',
          host: 'imap.example.invalid',
          port: 993,
          tls: true,
          username: 'demo@upinbox.ai',
          password: 'no-op-demo',
        })
      ).toString('base64'),
      is_active: true,
      demo_marker: DEMO_MARKER,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`accounts insert failed: ${error?.message}`);
  console.log(`  → account id: ${data.id}`);
  return data.id as string;
}

async function createMailboxes(accountId: string): Promise<Record<MailboxName, string>> {
  console.log('Creating mailboxes...');
  const rows = MAILBOXES.map((name) => ({
    account_id: accountId,
    name,
    path: name,
    is_system: true,
    demo_marker: DEMO_MARKER,
  }));
  const { data, error } = await db.from('mailboxes').insert(rows).select('id, name');
  if (error || !data) throw new Error(`mailboxes insert failed: ${error?.message}`);

  const map = {} as Record<MailboxName, string>;
  for (const row of data) map[row.name as MailboxName] = row.id as string;
  console.log(`  → ${data.length} mailboxes`);
  return map;
}

async function createLabels(): Promise<Record<string, string>> {
  console.log('Creating labels...');
  // Parents first.
  const parents = LABELS.filter((l) => !l.parent);
  const children = LABELS.filter((l) => l.parent);

  const result: Record<string, string> = {};

  for (const lbl of parents) {
    const { data, error } = await db
      .from('labels')
      .insert({
        user_id: userId,
        name: lbl.name,
        color: lbl.color,
        parent_id: null,
        demo_marker: DEMO_MARKER,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`label insert failed: ${error?.message}`);
    result[lbl.name] = data.id as string;
  }

  for (const lbl of children) {
    const parentId = result[lbl.parent!];
    if (!parentId) throw new Error(`Parent label not found: ${lbl.parent}`);
    const { data, error } = await db
      .from('labels')
      .insert({
        user_id: userId,
        name: lbl.name,
        color: lbl.color,
        parent_id: parentId,
        demo_marker: DEMO_MARKER,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`label insert failed: ${error?.message}`);
    result[lbl.name] = data.id as string;
  }
  console.log(`  → ${Object.keys(result).length} labels`);
  return result;
}

async function createThreads(accountId: string): Promise<Record<string, string>> {
  console.log('Creating threads...');
  const threadKeys = Array.from(new Set(MESSAGES.map((m) => m.thread_key).filter(Boolean))) as string[];
  const map: Record<string, string> = {};

  for (const key of threadKeys) {
    const firstMsg = MESSAGES.find((m) => m.thread_key === key)!;
    const { data, error } = await db
      .from('threads')
      .insert({
        account_id: accountId,
        subject: firstMsg.subject.replace(/^Re:\s*/i, ''),
        demo_marker: DEMO_MARKER,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`thread insert failed: ${error?.message}`);
    map[key] = data.id as string;
  }
  console.log(`  → ${Object.keys(map).length} threads`);
  return map;
}

async function createMessages(
  accountId: string,
  mailboxIds: Record<MailboxName, string>,
  threadIds: Record<string, string>,
  labelIds: Record<string, string>
) {
  console.log('Creating messages...');
  let inserted = 0;

  for (const m of MESSAGES) {
    const messageId = `<${crypto.randomBytes(12).toString('hex')}@upinbox.demo>`;
    const { data, error } = await db
      .from('messages')
      .insert({
        account_id: accountId,
        mailbox_id: mailboxIds[m.mailbox],
        thread_id: m.thread_key ? threadIds[m.thread_key] : null,
        message_id: messageId,
        subject: m.subject,
        from_name: m.from_name,
        from_email: m.from_email,
        to_emails: [m.to_email],
        snippet: m.snippet,
        body_text: m.body_text,
        body_html: m.body_html ?? null,
        received_at: ago(m.receivedAtMs),
        is_read: m.is_read,
        is_starred: m.is_starred ?? false,
        category: m.category ?? null,
        category_confidence: m.confidence ?? null,
        has_attachment: m.has_attachment ?? false,
        flags: m.flags ?? {},
        calendar_proposal: m.calendar_proposal ?? null,
        demo_marker: DEMO_MARKER,
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`message insert failed (${m.key}): ${error?.message}`);
    const newMessageId = data.id as string;
    inserted++;

    // Attachment
    if (m.has_attachment && m.attachment) {
      const { error: attErr } = await db.from('attachments').insert({
        message_id: newMessageId,
        filename: m.attachment.filename,
        mime_type: m.attachment.mime,
        size_bytes: m.attachment.size,
        storage_key: `demo/${newMessageId}/${m.attachment.filename}`,
        demo_marker: DEMO_MARKER,
      });
      if (attErr) throw new Error(`attachment insert failed: ${attErr.message}`);
    }

    // Labels
    if (m.labels && m.labels.length > 0) {
      for (const labelName of m.labels) {
        const labelId = labelIds[labelName];
        if (!labelId) {
          console.warn(`  ⚠ label not found: ${labelName}`);
          continue;
        }
        const { error: lblErr } = await db.from('message_labels').insert({
          message_id: newMessageId,
          label_id: labelId,
          demo_marker: DEMO_MARKER,
        });
        if (lblErr) throw new Error(`message_labels insert failed: ${lblErr.message}`);
      }
    }
  }
  console.log(`  → ${inserted} messages`);
}

async function createSignature() {
  console.log('Creating signature...');
  const { error } = await db.from('signatures').insert({
    user_id: userId,
    name: 'Default',
    body_text: '— Demo User\nUpInbox demo account',
    body_html: '<p>— <strong>Demo User</strong><br/>UpInbox demo account</p>',
    is_default: true,
    demo_marker: DEMO_MARKER,
  });
  if (error) throw new Error(`signature insert failed: ${error.message}`);
  console.log('  → 1 signature');
}

async function createSavedSearch() {
  console.log('Creating saved search...');
  const { error } = await db.from('saved_searches').insert({
    user_id: userId,
    name: 'Unread from clients',
    query: { is_read: false, label: 'Clients', mailbox: 'INBOX' },
    demo_marker: DEMO_MARKER,
  });
  if (error) throw new Error(`saved_search insert failed: ${error.message}`);
  console.log('  → 1 saved search');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 Seeding demo data for user ${userId}\n`);

  try {
    await wipePriorDemo();
    const accountId = await createAccount();
    const mailboxIds = await createMailboxes(accountId);
    const labelIds = await createLabels();
    const threadIds = await createThreads(accountId);
    await createMessages(accountId, mailboxIds, threadIds, labelIds);
    await createSignature();
    await createSavedSearch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\n❌ Seed failed:', msg);
    console.error(
      '\nTroubleshooting:\n' +
        '  • Confirm prerequisite migrations are applied (see header comment).\n' +
        '  • Confirm the user_id exists in auth.users.\n' +
        '  • Confirm SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY point at the right project.\n' +
        '  • If a column like demo_marker is missing, add it via migration (nullable text).\n'
    );
    process.exit(1);
  }

  console.log(`\n✅ Seeded demo data for user ${userId}. Open mail.upinbox.ai to see it.`);
}

main();
