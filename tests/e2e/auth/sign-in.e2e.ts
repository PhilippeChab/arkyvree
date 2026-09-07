import { test, expect } from '@/tests/fixtures/auth.fixture';
import { TEST_USERS } from '@/tests/fixtures/auth.fixture';

test.describe('Sign In', () => {
  test('should sign in with valid credentials and redirect to dashboard', async ({ page }) => {
    await page.goto('/sign-in');

    // Fill in the sign-in form
    await page.fill('input[name="emailAddress"]', TEST_USERS.user1.email);
    await page.fill('input[name="password"]', TEST_USERS.user1.password);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard');

    // Verify we're on the dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/sign-in');

    // Fill in the sign-in form with invalid credentials
    await page.fill('input[name="emailAddress"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should stay on sign-in page
    await expect(page).toHaveURL('/sign-in');

    // Should show error message
    await expect(page.locator('text=/invalid email or password/i')).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.goto('/sign-in');

    // Fill in the sign-in form with invalid email format
    await page.fill('input[name="emailAddress"]', 'not-an-email');
    await page.fill('input[name="password"]', 'LocalTest123!');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should stay on sign-in page
    await expect(page).toHaveURL('/sign-in');

    // Should show validation error (adjust selector based on your UI)
    await expect(page.locator('input[name="emailAddress"]:invalid')).toBeVisible();
  });
});
