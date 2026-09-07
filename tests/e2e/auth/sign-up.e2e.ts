import { test, expect } from '@/tests/fixtures/auth.fixture';
import { TEST_USERS } from '@/tests/fixtures/auth.fixture';

test.describe('Sign Up', () => {
  test('should sign up successfully and redirect to verify-email', async ({ page }) => {
    await page.goto('/sign-up');

    // Generate unique email to avoid conflicts
    const uniqueEmail = `newuser-${Date.now()}@example.com`;
    const password = 'password1234';

    // Fill in the sign-up form
    await page.fill('input[name="emailAddress"]', uniqueEmail);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="passwordConfirmation"]', password);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for redirect to verify-email page
    await page.waitForURL('/verify-email');

    // Verify we're on the verify-email page
    await expect(page).toHaveURL('/verify-email');
  });

  test('should show validation error for empty form submission', async ({ page }) => {
    await page.goto('/sign-up');

    // Submit empty form
    await page.click('button[type="submit"]');

    // Should stay on sign-up page
    await expect(page).toHaveURL('/sign-up');

    // Should show required field errors
    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('should show validation error for invalid email format', async ({ page }) => {
    await page.goto('/sign-up');

    // Fill in form with invalid email
    await page.fill('input[name="emailAddress"]', 'not-an-email');
    await page.fill('input[name="password"]', 'password1234');
    await page.fill('input[name="passwordConfirmation"]', 'password1234');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should stay on sign-up page
    await expect(page).toHaveURL('/sign-up');

    // Should show validation error
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible();
  });

  test('should show validation error for password too short', async ({ page }) => {
    await page.goto('/sign-up');

    const uniqueEmail = `newuser-${Date.now()}@example.com`;

    // Fill in form with short password
    await page.fill('input[name="emailAddress"]', uniqueEmail);
    await page.fill('input[name="password"]', '12345');
    await page.fill('input[name="passwordConfirmation"]', '12345');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should stay on sign-up page
    await expect(page).toHaveURL('/sign-up');

    // Should show validation error
    await expect(page.locator('text=Password must be at least 12 characters')).toBeVisible();
  });

  test('should show validation error for non-matching passwords', async ({ page }) => {
    await page.goto('/sign-up');

    const uniqueEmail = `newuser-${Date.now()}@example.com`;

    // Fill in form with non-matching passwords
    await page.fill('input[name="emailAddress"]', uniqueEmail);
    await page.fill('input[name="password"]', 'password1234');
    await page.fill('input[name="passwordConfirmation"]', 'different123');

    // Trigger validation by clicking outside or submitting
    await page.click('button[type="submit"]');

    // Should stay on sign-up page
    await expect(page).toHaveURL('/sign-up');

    // Should show password mismatch error
    await expect(page.locator('text=Passwords do not match')).toBeVisible();
  });

  test('should show error for duplicate email', async ({ page }) => {
    await page.goto('/sign-up');

    // Try to sign up with existing user email
    await page.fill('input[name="emailAddress"]', TEST_USERS.user1.email);
    await page.fill('input[name="password"]', 'password1234');
    await page.fill('input[name="passwordConfirmation"]', 'password1234');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should stay on sign-up page
    await expect(page).toHaveURL('/sign-up');

    // Should show error message
    await expect(page.locator('text=/email already in use/i')).toBeVisible();
  });

  test('should navigate to sign-in page from link', async ({ page }) => {
    await page.goto('/sign-up');

    // Click the "Sign in" link
    await page.click('text=Sign in');

    // Should redirect to sign-in page
    await expect(page).toHaveURL('/sign-in');
  });

  test('should navigate to sign-up page from sign-in page', async ({ page }) => {
    await page.goto('/sign-in');

    // Click the "Sign up" link
    await page.click('text=Sign up');

    // Should redirect to sign-up page
    await expect(page).toHaveURL('/sign-up');
  });
});
