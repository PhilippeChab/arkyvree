import { test, expect } from '@playwright/test';
import { getEmailVerificationCode, fillOtp } from '@/tests/e2e/helpers.ts';

test.describe('Account capacity — Forks', () => {
  test('a new account can create a second fork', async ({ page }) => {
    const email = `capacity_${Date.now()}@example.com`;
    const password = 'password1234';

    // Sign up + verify
    await page.goto('/sign-up');
    await page.fill('input[name="emailAddress"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="passwordConfirmation"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/verify-email', { timeout: 10000 });

    const code = await getEmailVerificationCode(email);
    await fillOtp(page, code);
    await page.getByRole('button', { name: /^Verify$/ }).click();
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Skip onboarding wizard
    await page.getByRole('button', { name: /^Skip$/ }).click();

    // First public fork
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    let forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(`First Fork ${Date.now()}`);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: /First Fork/ })).toBeVisible({ timeout: 10000 });

    // A second public fork also succeeds.
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(`Second Fork ${Date.now()}`);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();

    await expect(page.getByRole('heading', { name: /Second Fork/ })).toBeVisible({ timeout: 10000 });
  });
});
