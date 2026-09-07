import { test, expect } from '@playwright/test';

test.describe('Protected Routes - Unauthenticated', () => {
  const protectedRoutes = [
    '/dashboard',
    '/campaigns',
    '/characters',
  ];

  for (const route of protectedRoutes) {
    test(`should redirect ${route} to sign-in when not authenticated`, async ({ page }) => {
      // Navigate to protected route without authentication
      await page.goto(route);

      // Should redirect to sign-in page (may include ?redirect= query param)
      await page.waitForURL(/\/sign-in/, { timeout: 5000 });
      await expect(page).toHaveURL(/\/sign-in/);
    });
  }
});
