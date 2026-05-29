/**
 * In-memory rate limiter for API routes.
 *
 * Per-IP and per-user sliding-window counters backed by a simple Map.
 *
 * NOTE: This is a SINGLE-INSTANCE in-memory implementation. Counters live in
 * the Node.js process, so they are NOT shared across multiple servers, edge
 * workers, or PM2 cluster workers. For multi-instance deployments, swap the
 * internal store for a Redis-backed equivalent (e.g. ioredis + ZADD/ZREMRANGEBYSCORE
 * for a true distributed sliding window). The exported interface
 * (checkRateLimit / getRateLimitFromRequest / middlewareCheck) is designed to
 * stay identical across implementations so call sites do not change.
 */

export interface RateLimitConfig {
  /** Sliding window size in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed within the window. */
  maxRequests: number;
  /** Namespace for this limit (separates counters for different routes). */
  identifier: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Epoch ms at which the oldest in-window request will expire. */
  resetAt: number;
  /** If !allowed, ms until the caller can retry. */
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Map of composite key (`${identifier}:${key}`) -> ordered list of request
 * timestamps (epoch ms) within the active window. Older timestamps are evicted
 * lazily on access and periodically by the GC tick.
 */
const buckets = new Map<string, number[]>();

/**
 * Largest window we have seen so we know how far back the GC tick has to look.
 * Anything older than `now - maxWindowMs` is guaranteed to be stale.
 */
let maxWindowMs = 0;

const GC_INTERVAL_MS = 60_000;

function startGcTick(): void {
  // Avoid keeping the Node event loop alive just for GC.
  const handle = setInterval(() => {
    const now = Date.now();
    const cutoff = now - maxWindowMs;
    for (const [k, timestamps] of buckets) {
      // Drop entries older than the largest window we know about.
      let i = 0;
      while (i < timestamps.length && timestamps[i] <= cutoff) i++;
      if (i === timestamps.length) {
        buckets.delete(k);
      } else if (i > 0) {
        buckets.set(k, timestamps.slice(i));
      }
    }
  }, GC_INTERVAL_MS);
  if (typeof handle.unref === 'function') handle.unref();
}

// Start GC once per process load.
startGcTick();

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Check (and record) a request against the sliding window for `key`.
 * The current call counts toward the limit when allowed.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const { windowMs, maxRequests, identifier } = config;
  if (windowMs > maxWindowMs) maxWindowMs = windowMs;

  const compositeKey = `${identifier}:${key}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = buckets.get(compositeKey) ?? [];

  // Evict timestamps that have fallen out of the window.
  let firstFresh = 0;
  while (firstFresh < existing.length && existing[firstFresh] <= windowStart) {
    firstFresh++;
  }
  const inWindow = firstFresh === 0 ? existing : existing.slice(firstFresh);

  if (inWindow.length >= maxRequests) {
    // Not allowed. resetAt = when the oldest in-window request expires.
    const oldest = inWindow[0];
    const resetAt = oldest + windowMs;
    const retryAfterMs = Math.max(0, resetAt - now);
    // Persist the cleaned list so we don't keep ancient timestamps forever.
    buckets.set(compositeKey, inWindow);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs,
    };
  }

  // Allowed: record this request.
  inWindow.push(now);
  buckets.set(compositeKey, inWindow);

  const remaining = maxRequests - inWindow.length;
  const resetAt = inWindow[0] + windowMs;

  return {
    allowed: true,
    remaining,
    resetAt,
  };
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * Extract a best-effort client IP from a `Request` using standard proxy headers.
 * Falls back to "unknown" when nothing usable is present.
 */
function extractIp(request: Request): string {
  const h = request.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    h.get('true-client-ip') ||
    h.get('fly-client-ip') ||
    'unknown'
  );
}

/**
 * Best-effort user id extraction.
 *
 * We avoid pulling in a full auth dependency here so the rate limiter stays
 * cheap and side-effect free. Callers that already have a resolved user id
 * should prefer to inject it via the `x-user-id` header (set by upstream
 * middleware) or pass a custom key directly to `checkRateLimit`.
 */
function extractUserId(request: Request): string | null {
  const headerUser = request.headers.get('x-user-id');
  if (headerUser) return headerUser;

  // Try to read a non-HttpOnly session hint cookie if present. We deliberately
  // do NOT decode JWTs here — that belongs in the auth layer.
  const cookie = request.headers.get('cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/**
 * Build a composite rate-limit key from a `Request`: `${prefix}:${ip}:${user}`.
 *
 * The `prefix` lets callers distinguish logically separate limits even when
 * they share an identifier namespace. The IP+user combination means an
 * authenticated user shares a bucket across IPs (and an anonymous user is
 * bucketed by IP alone).
 */
export function getRateLimitFromRequest(
  request: Request,
  prefix: string,
): string {
  const ip = extractIp(request);
  const userId = extractUserId(request) ?? 'anon';
  return `${prefix}:${ip}:${userId}`;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * If the request is rate limited, returns a ready-to-send 429 `Response`.
 * Otherwise records the request and returns `null` so the caller can proceed.
 */
export function middlewareCheck(
  request: Request,
  config: RateLimitConfig,
): Response | null {
  const key = getRateLimitFromRequest(request, config.identifier);
  const result = checkRateLimit(key, config);

  if (result.allowed) {
    return null;
  }

  const retryAfterSec = Math.max(1, Math.ceil((result.retryAfterMs ?? 0) / 1000));
  const body = {
    error: 'rate_limited',
    message: 'Too many requests. Please slow down and try again.',
    retry_after_ms: result.retryAfterMs,
    reset_at: result.resetAt,
  };

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': String(retryAfterSec),
      'x-ratelimit-limit': String(config.maxRequests),
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
    },
  });
}

// ---------------------------------------------------------------------------
// Preset configurations
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

/** 30 requests / hour per user — POST /api/ai/draft */
export const AI_DRAFT_LIMIT: RateLimitConfig = {
  windowMs: HOUR_MS,
  maxRequests: 30,
  identifier: 'ai:draft',
};

/** 10 requests / hour per user — POST /api/ai/test */
export const AI_TEST_LIMIT: RateLimitConfig = {
  windowMs: HOUR_MS,
  maxRequests: 10,
  identifier: 'ai:test',
};

/** 5 requests / hour per IP — POST /api/accounts/connect */
export const ACCOUNTS_CONNECT_LIMIT: RateLimitConfig = {
  windowMs: HOUR_MS,
  maxRequests: 5,
  identifier: 'accounts:connect',
};

// ---------------------------------------------------------------------------
// Test / introspection helpers
// ---------------------------------------------------------------------------

/** Clear all buckets. Intended for tests only. */
export function __resetRateLimiter(): void {
  buckets.clear();
  maxWindowMs = 0;
}
