import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  checkRateLimit,
  getRateLimitFromRequest,
  __resetRateLimiter,
  type RateLimitConfig,
} from '@/lib/rate-limit';

const CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 3,
  identifier: 'test:limit',
};

describe('checkRateLimit', () => {
  beforeEach(() => {
    __resetRateLimiter();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetRateLimiter();
  });

  it('allows the first N requests within the window', () => {
    const r1 = checkRateLimit('user-1', CONFIG);
    const r2 = checkRateLimit('user-1', CONFIG);
    const r3 = checkRateLimit('user-1', CONFIG);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('blocks the N+1th request', () => {
    checkRateLimit('user-2', CONFIG);
    checkRateLimit('user-2', CONFIG);
    checkRateLimit('user-2', CONFIG);

    const blocked = checkRateLimit('user-2', CONFIG);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(CONFIG.windowMs);
  });

  it('returns remaining count correctly as requests accumulate', () => {
    const r1 = checkRateLimit('user-3', CONFIG);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit('user-3', CONFIG);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit('user-3', CONFIG);
    expect(r3.remaining).toBe(0);

    const r4 = checkRateLimit('user-3', CONFIG);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it('resets the counter after the window expires', () => {
    // Fill the bucket.
    checkRateLimit('user-4', CONFIG);
    checkRateLimit('user-4', CONFIG);
    checkRateLimit('user-4', CONFIG);

    const blocked = checkRateLimit('user-4', CONFIG);
    expect(blocked.allowed).toBe(false);

    // Advance past the sliding window.
    vi.advanceTimersByTime(CONFIG.windowMs + 1);

    const afterWindow = checkRateLimit('user-4', CONFIG);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(CONFIG.maxRequests - 1);
  });

  it('isolates buckets across different keys', () => {
    checkRateLimit('user-a', CONFIG);
    checkRateLimit('user-a', CONFIG);
    checkRateLimit('user-a', CONFIG);

    const otherUser = checkRateLimit('user-b', CONFIG);
    expect(otherUser.allowed).toBe(true);
    expect(otherUser.remaining).toBe(CONFIG.maxRequests - 1);
  });

  it('isolates buckets across different identifiers', () => {
    const cfgA: RateLimitConfig = { ...CONFIG, identifier: 'route:a' };
    const cfgB: RateLimitConfig = { ...CONFIG, identifier: 'route:b' };

    checkRateLimit('shared-key', cfgA);
    checkRateLimit('shared-key', cfgA);
    checkRateLimit('shared-key', cfgA);

    const sameKeyDifferentRoute = checkRateLimit('shared-key', cfgB);
    expect(sameKeyDifferentRoute.allowed).toBe(true);
  });
});

describe('getRateLimitFromRequest', () => {
  beforeEach(() => {
    __resetRateLimiter();
  });

  afterEach(() => {
    __resetRateLimiter();
  });

  it('builds a key combining prefix, IP, and anon user', () => {
    const req = new Request('https://example.com/api/ai/draft', {
      headers: { 'x-forwarded-for': '203.0.113.5' },
    });

    const key = getRateLimitFromRequest(req, 'ai:draft');
    expect(key).toBe('ai:draft:203.0.113.5:anon');
  });

  it('uses x-user-id when present', () => {
    const req = new Request('https://example.com/api/ai/draft', {
      headers: {
        'x-forwarded-for': '203.0.113.5',
        'x-user-id': 'user-42',
      },
    });

    const key = getRateLimitFromRequest(req, 'ai:draft');
    expect(key).toBe('ai:draft:203.0.113.5:user-42');
  });

  it('falls back through proxy headers when x-forwarded-for is absent', () => {
    const req = new Request('https://example.com/api/accounts/connect', {
      headers: { 'x-real-ip': '198.51.100.7' },
    });

    const key = getRateLimitFromRequest(req, 'accounts:connect');
    expect(key).toBe('accounts:connect:198.51.100.7:anon');
  });

  it('uses "unknown" IP when no proxy headers are present', () => {
    const req = new Request('https://example.com/api/x');
    const key = getRateLimitFromRequest(req, 'p');
    expect(key).toBe('p:unknown:anon');
  });

  it('produces different keys for different paths/prefixes (path-based isolation)', () => {
    const headers = { 'x-forwarded-for': '203.0.113.5' };
    const req1 = new Request('https://example.com/api/a', { headers });
    const req2 = new Request('https://example.com/api/b', { headers });

    const k1 = getRateLimitFromRequest(req1, 'route:a');
    const k2 = getRateLimitFromRequest(req2, 'route:b');

    expect(k1).not.toBe(k2);
    expect(k1.startsWith('route:a:')).toBe(true);
    expect(k2.startsWith('route:b:')).toBe(true);
  });

  it('takes the first IP from a comma-separated x-forwarded-for chain', () => {
    const req = new Request('https://example.com/api/x', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' },
    });
    const key = getRateLimitFromRequest(req, 'p');
    expect(key).toBe('p:203.0.113.5:anon');
  });
});
