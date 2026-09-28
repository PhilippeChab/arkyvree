import { test, expect } from '@/tests/fixtures/auth.fixture';
import { TEST_USERS } from '@/tests/fixtures/auth.fixture';
import { fillOtp, getEmailVerificationCode, signIn } from '@/tests/e2e/helpers.ts';

test.describe('Profile Editing', () => {
  test('opens from the account menu, with the user\'s email', async ({ page }) => {
    await page.goto('/dashboard');
    await page.locator('[data-testid="AccountCircleIcon"]').first().click();
    await page.getByRole('menuitem', { name: 'Profile' }).click();
    await page.waitForURL('/profile');
    await expect(page.locator('input[name="emailAddress"]')).toHaveValue(TEST_USERS.user1.email);
  });

  test('saves a new username', async ({ page }) => {
    await page.goto('/profile');
    const username = `testuser_${Date.now()}`;
    await page.fill('input[name="username"]', username);
    await page.locator('form').filter({ hasText: 'Username' }).locator('button[type="submit"]').click();
    await expect(page.locator('text=/Profile updated successfully/i')).toBeVisible({ timeout: 5000 });
    await page.reload();
    await expect(page.locator('input[name="username"]')).toHaveValue(username);
  });

  for (const [what, email, error] of [
    ['an invalid email', 'not-an-email', /Please enter a valid email address/i],
    ['an email already in use', TEST_USERS.user2.email, /Email address already in use/i],
  ] as const) {
    test(`refuses ${what}`, async ({ page }) => {
      await page.goto('/profile');
      await page.fill('input[name="emailAddress"]', email);
      await page.locator('form').filter({ hasText: 'Email Address' }).locator('button[type="submit"]').click();
      await expect(page.getByText(error)).toBeVisible({ timeout: 5000 });
    });
  }

  for (const [what, current, password, confirmation, error] of [
    ['a wrong current password', 'wrongpassword', 'newpassword1234', 'newpassword1234', /Current password is incorrect/i],
    ['new passwords that differ', TEST_USERS.user1.password, 'newpassword1234', 'differentpassword', /Passwords do not match/i],
    ['a short new password', TEST_USERS.user1.password, 'short', 'short', /Password must be at least 12 characters/i],
  ] as const) {
    test(`refuses ${what}`, async ({ page }) => {
      await page.goto('/profile');
      await page.fill('input[name="currentPassword"]', current);
      await page.fill('input[name="newPassword"]', password);
      await page.fill('input[name="newPasswordConfirmation"]', confirmation);
      await page.locator('form').filter({ hasText: 'Current Password' }).locator('button[type="submit"]').click();
      await expect(page.getByText(error)).toBeVisible({ timeout: 5000 });
    });
  }
});

/**
 * Email and password update flows mutate user state and break other tests
 * that sign in with the original credentials. We use testuser3 (which no
 * other test depends on for storageState) and restore the original values
 * inside each test so the run remains independent of order.
 */
test.describe('Profile Editing (mutating, isolated user)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('email change verifies via OTP and updates the email, then restores', async ({ page }) => {
    // Uses testuser2 so the password test (which signs in as user3 in
    // the same describe) doesn't share state with the email mutations
    // here. testuser2 has no other consumers in the e2e suite.
    await signIn(page, TEST_USERS.user2.email, TEST_USERS.user2.password);
    await page.goto('/profile');
    await page.waitForSelector('input[name="emailAddress"]');

    const uniqueEmail = `testuser2_${Date.now()}@example.com`;
    await page.fill('input[name="emailAddress"]', uniqueEmail);
    const saveButton = page.locator('form').filter({ hasText: 'Email Address' }).locator('button[type="submit"]');
    await saveButton.click();

    // Email change is gated by an OTP step — server returns pendingEmailAddress
    // and the app shows a verification snackbar, a pending banner, and opens a dialog.
    await expect(page.locator('text=/Verification code sent/i')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/Pending email change/i')).toBeVisible();

    // Read the OTP from the test DB (account.email_verifications keyed by user_id;
    // the user's email_address is still the original at this point).
    const code = await getEmailVerificationCode(TEST_USERS.user2.email);

    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog.getByText('Verify New Email')).toBeVisible();
    await fillOtp(dialog, code);
    await dialog.getByRole('button', { name: /^Verify$/ }).click();

    await expect(page.locator('text=/Email address updated successfully/i')).toBeVisible({ timeout: 5000 });
    // Wait for the dialog to close and the form to re-populate from auth/me.
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
    await expect(page.locator('input[name="emailAddress"]')).toHaveValue(uniqueEmail);
    await expect(page.locator('text=/Pending email change/i')).toHaveCount(0);

    // Restore: change email back to the seed value so subsequent runs keep working.
    // The "Verification code sent" snackbar is queued behind the previous
    // "Email address updated" one and may auto-dismiss before we can poll
    // it. Assert the verify dialog opens instead — that's the same
    // success signal and is sticky until the user dismisses it.
    await page.fill('input[name="emailAddress"]', TEST_USERS.user2.email);
    await page.locator('form').filter({ hasText: 'Email Address' }).locator('button[type="submit"]').click();
    const restoreDialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(restoreDialog.getByText('Verify New Email')).toBeVisible({ timeout: 10_000 });

    const restoreCode = await getEmailVerificationCode(uniqueEmail);
    await fillOtp(restoreDialog, restoreCode);
    await restoreDialog.getByRole('button', { name: /^Verify$/ }).click();

    await expect(page.locator('text=/Email address updated successfully/i')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[name="emailAddress"]')).toHaveValue(TEST_USERS.user2.email);
  });

  test('should update password and sign in with the new one, then restore', async ({ page }) => {
    await signIn(page, TEST_USERS.user3.email, TEST_USERS.user3.password);
    await page.goto('/profile');
    await page.waitForSelector('input[name="currentPassword"]');

    const newPassword = `newpass_${Date.now()}_xx`;

    await page.fill('input[name="currentPassword"]', TEST_USERS.user3.password);
    await page.fill('input[name="newPassword"]', newPassword);
    await page.fill('input[name="newPasswordConfirmation"]', newPassword);

    let updateButton = page.locator('form').filter({ hasText: 'Current Password' }).locator('button[type="submit"]');
    await updateButton.click();

    await expect(page.locator('text=/Password updated successfully/i')).toBeVisible({ timeout: 5000 });

    // Sign out via account menu, sign back in with the new password.
    // Clear context cookies + reload after sign-out to defeat any
    // lingering auth-storage cached from the prior session — without
    // that defense, the form-fill before submit can race the route
    // probe and submit against stale credentials.
    await page.locator('[data-testid="AccountCircleIcon"]').first().click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();
    await page.waitForURL('/sign-in');
    await page.context().clearCookies();
    await page.goto('/sign-in');

    await page.fill('input[name="emailAddress"]', TEST_USERS.user3.email);
    await page.fill('input[name="password"]', newPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');

    // Restore original password so subsequent runs work with TEST_USERS.user3.password
    await page.goto('/profile');
    await page.waitForSelector('input[name="currentPassword"]');
    await page.fill('input[name="currentPassword"]', newPassword);
    await page.fill('input[name="newPassword"]', TEST_USERS.user3.password);
    await page.fill('input[name="newPasswordConfirmation"]', TEST_USERS.user3.password);
    updateButton = page.locator('form').filter({ hasText: 'Current Password' }).locator('button[type="submit"]');
    await updateButton.click();
    await expect(page.locator('text=/Password updated successfully/i')).toBeVisible({ timeout: 5000 });
  });
});
