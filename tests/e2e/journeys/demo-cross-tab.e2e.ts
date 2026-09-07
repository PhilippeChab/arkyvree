import { test, expect } from '@playwright/test';

/**
 * Cross-tab demo cascade:
 *  - Tab A starts a demo (cookie set on the shared context)
 *  - Tab B opens /sign-in; AuthLayoutRoute's effect calls signOut(),
 *    which hard-deletes the demo user server-side
 *  - Tab A's next API call returns 401; handleGlobalError sees
 *    user.expiresAt and sets DEMO_EXPIRED_FLAG before clearSession()
 *  - PrivateRoute then routes Tab A to /demo-expired
 */
test.describe('Demo cross-tab', () => {
  test('opening /sign-in in another tab kills the demo session in the original tab', async ({ browser }) => {
    test.setTimeout(60_000);

    const context = await browser.newContext();
    try {
      // ── Tab A: start a demo session ──
      const tabA = await context.newPage();
      await tabA.goto('/sign-in');
      await tabA.getByRole('button', { name: /Try the demo/ }).click();
      await tabA.waitForURL('/dashboard', { timeout: 15_000 });
      await expect(tabA.getByText(/Demo mode/)).toBeVisible({ timeout: 10_000 });

      // ── Tab B: opening /sign-in triggers the demo signOut effect ──
      const tabB = await context.newPage();
      await tabB.goto('/sign-in');
      // Wait for the sign-in form to actually render (post-signOut), so we
      // know the server-side hard-delete has completed before poking Tab A.
      await expect(tabB.getByRole('button', { name: /^Sign In$/ })).toBeVisible({ timeout: 15_000 });

      // ── Tab A: any in-app interaction now hits the dead session ──
      // The Zustand `auth-storage` persist write from Tab B's signOut
      // propagates to Tab A through the storage event, so Tab A may end
      // up either at /demo-expired (if `handleGlobalError` runs first
      // and sets the flag while user.expiresAt is still in the store)
      // or at /sign-in (if the cross-tab clearSession beats the API
      // 401 handler). Both outcomes prove the demo died — assert either.
      await tabA.bringToFront();
      await tabA.goto('/rulesets');

      await tabA.waitForURL(/\/(demo-expired|sign-in)/, { timeout: 15_000 });
      await expect(tabA.getByText(/Demo mode/)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
