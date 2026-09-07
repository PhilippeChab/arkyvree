import { type Page } from '@playwright/test';
import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

async function forkSrd(page: Page, name: string) {
  await page.goto('/rulesets');
  await page.locator('h6:has-text("Core SRD 3.5")').first().click();
  await page.locator('[data-testid="MoreVertIcon"]').first().click();
  await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.getByRole('button', { name: /Fork Ruleset/ }).click();
  await expect(page.getByRole('heading', { name: name })).toBeVisible({ timeout: 10000 });
}

test.describe('Ruleset Publish', () => {
  test('publishing a draft fork flips its status pill to Published and surfaces it in Community', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Publish Test ${Date.now()}`;
    await forkSrd(page, name);

    await expect(page.locator('text=/^Draft$/').first()).toBeVisible();

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Publish$/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Publish Ruleset' });
    await expect(dialog).toBeVisible();
    const publishResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/publish/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: /Publish Ruleset/ }).click();
    await publishResponse;

    await expect(page.locator('text=/^Published$/').first()).toBeVisible({ timeout: 15_000 });

    await page.goto('/rulesets?scope=community');
    await expect(page.locator(`h6:has-text("${name}")`)).toBeVisible();
  });
});
