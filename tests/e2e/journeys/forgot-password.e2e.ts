import { test, expect } from '@playwright/test';
import { getEmailVerificationCode, getPasswordResetCode, fillOtp } from '@/tests/e2e/helpers.ts';

/**
 * Full forgot-password reset journey:
 *  - Sign up a fresh user, verify email, skip onboarding
 *  - Sign out
 *  - From /sign-in click "Forgot password?"
 *  - Submit email -> land on /reset-password
 *  - Read OTP from account.password_resets, set a new password, submit
 *  - Sign in with the new password and confirm /dashboard loads
 */
test.describe('Forgot Password', () => {
  test('user resets password with OTP and signs in with new password', async ({ page }) => {
    const email = `forgot_${Date.now()}@example.com`;
    const originalPassword = 'password1234';
    const newPassword = 'brandNewPass5678';

    // Sign up
    await page.goto('/sign-up');
    await page.fill('input[name="emailAddress"]', email);
    await page.fill('input[name="password"]', originalPassword);
    await page.fill('input[name="passwordConfirmation"]', originalPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/verify-email', { timeout: 10000 });

    // Verify email
    const verifyCode = await getEmailVerificationCode(email);
    await fillOtp(page, verifyCode);
    await page.getByRole('button', { name: /^Verify$/ }).click();
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Skip onboarding wizard
    await page.getByRole('button', { name: /^Skip$/ }).click();

    // Sign out via account menu
    await page.locator('[data-testid="AccountCircleIcon"]').first().click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();
    await page.waitForURL('/sign-in', { timeout: 10000 });

    // Click "Forgot password?" link
    await page.getByRole('link', { name: /Forgot password\?/ }).click();
    await page.waitForURL('/forgot-password', { timeout: 10000 });

    // Wait for the form to render before filling — without this gate
    // page.fill can race the route transition and target the prior
    // sign-in page's input, leaving the forgot-password form empty
    // and tripping the "Email is required" validation.
    await expect(page.getByRole('heading', { name: /Forgot Password/ })).toBeVisible();

    await page.fill('input[name="emailAddress"]', email);
    await page.getByRole('button', { name: /Send Reset Code/ }).click();
    await page.waitForURL('/reset-password', { timeout: 10000 });

    // The reset page has 8 OTP inputs followed by newPassword + confirmation.
    // Target the OTP inputs by excluding the named password fields.
    const resetCode = await getPasswordResetCode(email);
    expect(resetCode).toMatch(/^\d{8}$/);
    const otpInputs = page.locator('form input:not([name])');
    await expect(otpInputs).toHaveCount(8);
    for (let i = 0; i < resetCode.length; i++) {
      await otpInputs.nth(i).evaluate((el, ch) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, ch);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, resetCode[i]);
    }

    await page.fill('input[name="newPassword"]', newPassword);
    await page.fill('input[name="newPasswordConfirmation"]', newPassword);

    const submitButton = page.getByRole('button', { name: /Reset Password/ });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // On success the page navigates to /sign-in
    await page.waitForURL('/sign-in', { timeout: 10000 });

    // Sign in with the new password to prove the change took
    await page.fill('input[name="emailAddress"]', email);
    await page.fill('input[name="password"]', newPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });
  });
});
