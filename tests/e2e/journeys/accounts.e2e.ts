import { randomUUID } from 'node:crypto';
import { test, expect } from '@/tests/e2e/fixtures.ts';
import { fillOtp, getPasswordResetCode, signUpAndVerify } from '@/tests/e2e/helpers.ts';

test.describe('New accounts', () => {
  test('a new user verifies their email, then walks through onboarding', async ({ page }) => {
    await signUpAndVerify(page, `onboard_${randomUUID().slice(0, 8)}@example.com`, 'password1234');
    await expect(page.getByRole('heading', { name: 'Welcome to Arkyvree' })).toBeVisible({ timeout: 10_000 });
    for (let step = 0; step < 4; step++) await page.getByRole('button', { name: /^Next$/ }).click();
    await page.getByRole('button', { name: /^Get Started$/ }).click();

    // The dashboard's own heading shares the welcome.
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Welcome to Arkyvree', level: 1 })).toBeVisible();
  });

  test('a user who forgot their password resets it with the code they were sent', async ({ page }) => {
    const email = `forgot_${randomUUID().slice(0, 8)}@example.com`;
    const newPassword = 'brandNewPass5678';
    await signUpAndVerify(page, email, 'password1234');
    await page.getByRole('button', { name: /^Skip$/ }).click();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();
    await page.waitForURL('/sign-in', { timeout: 10_000 });

    await page.getByRole('link', { name: /Forgot password\?/ }).click();
    // Fill once the form is there, not the sign-in form it replaces.
    await expect(page.getByRole('heading', { name: /Forgot Password/ })).toBeVisible();
    await page.fill('input[name="emailAddress"]', email);
    await page.getByRole('button', { name: /Send Reset Code/ }).click();
    await page.waitForURL('/reset-password', { timeout: 10_000 });
    await fillOtp(page, await getPasswordResetCode(email));
    await page.fill('input[name="newPassword"]', newPassword);
    await page.fill('input[name="newPasswordConfirmation"]', newPassword);
    await page.getByRole('button', { name: /Reset Password/ }).click();
    await page.waitForURL('/sign-in', { timeout: 10_000 });

    await page.fill('input[name="emailAddress"]', email);
    await page.fill('input[name="password"]', newPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10_000 });
  });
});
