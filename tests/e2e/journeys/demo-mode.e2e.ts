import { test, expect } from '@playwright/test';

/**
 * Demo mode lifecycle:
 *  - Guest clicks "Try the demo" on /sign-in
 *  - POST /api/demo/start → /dashboard with the Demo banner
 *  - Demo persists across in-app navigation (/rulesets still authed)
 *  - Visiting /sign-in kills the demo (AuthLayoutRoute hard-deletes
 *    the user server-side); the sign-in form re-renders without
 *    the demo banner
 *
 *  Plus the standalone demo-expired page: direct navigation should
 *  surface the "Your demo has ended" CTA → /sign-up.
 */
test.describe('Demo mode', () => {
  test('start demo from sign-in, persist in app, die on auth-route entry', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/sign-in');
    await page.getByRole('button', { name: /Try the demo/ }).click();

    await page.waitForURL('/dashboard', { timeout: 15_000 });

    // Demo banner is the only signal the demo is live in the layout
    await expect(page.getByText(/Demo mode/)).toBeVisible({ timeout: 10_000 });

    // In-app navigation keeps the demo alive
    await page.goto('/rulesets');
    await expect(page.locator('h6:has-text("Core SRD 3.5")')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Demo mode/)).toBeVisible();

    // Visiting /sign-in (an AuthLayoutRoute page) signs the demo out
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: /^Sign In$/ })).toBeVisible({ timeout: 10_000 });
    // Banner gone — the layout is the public auth shell, not the in-app shell
    await expect(page.getByText(/Demo mode/)).toHaveCount(0);

    // And /dashboard is no longer reachable — the demo session is dead
    await page.goto('/dashboard');
    await page.waitForURL(/\/sign-in/, { timeout: 10_000 });
  });

  test('demo-expired page renders the right messaging and links to sign-up', async ({ page }) => {
    await page.goto('/demo-expired');
    await expect(page.getByRole('heading', { name: /Your demo has ended/ })).toBeVisible();
    await page.getByRole('button', { name: /^Sign up$/ }).click();
    await page.waitForURL('/sign-up', { timeout: 10_000 });
  });

  test('in-app 401 with an expired demo session redirects to /demo-expired', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/sign-in');
    await page.getByRole('button', { name: /Try the demo/ }).click();

    await page.waitForURL('/dashboard', { timeout: 15_000 });
    await expect(page.getByText(/Demo mode/)).toBeVisible({ timeout: 10_000 });

    // Server-side TTL expiry surfaces as a 401 on the next in-app API
    // call. The bell was already mounted on /dashboard so mocking just
    // /api/notifications/unread won't refire — instead, route ALL /api/*
    // to 401 with an `errorName` body so rpc.defaultFetch throws ApiError
    // and `handleGlobalError` (App.tsx) recognises it.
    await page.route('**/api/**', async (route) => {
      // Allow /api/auth/me through so PrivateRoute's authProbe (cached
      // from the demo-start succeed path) doesn't get re-failed and
      // route us to /sign-in instead of /demo-expired.
      if (route.request().url().includes('/auth/me')) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'UnauthenticatedError', message: '' }),
      });
    });

    // Any in-app navigation triggers an API call (rulesets list),
    // which 401s → handleGlobalError sees user.expiresAt → sets the flag →
    // clearSession → PrivateRoute re-renders and navigates to /demo-expired.
    await page.goto('/rulesets');

    await page.waitForURL(/\/demo-expired$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Your demo has ended/ })).toBeVisible();
  });
});
