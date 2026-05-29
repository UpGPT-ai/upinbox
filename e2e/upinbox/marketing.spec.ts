import { test, expect } from '@playwright/test';

test.describe('UpInbox marketing — /pricing', () => {
  test('renders Self-Hosted, Hosted, and UpLink Mobile sections', async ({ page }) => {
    await page.goto('/pricing');

    // Each pricing tier/section should be visible on the page.
    await expect(
      page.getByRole('heading', { name: /self[- ]?hosted/i }).first()
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /hosted/i }).first()
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /uplink\s*mobile/i }).first()
    ).toBeVisible();
  });

  test('has at least one CTA linking to upgpt.ai', async ({ page }) => {
    await page.goto('/pricing');

    const upgptLinks = page.locator('a[href*="upgpt.ai"]');
    await expect(upgptLinks.first()).toBeVisible();
    expect(await upgptLinks.count()).toBeGreaterThan(0);
  });

  test('header navigation is visible', async ({ page }) => {
    await page.goto('/pricing');

    const header = page.locator('header').first();
    await expect(header).toBeVisible();

    // At least one nav element should be present and visible in the header area.
    const nav = page.locator('header nav, nav').first();
    await expect(nav).toBeVisible();
  });

  test('FAQ mentions self-host and uplink', async ({ page }) => {
    await page.goto('/pricing');

    // FAQ section should exist.
    const faqHeading = page
      .getByRole('heading', { name: /faq|frequently asked/i })
      .first();
    await expect(faqHeading).toBeVisible();

    // Page copy should reference both self-host(ing) and UpLink.
    await expect(page.getByText(/self[- ]?host(ing|ed)?/i).first()).toBeVisible();
    await expect(page.getByText(/uplink/i).first()).toBeVisible();
  });
});
