/**
 * POST /api/upinbox/mcp
 *
 * MCP (Model Context Protocol) server endpoint.
 * Allows AI assistants to interact with the user's email inbox.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Auth: Bearer token (upinbox_mcp_* format)
 *
 * Supported methods:
 *   initialize       — return server capabilities and tool list
 *   tools/list       — list available tools
 *   tools/call       — execute a tool
 *
 * Full MCP client setup:
 *   claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "upinbox": {
 *         "url": "https://your-instance.com/api/upinbox/mcp",
 *         "auth": "Bearer YOUR_MCP_TOKEN"
 *       }
 *     }
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateMcpToken, hasScope, TOOL_SCOPES } from '@/lib/mcp/auth';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import { getMailProvider } from '@/lib/mail/providers';
import { createServiceSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function rpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export async function POST(request: NextRequest) {
  // Authenticate
  const authHeader = request.headers.get('authorization');
  const tokenRecord = await authenticateMcpToken(authHeader);

  if (!tokenRecord) {
    return NextResponse.json(
      rpcError(null, -32001, 'Unauthorized: invalid or expired MCP token'),
      { status: 401 }
    );
  }

  // Parse JSON-RPC body
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      rpcError(null, -32700, 'Parse error: invalid JSON'),
      { status: 400 }
    );
  }

  const { id, method, params } = body;

  // ─── initialize ─────────────────────────────────────────────────────────────

  if (method === 'initialize') {
    return NextResponse.json(
      rpcResult(id, {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'upinbox',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      })
    );
  }

  // ─── tools/list ─────────────────────────────────────────────────────────────

  if (method === 'tools/list') {
    // Filter to tools the token has scope for
    const availableTools = MCP_TOOLS.filter((tool) => {
      const scope = TOOL_SCOPES[tool.name] ?? 'read';
      return hasScope(tokenRecord, scope);
    });

    return NextResponse.json(rpcResult(id, { tools: availableTools }));
  }

  // ─── tools/call ─────────────────────────────────────────────────────────────

  if (method === 'tools/call') {
    const callParams = params as { name: string; arguments?: Record<string, unknown> };
    const toolName = callParams?.name;
    const toolArgs = callParams?.arguments ?? {};

    if (!toolName) {
      return NextResponse.json(rpcError(id, -32602, 'Invalid params: tool name required'));
    }

    // Scope check
    const requiredScope = TOOL_SCOPES[toolName] ?? 'read';
    if (!hasScope(tokenRecord, requiredScope)) {
      return NextResponse.json(
        rpcError(id, -32001, `Forbidden: token lacks '${requiredScope}' scope for ${toolName}`)
      );
    }

    try {
      const result = await executeTool(toolName, toolArgs, tokenRecord.user_id);
      return NextResponse.json(rpcResult(id, result));
    } catch (err) {
      return NextResponse.json(
        rpcError(id, -32603, err instanceof Error ? err.message : 'Tool execution failed')
      );
    }
  }

  return NextResponse.json(rpcError(id ?? null, -32601, `Method not found: ${method}`));
}

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const supabase = createServiceSupabaseClient();

  // Get primary account for this user
  const getAccount = async (accountId?: string) => {
    const query = (supabase as any)
      .from('upinbox.accounts')
      .select('*')
      .eq('user_id', userId);

    if (accountId) {
      query.eq('id', accountId);
    } else {
      query.eq('is_primary', true);
    }

    const { data } = await query.single();
    if (!data) throw new Error('No account found');
    return data;
  };

  switch (name) {
    case 'list_accounts': {
      const { data } = await (supabase as any)
        .from('upinbox.accounts')
        .select('id, email_address, display_name, provider_type, is_primary, sync_enabled, last_synced_at')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false });
      return { accounts: data ?? [] };
    }

    case 'list_mailboxes': {
      const account = await getAccount(args.account_id as string | undefined);
      const provider = await getMailProvider(account);
      const mailboxes = await provider.listMailboxes();
      return { mailboxes };
    }

    case 'list_emails': {
      const account = await getAccount(args.account_id as string | undefined);
      const provider = await getMailProvider(account);
      const limit = Math.min((args.limit as number) ?? 20, 100);
      const filter = (args.filter as string) ?? 'all';

      const hasKeyword: Record<string, boolean> = {};
      if (filter === 'unread') hasKeyword['$seen'] = false;
      if (filter === 'flagged') hasKeyword['$flagged'] = true;

      const { ids, total } = await provider.queryEmails({
        mailboxId: args.mailbox_id as string | undefined,
        limit,
        position: 0,
        hasKeyword: Object.keys(hasKeyword).length > 0 ? hasKeyword : undefined,
        sort: [{ property: 'receivedAt', isAscending: false }],
      });

      const emails = ids.length > 0
        ? await provider.getEmails(ids, ['id', 'threadId', 'mailboxIds', 'from', 'to', 'subject', 'receivedAt', 'keywords', 'hasAttachment', 'preview'])
        : [];

      return { emails, total, has_more: total > limit };
    }

    case 'read_email': {
      const account = await getAccount();
      const provider = await getMailProvider(account);
      const emails = await provider.getEmails([args.email_id as string]);
      if (!emails.length) throw new Error('Email not found');

      // Auto mark as read
      await provider.setKeywords(args.email_id as string, { '$seen': true }).catch(() => {});

      return { email: emails[0] };
    }

    case 'mark_read': {
      const account = await getAccount();
      const provider = await getMailProvider(account);
      const emailIds = args.email_ids as string[];
      await Promise.all(
        emailIds.map((id) => provider.setKeywords(id, { '$seen': args.read as boolean }))
      );
      return { marked: emailIds.length, read: args.read };
    }

    case 'move_email': {
      const account = await getAccount();
      const provider = await getMailProvider(account);
      await provider.moveEmail(args.email_id as string, args.to_mailbox_id as string);
      return { ok: true };
    }

    case 'delete_email': {
      const account = await getAccount();
      const provider = await getMailProvider(account);
      await provider.deleteEmail(args.email_id as string);
      return { ok: true };
    }

    case 'get_inbox_summary': {
      const account = await getAccount(args.account_id as string | undefined);
      const provider = await getMailProvider(account);
      const mailboxes = await provider.listMailboxes();
      const inbox = mailboxes.find((m) => m.role === 'inbox');

      const { ids } = await provider.queryEmails({
        mailboxId: inbox?.id,
        limit: 10,
        hasKeyword: { '$seen': false },
        sort: [{ property: 'receivedAt', isAscending: false }],
      });

      const recentUnread = ids.length > 0
        ? await provider.getEmails(ids, ['id', 'from', 'subject', 'receivedAt', 'preview'])
        : [];

      return {
        unread_count: inbox?.unreadEmails ?? 0,
        total_count: inbox?.totalEmails ?? 0,
        recent_unread: recentUnread.map((e) => ({
          id: e.id,
          from: e.from?.[0]?.name ?? e.from?.[0]?.email ?? 'Unknown',
          subject: e.subject ?? '(no subject)',
          received_at: e.receivedAt,
          preview: e.preview,
        })),
      };
    }

    case 'create_draft': {
      const account = await getAccount();
      const provider = await getMailProvider(account);
      const identities = await provider.getIdentities();
      const identity = identities[0];

      if (!identity) throw new Error('No identity configured for this account');

      const bodyKey = '1';
      const { id } = await provider.createDraft({
        from: [{ email: identity.email, name: identity.name ?? identity.email }],
        to: ((args.to as string[]) ?? []).map((email) => ({ email })),
        subject: args.subject as string,
        bodyValues: { [bodyKey]: { value: args.body as string } },
        textBody: [{ partId: bodyKey, type: 'text/plain' }],
      });

      return { draft_id: id };
    }

    case 'get_triage_result': {
      const { data } = await (supabase as any)
        .from('upinbox.triage_results')
        .select('*')
        .eq('user_id', userId)
        .eq('email_id', args.email_id as string)
        .order('classified_at', { ascending: false })
        .limit(1)
        .single();

      return data ?? { error: 'No triage result — run classification first' };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
