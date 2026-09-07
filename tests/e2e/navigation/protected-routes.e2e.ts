import { test, expect } from '@/tests/fixtures/auth.fixture';

test.describe('Protected Routes - Authenticated', () => {
  const protectedRoutes = [
    '/dashboard',
    '/campaigns',
    '/characters',
    '/rulesets',
  ];

  for (const route of protectedRoutes) {
    test(`should allow access to ${route} when authenticated`, async ({ page }) => {
      // Navigate to protected route with authentication
      await page.goto(route);

      // Should stay on the route (not redirect to sign-in)
      await expect(page).toHaveURL(route);
    });
  }
});
