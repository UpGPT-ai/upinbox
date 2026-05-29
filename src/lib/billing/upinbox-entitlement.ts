/**
 * UpInbox Entitlement Gate (server-side)
 *
 * Single source of truth for: "is this caller allowed to use UpInbox email features?"
 *
 * UpInbox is gated on UpGPT subscription capabilities — NOT on a local UpInbox tier.
 * The user's UpGPT account is the license root; UpInbox is one of many capabilities
 * that an UpGPT subscription can grant.
 *
 * Three auth sources are tried in order:
 *
 *   1. UpGPT JWT in `Authorization: Bearer <jwt>` header
 *      — Used by mobile clients and MCP machine clients that hold a signed UpGPT
 *        license token. The token's payload carries the capability list, so no DB
 *        lookup is required.
 *
 *   2. Supabase session cookie
 *      — Used by the hosted web app. We resolve the Supabase user, then look up
 *        their UpGPT capabilities (currently from `user_metadata.upgptCapabilities`
 *        as a placeholder — will be synced from UpGPT.ai via webhook).
 *
 *   3. MCP token in `Authorization: Bearer upinbox_mcp_*` header
 *      — Legacy / machine clients. We resolve the owning Supabase user, then look
 *        up their UpGPT capabilities the same way as the session path.
 *
 * Use `requireEmailEntitlement(request)` at the top of any UpInbox API route that
 * touches email. On failure it returns a structured `{ ok: false, status, error,
 * upgrade? }` object that the route handler turns into a `Response.json(...)`.
 *
 * IMPORTANT: This is the ONLY place we should decide "can this caller use UpInbox
 * email?" Routes must never read capabilities directly — always go through here.
 */

import { getLicenseFromRequest, hasCapability, type UpGPTLicense } from './upgpt-license';
import { CAPABILITY, EMAIL_REQUIREMENT } from './capabilities';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { authenticateMcpToken } from '@/lib/mcp/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolved auth context for a request — discriminated by `source`.
 *
 * `license` may be `null` for `session` and `mcp-token` sources when the user is
 * authenticated but has no UpGPT subscription on file. For the `upgpt-jwt` source
 * we always have a license (the JWT itself is the license).
 */
export type AuthContext =
  | { source: 'upgpt-jwt'; userId: string; license: UpGPTLicense }
  | { source: 'session'; userId: string; license: UpGPTLicense | null }
  | { source: 'mcp-token'; tokenId: string; userId: string; license: UpGPTLicense | null }
  | null;

/**
 * Upgrade hint returned to the client on a 402 — used by the UI to render an
 * upsell card / button pointing the user to the right UpGPT plan.
 */
export interface UpgradeHint {
  url: string;
  label: string;
  description: string;
}

/**
 * Result returned by the entitlement helpers. `ok: true` ⇒ caller passes the
 * gate, `ctx` is guaranteed populated. `ok: false` ⇒ route handler should send
 * `Response.json({ error, upgrade }, { status })`.
 */
export interface EntitlementResult {
  ok: boolean;
  status?: number;
  error?: string;
  upgrade?: UpgradeHint;
  ctx?: AuthContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to resolve the caller from the request using each supported auth
 * source. Returns the first one that authenticates successfully, or `null` if
 * none do.
 *
 * Order:
 *   1. UpGPT JWT in Authorization header (mobile, MCP)
 *   2. Supabase session cookie (web users)
 *   3. MCP token (legacy / machine clients)
 *
 * A non-null result means "we know who the caller is" — it does NOT mean they
 * have any particular capability. Capability checks happen in `requireCapability`.
 */
export async function getAuthContext(request: Request): Promise<AuthContext> {
  // 1. UpGPT JWT — verified license token carries capabilities inline
  const jwtCtx = await tryResolveUpGPTJwt(request);
  if (jwtCtx) return jwtCtx;

  // 2. Supabase session cookie — hosted web app
  const sessionCtx = await tryResolveSession();
  if (sessionCtx) return sessionCtx;

  // 3. MCP token — legacy / machine clients
  const mcpCtx = await tryResolveMcpToken(request);
  if (mcpCtx) return mcpCtx;

  return null;
}

/**
 * Gate an API route on a specific UpGPT capability.
 *
 *  - No auth at all              → 401 "Authentication required"
 *  - Authed, missing capability  → 402 "<capability> capability required" + upgrade hint
 *  - Authed, has capability      → { ok: true, ctx }
 *
 * The upgrade hint defaults to `EMAIL_REQUIREMENT` when gating on email; other
 * capabilities should add their own requirement object to `./capabilities` and
 * we'll pick it up from the registry below.
 */
export async function requireCapability(
  request: Request,
  capability: string
): Promise<EntitlementResult> {
  const ctx = await getAuthContext(request);

  if (!ctx) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required',
    };
  }

  if (!hasCapability(ctx.license, capability)) {
    return {
      ok: false,
      status: 402,
      error: `${capability} capability required`,
      upgrade: resolveUpgradeHint(capability),
    };
  }

  return { ok: true, ctx };
}

/**
 * Convenience wrapper around `requireCapability` for the most common case:
 * gating an UpInbox email endpoint. Equivalent to
 * `requireCapability(request, CAPABILITY.EMAIL)`.
 */
export async function requireEmailEntitlement(
  request: Request
): Promise<EntitlementResult> {
  return requireCapability(request, CAPABILITY.EMAIL);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal resolvers — one per auth source. Each returns AuthContext or null.
// ─────────────────────────────────────────────────────────────────────────────

async function tryResolveUpGPTJwt(request: Request): Promise<AuthContext> {
  try {
    const license = await getLicenseFromRequest(request);
    if (!license) return null;
    return {
      source: 'upgpt-jwt',
      userId: license.userId,
      license,
    };
  } catch {
    return null;
  }
}

async function tryResolveSession(): Promise<AuthContext> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const license = await lookupLicenseForUser(user.id, user.user_metadata ?? null);
    return { source: 'session', userId: user.id, license };
  } catch {
    // Cookie store unavailable (e.g. called from a non-request context) — fail silently.
    return null;
  }
}

async function tryResolveMcpToken(request: Request): Promise<AuthContext> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token.startsWith('upinbox_mcp_')) return null;

    const record = await authenticateMcpToken(authHeader);
    if (!record) return null;

    const license = await lookupLicenseForUser(record.user_id, null);
    return {
      source: 'mcp-token',
      tokenId: record.id,
      userId: record.user_id,
      license,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// License lookup for session / MCP callers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the UpGPT license for a Supabase user.
 *
 * PLACEHOLDER IMPLEMENTATION: We read the capability list directly from
 * `user_metadata.upgptCapabilities` (a string[] mirrored into the auth user by
 * the UpGPT.ai webhook). This keeps the dependency surface tiny while we
 * stand up the real sync.
 *
 * TODO(upgpt-sync): Replace with a query against the canonical mirror table
 *   that the UpGPT.ai webhook writes to. Suggested shape:
 *
 *     create table public.upgpt_user_entitlements (
 *       user_id        uuid primary key references auth.users(id),
 *       upgpt_user_id  text not null,
 *       plan           text not null,
 *       capabilities   text[] not null default '{}',
 *       synced_at      timestamptz not null default now()
 *     );
 *
 *   The webhook handler lives at /api/webhooks/upgpt and upserts this table on
 *   every UpGPT subscription change (created / updated / canceled / refunded).
 *   That handler is the ONLY writer to this table — never write from app code.
 *
 * TODO(upgpt-sync): When the table is in place, prefer it over user_metadata.
 *   Keep the metadata fallback for one release as a safety net, then remove.
 */
async function lookupLicenseForUser(
  userId: string,
  userMetadata: Record<string, unknown> | null
): Promise<UpGPTLicense | null> {
  const rawCaps = userMetadata?.upgptCapabilities;
  if (!Array.isArray(rawCaps)) return null;

  const capabilities = rawCaps.filter((c): c is string => typeof c === 'string');
  if (capabilities.length === 0) return null;

  // Minimal license shape — the rest of the platform should not depend on
  // session-sourced licenses carrying the same metadata as JWT-sourced ones.
  return {
    userId,
    capabilities,
  } as UpGPTLicense;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade-hint registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a capability id to the upgrade hint we show on a 402.
 *
 * TODO(capabilities): As more capabilities are added (calendar, contacts,
 *   tracker, MCP, etc.), extend `./capabilities` with a `REQUIREMENT[capability]`
 *   map and replace this switch with a single lookup.
 */
function resolveUpgradeHint(capability: string): UpgradeHint | undefined {
  if (capability === CAPABILITY.EMAIL) {
    return {
      url: EMAIL_REQUIREMENT.upgradeUrl,
      label: EMAIL_REQUIREMENT.upgradeLabel,
      description: EMAIL_REQUIREMENT.description,
    };
  }
  return undefined;
}
