import { type Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { getEmailVerificationCode, fillOtp, selectOption } from '@/tests/e2e/helpers.ts';

async function createCampaign(page: Page, name: string) {
  await page.goto('/campaigns');
  await page.getByRole('button', { name: 'Create New Campaign' }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(name);
  await selectOption(page, 'Ruleset', 'Core SRD 3.5');
  await dialog.getByRole('button', { name: /^Create$/ }).click();
}

test.describe('Account capacity — Campaigns', () => {
  test('a new account can create a third campaign', async ({ page }) => {
    test.setTimeout(120_000);
    const email = `capacity_camp_${Date.now()}@example.com`;
    const password = 'password1234';

    await page.goto('/sign-up');
    await page.fill('input[name="emailAddress"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="passwordConfirmation"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/verify-email', { timeout: 10_000 });

    const code = await getEmailVerificationCode(email);
    await fillOtp(page, code);
    await page.getByRole('button', { name: /^Verify$/ }).click();
    await page.waitForURL('/dashboard', { timeout: 10_000 });
    await page.getByRole('button', { name: /^Skip$/ }).click();

    // First two campaigns succeed
    await createCampaign(page, `Campaign One ${Date.now()}`);
    await expect(page).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10_000 });

    await createCampaign(page, `Campaign Two ${Date.now()}`);
    await expect(page).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10_000 });

    // Creation also succeeds beyond the former two-campaign cap.
    await createCampaign(page, `Campaign Three ${Date.now()}`);

    await expect(page).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10_000 });
  });
});
