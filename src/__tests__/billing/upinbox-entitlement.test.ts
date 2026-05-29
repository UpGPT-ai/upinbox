import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  requireCapability,
  requireEmailEntitlement,
} from '@/lib/billing/upinbox-entitlement';
import { CAPABILITY } from '@/lib/billing/capabilities';
import {
  verifyUpGPTLicense,
  hasCapability,
  getLicenseFromRequest,
} from '@/lib/billing/upgpt-license';
import {
  createServerSupabaseClient,
  getCurrentUser,
} from '@/lib/supabase-server';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/billing/upgpt-license', () => ({
  verifyUpGPTLicense: vi.fn(),
  hasCapability: vi.fn(),
  getLicenseFromRequest: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(),
  getCurrentUser: vi.fn(),
}));

// MCP auth is the 3rd auth source — stub it so it never matches in these
// tests. We test it elsewhere; here we focus on JWT + session paths.
vi.mock('@/lib/mcp/auth', () => ({
  authenticateMcpToken: vi.fn().mockResolvedValue(null),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) headers['authorization'] = authHeader;
  return new Request('https://example.com/api/upinbox/test', { headers });
}

/** Stub the Supabase server client used by the session resolver. */
function stubSupabaseUser(
  user: { id: string; user_metadata?: Record<string, unknown> } | null
) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
  };
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('upinbox-entitlement: requireCapability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: nothing authenticates. Individual tests override as needed.
    vi.mocked(getLicenseFromRequest).mockResolvedValue(null as never);
    vi.mocked(hasCapability).mockReturnValue(false);
    stubSupabaseUser(null);
  });

  it('returns 401 when no auth at all', async () => {
    const result = await requireCapability(makeRequest(), CAPABILITY.EMAIL);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe('Authentication required');
    expect(result.upgrade).toBeUndefined();
    expect(result.ctx).toBeUndefined();
  });

  it('returns 402 with upgrade URL when authenticated but capability missing', async () => {
    // JWT resolves successfully → authenticated.
    vi.mocked(getLicenseFromRequest).mockResolvedValue({
      userId: 'user-1',
      capabilities: [],
    } as never);
    // …but the capability check says no.
    vi.mocked(hasCapability).mockReturnValue(false);

    const result = await requireCapability(
      makeRequest('Bearer some.jwt.token'),
      CAPABILITY.EMAIL
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(402);
    expect(result.error).toBe('email capability required');
    expect(result.upgrade).toBeDefined();
    expect(result.upgrade?.url).toContain('upgpt.ai');
    expect(result.upgrade?.url).toContain('upinbox');
    expect(result.upgrade?.label).toBeTruthy();
    expect(result.upgrade?.description).toBeTruthy();
  });

  it('returns ok when JWT has capability', async () => {
    vi.mocked(getLicenseFromRequest).mockResolvedValue({
      userId: 'user-jwt',
      capabilities: [CAPABILITY.EMAIL],
    } as never);
    vi.mocked(hasCapability).mockReturnValue(true);

    const result = await requireCapability(
      makeRequest('Bearer good.jwt.token'),
      CAPABILITY.EMAIL
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.ctx).toBeDefined();
    expect(result.ctx?.source).toBe('upgpt-jwt');
    expect(result.ctx?.userId).toBe('user-jwt');
  });

  it('returns ok when session has capability via user_metadata', async () => {
    // No JWT — falls through to session resolver.
    vi.mocked(getLicenseFromRequest).mockResolvedValue(null as never);
    stubSupabaseUser({
      id: 'user-session',
      user_metadata: {
        upgptCapabilities: [CAPABILITY.EMAIL, CAPABILITY.BYOK],
      },
    });
    vi.mocked(hasCapability).mockReturnValue(true);

    const result = await requireCapability(makeRequest(), CAPABILITY.EMAIL);

    expect(result.ok).toBe(true);
    expect(result.ctx).toBeDefined();
    expect(result.ctx?.source).toBe('session');
    expect(result.ctx?.userId).toBe('user-session');
    // License was synthesized from user_metadata.
    if (result.ctx?.source === 'session') {
      expect(result.ctx.license).not.toBeNull();
      expect(result.ctx.license?.capabilities).toContain(CAPABILITY.EMAIL);
    }
  });
});

describe('upinbox-entitlement: requireEmailEntitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLicenseFromRequest).mockResolvedValue(null as never);
    vi.mocked(hasCapability).mockReturnValue(false);
    stubSupabaseUser(null);
  });

  it('is a shortcut for requireCapability(EMAIL) — 401 when no auth', async () => {
    const result = await requireEmailEntitlement(makeRequest());

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('is a shortcut for requireCapability(EMAIL) — 402 when capability missing', async () => {
    vi.mocked(getLicenseFromRequest).mockResolvedValue({
      userId: 'user-1',
      capabilities: [],
    } as never);
    vi.mocked(hasCapability).mockReturnValue(false);

    const result = await requireEmailEntitlement(
      makeRequest('Bearer some.jwt.token')
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(402);
    expect(result.error).toBe('email capability required');
    expect(result.upgrade).toBeDefined();
    // hasCapability was asked specifically for EMAIL.
    expect(hasCapability).toHaveBeenCalledWith(
      expect.anything(),
      CAPABILITY.EMAIL
    );
  });

  it('is a shortcut for requireCapability(EMAIL) — ok when EMAIL granted', async () => {
    vi.mocked(getLicenseFromRequest).mockResolvedValue({
      userId: 'user-email',
      capabilities: [CAPABILITY.EMAIL],
    } as never);
    vi.mocked(hasCapability).mockReturnValue(true);

    const result = await requireEmailEntitlement(
      makeRequest('Bearer good.jwt.token')
    );

    expect(result.ok).toBe(true);
    expect(result.ctx?.userId).toBe('user-email');
    expect(hasCapability).toHaveBeenCalledWith(
      expect.anything(),
      CAPABILITY.EMAIL
    );
  });
});

// Touch the unused imports so TypeScript/Vitest don't drop them — they exist
// to document the mock surface required by the entitlement module.
void verifyUpGPTLicense;
void getCurrentUser;
