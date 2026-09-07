import { test, expect } from '@/tests/fixtures/auth.fixture';

test.describe('Sign Out', () => {
  test('signing out clears the session and redirects to /sign-in', async ({ page }) => {
    await page.goto('/dashboard');

    // Open the account menu (top-right avatar)
    await page.locator('[data-testid="AccountCircleIcon"]').first().click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();

    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10000 });

    // Visiting a protected route bounces back to sign-in
    await page.goto('/characters');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
