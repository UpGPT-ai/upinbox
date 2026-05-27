/**
 * MCP Token Authentication
 *
 * MCP tokens are long-lived tokens issued to AI assistants.
 * They are scoped (which tools can be used) and can be revoked.
 *
 * Token format: upinbox_mcp_{random 32 bytes in base64url}
 * Storage: SHA-256 hash stored in upinbox.mcp_tokens
 * The plaintext token is only shown once at creation time.
 */

import { createServiceSupabaseClient } from '@/lib/supabase-server';

export interface McpTokenRecord {
  id: string;
  user_id: string;
  scopes: string[];
  description: string | null;
  expires_at: string | null;
}

/**
 * Authenticate an MCP request by its Bearer token.
 * Returns the token record if valid, null if invalid/expired/revoked.
 */
export async function authenticateMcpToken(
  authHeader: string | null
): Promise<McpTokenRecord | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token.startsWith('upinbox_mcp_')) return null;

  // Hash the token for comparison (timing-safe)
  const tokenHash = await hashToken(token);

  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from('upinbox.mcp_tokens')
    .select('id, user_id, scopes, description, expires_at, revoked_at, last_used_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single();

  if (!data) return null;

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  // Update last_used_at (non-blocking)
  supabase
    .from('upinbox.mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(() => {});

  return {
    id: data.id,
    user_id: data.user_id,
    scopes: data.scopes,
    description: data.description,
    expires_at: data.expires_at,
  };
}

/**
 * Generate a new MCP token.
 * Returns the plaintext token (shown once) and the hash for storage.
 */
export async function generateMcpToken(): Promise<{ token: string; hash: string }> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const randomPart = Buffer.from(randomBytes).toString('base64url');
  const token = `upinbox_mcp_${randomPart}`;
  const hash = await hashToken(token);
  return { token, hash };
}

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Buffer.from(hashBuffer).toString('hex');
}

/** Check if a token has a required scope */
export function hasScope(token: McpTokenRecord, scope: string): boolean {
  return token.scopes.includes('*') || token.scopes.includes(scope);
}

/** Map tool names to required scopes */
export const TOOL_SCOPES: Record<string, string> = {
  list_accounts: 'read',
  list_mailboxes: 'read',
  list_emails: 'read',
  read_email: 'read',
  search_emails: 'read',
  get_triage_result: 'read',
  get_inbox_summary: 'read',
  send_email: 'write',
  create_draft: 'write',
  mark_read: 'write',
  move_email: 'write',
  delete_email: 'delete',
};
