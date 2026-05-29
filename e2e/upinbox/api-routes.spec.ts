import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';

test.describe('UpInbox API routes', () => {
  test('GET /api/upinbox/accounts unauth returns 401/403/200', async ({ request }) => {
    const res = await request.get(`${BASE}/api/upinbox/accounts`);
    expect([200, 401, 403]).toContain(res.status());
  });

  test('POST /api/upinbox/accounts/connect unauth returns 401/402/403', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upinbox/accounts/connect`, {
      data: {},
    });
    expect([401, 402, 403]).toContain(res.status());
  });

  test('POST /api/upinbox/ai/test with empty key returns ok:false or error', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upinbox/ai/test`, {
      data: { apiKey: '' },
    });
    expect(res.status()).toBeLessThan(500);
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    expect(body).not.toBeNull();
    const hasOkFalse = body && body.ok === false;
    const hasError = body && (body.error !== undefined || body.message !== undefined);
    expect(hasOkFalse || hasError).toBeTruthy();
  });

  test('POST /api/upinbox/ai/draft minimal body returns status under 500', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upinbox/ai/draft`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('POST /api/upinbox/mcp without token returns 401/403/200', async ({ request }) => {
    const res = await request.post(`${BASE}/api/upinbox/mcp`, {
      data: {},
    });
    expect([200, 401, 403]).toContain(res.status());
  });

  test('GET /api/upinbox/proxy with non-tracker URL returns 200/502/404', async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/upinbox/proxy?url=${encodeURIComponent('https://example.com/image.png')}`
    );
    expect([200, 404, 502]).toContain(res.status());
  });
});
