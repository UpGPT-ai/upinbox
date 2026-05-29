/**
 * Tests for src/middleware.ts CORS behavior.
 *
 * The middleware applies permissive CORS headers to /api/upinbox/* paths so
 * the UpLink mobile app and other first-party clients can connect to
 * self-hosted UpInbox instances from arbitrary origins.
 *
 * These tests focus on:
 *   1. OPTIONS preflight → 204 + CORS headers (no Supabase call)
 *   2. CORS header completeness (Origin, Methods, Headers)
 *   3. Non-API paths passing through without CORS headers attached
 *   4. Authorization header whitelisted in Allow-Headers (mobile bearer tokens)
 *
 * NextRequest is constructed via the real `next/server` export — Vitest's
 * node environment supplies the Web Fetch primitives Next relies on. Supabase
 * is mocked globally in src/__tests__/setup.ts so the middleware's session
 * refresh becomes a no-op returning `user: null`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function makeRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(new URL(url), {
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
  });
}

describe('middleware — CORS for /api/upinbox/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OPTIONS preflight', () => {
    it('returns 204 for OPTIONS /api/upinbox/*', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'OPTIONS',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);

      expect(res).toBeDefined();
      expect(res!.status).toBe(204);
    });

    it('echoes the request Origin in Access-Control-Allow-Origin', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/threads', {
        method: 'OPTIONS',
        headers: { origin: 'https://mobile.uplink.app' },
      });

      const res = await middleware(req);

      expect(res!.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://mobile.uplink.app'
      );
    });

    it('falls back to wildcard when no Origin header is present', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'OPTIONS',
      });

      const res = await middleware(req);

      expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('includes Access-Control-Allow-Methods covering GET/POST/PATCH/DELETE/OPTIONS', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'OPTIONS',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);
      const methods = res!.headers.get('Access-Control-Allow-Methods') ?? '';

      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PATCH');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('OPTIONS');
    });

    it('whitelists Authorization in Access-Control-Allow-Headers', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'OPTIONS',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);
      const headers = res!.headers.get('Access-Control-Allow-Headers') ?? '';

      expect(headers).toContain('Authorization');
    });

    it('whitelists Content-Type in Access-Control-Allow-Headers', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'OPTIONS',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);
      const headers = res!.headers.get('Access-Control-Allow-Headers') ?? '';

      expect(headers).toContain('Content-Type');
    });

    it('sets Vary: Origin so caches respect per-origin responses', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'OPTIONS',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);

      expect(res!.headers.get('Vary')).toBe('Origin');
    });

    it('caches preflight for 24h via Access-Control-Max-Age', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'OPTIONS',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);

      expect(res!.headers.get('Access-Control-Max-Age')).toBe('86400');
    });
  });

  describe('GET /api/upinbox/* — actual requests carry CORS', () => {
    it('attaches CORS headers to non-preflight responses on /api/upinbox/*', async () => {
      const req = makeRequest('https://app.example.com/api/upinbox/messages', {
        method: 'GET',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);

      expect(res).toBeDefined();
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://uplink.app'
      );
      expect(res!.headers.get('Access-Control-Allow-Headers') ?? '').toContain(
        'Authorization'
      );
    });
  });

  describe('Non-API paths', () => {
    it('does not attach CORS headers to non-/api/upinbox responses', async () => {
      const req = makeRequest('https://app.example.com/inbox', {
        method: 'GET',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);

      // /inbox is a protected route with no user → redirect to /login.
      // Either way, the CORS header must not be set on non-/api/upinbox paths.
      expect(res).toBeDefined();
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res!.headers.get('Access-Control-Allow-Methods')).toBeNull();
    });

    it('does not attach CORS headers to other API routes (e.g. /api/auth)', async () => {
      const req = makeRequest('https://app.example.com/api/auth/callback', {
        method: 'GET',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);

      expect(res).toBeDefined();
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does not match OPTIONS on non-/api/upinbox paths as preflight', async () => {
      const req = makeRequest('https://app.example.com/api/auth/callback', {
        method: 'OPTIONS',
        headers: { origin: 'https://uplink.app' },
      });

      const res = await middleware(req);

      // Should fall through normal middleware flow, not return 204 preflight
      // with CORS headers scoped to upinbox.
      expect(res!.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });
});
