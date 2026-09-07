import { test, expect } from '@/tests/e2e/fixtures.ts';

/**
 * Error Handling and Edge Cases E2E Test
 * Tests: Authentication errors, unauthorized access, network errors
 */
test.describe('Error Handling and Edge Cases', () => {
  test('should prevent unauthorized access to protected routes', async ({ page }) => {
    try {
      // ============================================
      // Try to Access Dashboard Without Login
      // ============================================
      await page.goto('/dashboard');

      // Should redirect to sign-in
      await page.waitForURL(/\/sign-in/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/sign-in/);

      // ============================================
      // Try to Access Characters Without Login
      // ============================================
      await page.goto('/characters');

      // Should redirect to sign-in
      await page.waitForURL(/\/sign-in/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/sign-in/);

      // ============================================
      // Try to Access Campaigns Without Login
      // ============================================
      await page.goto('/campaigns');

      // Should redirect to sign-in
      await page.waitForURL(/\/sign-in/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/sign-in/);
    } finally {
      // Cleanup
    }
  });

  test('should handle invalid login credentials', async ({ page, ownerUser }) => {
    try {
      // ============================================
      // Try to Login with Wrong Password
      // ============================================
      await page.goto('/sign-in');
      await page.fill('input[name="emailAddress"]', ownerUser.email);
      await page.fill('input[name="password"]', 'WrongPassword123!');
      await page.click('button[type="submit"]');

      // Should show error
      await expect(page.locator('text=/invalid|incorrect|wrong|failed/i')).toBeVisible({ timeout: 5000 });

      // Should NOT redirect to dashboard
      await expect(page).not.toHaveURL('/dashboard');

      // ============================================
      // Try to Login with Non-existent Email
      // ============================================
      await page.fill('input[name="emailAddress"]', 'nonexistent@example.com');
      await page.fill('input[name="password"]', 'SomePassword123!');
      await page.click('button[type="submit"]');

      // Should show error
      await expect(page.locator('text=/invalid|incorrect|not found|failed/i')).toBeVisible({ timeout: 5000 });

      // Should NOT redirect to dashboard
      await expect(page).not.toHaveURL('/dashboard');
    } finally {
      // Cleanup
    }
  });

  test('should handle network errors gracefully', async ({ page, ownerUser }) => {
    try {
      // ============================================
      // STEP 1: Login Normally
      // ============================================
      await page.goto('/sign-in');
      await page.fill('input[name="emailAddress"]', ownerUser.email);
      await page.fill('input[name="password"]', ownerUser.password);
      await page.click('button[type="submit"]');

      await page.waitForURL('/dashboard', { timeout: 10000 });

      // ============================================
      // STEP 2: Navigate to characters page
      // ============================================
      await page.goto('/characters');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: /Characters/ })).toBeVisible({ timeout: 10000 });

      // ============================================
      // STEP 3: Simulate Network Offline and Test API Failure
      // ============================================
      await page.context().setOffline(true);

      // Click Create Character — opens the create dialog. While offline, no
      // navigation to /characters/{uuid} can occur because the POST will fail.
      await page.locator('button:has-text("Create Character")').click();

      // The dialog should be visible (button click only opens UI, no network needed yet).
      const dialog = page.locator('[role="dialog"][aria-modal="true"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // The dialog STAYS open while we're offline — the user can't reach the
      // detail page without a successful POST. Asserting the dialog is still
      // visible after a brief settle is more meaningful than a negative URL
      // check (which would also pass if the dialog crashed).
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(/\/characters\b/);
      await expect(page).not.toHaveURL(/\/characters\/[0-9a-f-]{36}/);

      // ============================================
      // STEP 4: Restore Network
      // ============================================
      await page.context().setOffline(false);

      // Should recover - reload the page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: /Characters/ })).toBeVisible({ timeout: 10000 });
    } finally {
      // Ensure network is back online
      await page.context().setOffline(false);
    }
  });

  test('should prevent creating campaign without ruleset', async ({ page, ownerUser }) => {
    const timestamp = Date.now();

    try {
      // Sign in
      await page.goto('/sign-in');
      await page.fill('input[name="emailAddress"]', ownerUser.email);
      await page.fill('input[name="password"]', ownerUser.password);
      await page.click('button[type="submit"]');

      await page.waitForURL('/dashboard', { timeout: 10000 });

      // ============================================
      // Try to Create Campaign Without Ruleset
      // ============================================
      await page.goto('/campaigns');
      await page.waitForLoadState('domcontentloaded');

      await page.waitForSelector('button:has-text("Create New Campaign")', { state: 'visible' });
      await page.click('button:has-text("Create New Campaign")');

      await page.waitForSelector('input[name="name"]', { state: 'visible' });
      await page.fill('input[name="name"]', `Invalid Campaign ${timestamp}`);
      await page.fill('textarea[name="description"]', 'Test');

      // Don't select a ruleset — submit anyway. CreateDialog's submit button reads "Create".
      const dialog = page.locator('[role="dialog"][aria-modal="true"]');
      await dialog.getByRole('button', { name: /^Create$/ }).click();

      // Should show validation error
      await expect(page.locator('text=/required|select.*ruleset/i')).toBeVisible({ timeout: 5000 });
    } finally {
      // Cleanup
    }
  });

  test('should handle session expiration', async ({ page, ownerUser }) => {
    try {
      // ============================================
      // STEP 1: Sign In
      // ============================================
      await page.goto('/sign-in');
      await page.fill('input[name="emailAddress"]', ownerUser.email);
      await page.fill('input[name="password"]', ownerUser.password);
      await page.click('button[type="submit"]');

      await page.waitForURL('/dashboard', { timeout: 10000 });

      // ============================================
      // STEP 2: Clear Session Cookie
      // ============================================
      await page.context().clearCookies();

      // ============================================
      // STEP 3: Try to Access Protected Route
      // ============================================
      await page.goto('/characters');

      // Should redirect to sign-in due to missing session
      await page.waitForURL(/\/sign-in/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/sign-in/);

      // The sign-in form should actually render (not just URL match).
      await expect(page.getByRole('button', { name: /^Sign In$/i })).toBeVisible({ timeout: 5000 });
    } finally {
      // Cleanup
    }
  });
});
