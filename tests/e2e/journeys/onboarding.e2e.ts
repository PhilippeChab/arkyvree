import { test, expect } from '@playwright/test';
import { getEmailVerificationCode, fillOtp } from '@/tests/e2e/helpers.ts';

/**
 * Onboarding journey for a freshly signed-up user:
 *  - Sign up
 *  - Verify email with the OTP read from the DB (no real mailer)
 *  - Land on /dashboard with the onboarding wizard auto-opened
 *  - Walk through all 5 steps, then click Get Started
 *  - Wizard closes, dashboard visible
 */
test.describe('Onboarding Wizard', () => {
  test('new user verifies email and walks through onboarding', async ({ page }) => {
    const email = `onboard_${Date.now()}@example.com`;
    const password = 'password1234';

    // Sign up
    await page.goto('/sign-up');
    await page.fill('input[name="emailAddress"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="passwordConfirmation"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/verify-email', { timeout: 10000 });

    // Read the OTP from the DB and verify
    const code = await getEmailVerificationCode(email);
    expect(code).toMatch(/^\d{8}$/);
    await fillOtp(page, code);
    await page.getByRole('button', { name: /^Verify$/ }).click();
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Onboarding wizard is shown — first step is the Welcome card
    await expect(page.getByRole('heading', { name: 'Welcome to Arkyvree' })).toBeVisible({ timeout: 10000 });

    // Click Next four times to advance through the popper steps
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: /^Next$/ }).click();
    }

    // Last step: Get Started
    await page.getByRole('button', { name: /^Get Started$/ }).click();

    // Wizard closes — Welcome heading is gone
    await expect(page.getByRole('heading', { name: 'Welcome to Arkyvree' })).toHaveCount(0);
  });
});
