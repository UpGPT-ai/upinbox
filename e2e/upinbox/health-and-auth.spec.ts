import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';

test.describe('UpInbox auth + health', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body).toLowerCase()).toContain('ok');
  });

  test('unauthenticated /inbox redirects or shows login', async ({ page }) => {
    const res = await page.goto(`${BASE}/inbox`, { waitUntil: 'load' });
    expect(res).not.toBeNull();
    const status = res!.status();
    expect([200, 302, 307]).toContain(status);
    // Either we're on a login page, or content references sign-in/login
    const url = page.url().toLowerCase();
    const body = (await page.content()).toLowerCase();
    const looksLikeAuth =
      url.includes('login') ||
      url.includes('signin') ||
      url.includes('auth') ||
      body.includes('sign in') ||
      body.includes('log in') ||
      body.includes('login');
    expect(looksLikeAuth || status !== 200).toBeTruthy();
  });

  test('/pricing renders with Pricing h1 and capability words', async ({ page }) => {
    await page.goto(`${BASE}/pricing`, { waitUntil: 'load' });
    await expect(page.locator('h1', { hasText: /pricing/i }).first()).toBeVisible();
    const body = (await page.content()).toLowerCase();
    expect(body).toContain('email');
    expect(body).toContain('mcp');
    expect(body).toContain('byok');
  });

  test('/manifest.json has UpInbox name and non-empty icons array', async ({ request }) => {
    const res = await request.get(`${BASE}/manifest.json`);
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(String(manifest.name ?? '')).toMatch(/UpInbox/i);
    expect(Array.isArray(manifest.icons)).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('/sw.js includes addEventListener', async ({ request }) => {
    const res = await request.get(`${BASE}/sw.js`);
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    expect(text).toContain('addEventListener');
  });

  test('/offline.html includes "offline"', async ({ request }) => {
    const res = await request.get(`${BASE}/offline.html`);
    expect(res.ok()).toBeTruthy();
    const text = (await res.text()).toLowerCase();
    expect(text).toContain('offline');
  });
});
