import { type Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { getEmailVerificationCode, fillOtp, selectOption } from '@/tests/e2e/helpers.ts';

async function fastCreateCharacter(page: Page, name: string) {
  await page.goto('/characters');
  await page.getByRole('button', { name: 'Create Character' }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.locator('input[name="name"]').waitFor({ state: 'visible' });
  await dialog.locator('input[name="name"]').fill(name);
  const racesResponse = page.waitForResponse(
    (r) => r.url().includes('/api/characters/available-races') && r.status() === 200,
    { timeout: 10_000 },
  );
  await selectOption(page, 'Ruleset', 'Core SRD 3.5');
  await racesResponse;
  await selectOption(page, 'Race');
  await dialog.locator('input[name="height"]').fill('5 feet 8 inches');
  await dialog.locator('input[name="weight"]').fill('150 lbs');
  await expect(dialog.getByText('Strength', { exact: true })).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: /Roll all ability scores/i }).click();
  await selectOption(page, 'Alignment');
  await selectOption(page, 'Gender');
  await dialog.locator('input[name="name"]').press('Enter');
}

test.describe('Account capacity — Characters', () => {
  test('a new account can create a seventh character', async ({ page }) => {
    test.setTimeout(240_000);
    const email = `capacity_char_${Date.now()}@example.com`;
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

    // First six characters succeed. The Level Up wizard auto-opens
    // after the URL transition; wait for it explicitly, then Escape.
    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    for (let i = 1; i <= 6; i++) {
      await fastCreateCharacter(page, `Capacity Hero ${i} ${Date.now()}`);
      await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });
      await wizard.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {/* didn't auto-open */});
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
    }

    // Creation also succeeds beyond the former six-character cap.
    await fastCreateCharacter(page, `Capacity Hero 7 ${Date.now()}`);

    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });
  });
});
