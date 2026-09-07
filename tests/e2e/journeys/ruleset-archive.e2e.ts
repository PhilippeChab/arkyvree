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

test.describe('Ruleset Archive / Unarchive', () => {
  test('archives a fork, the fork moves to Archived, and unarchive restores it', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Archive Test ${Date.now()}`;
    await forkSrd(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Archive$/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Archive Ruleset' });
    await expect(dialog).toBeVisible();
    const archiveResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/archive/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: /Archive Ruleset/ }).click();
    await archiveResponse;

    await expect(page).toHaveURL(/\/rulesets$/, { timeout: 15_000 });
    await expect(page.locator('h6:has-text("Core SRD 3.5")')).toBeVisible();
    await expect(page.locator(`h6:has-text("${name}")`)).toHaveCount(0);

    await page.getByRole('button', { name: 'Filter' }).click();
    const filterMenu = page.getByRole('menu');
    await expect(filterMenu).toBeVisible();
    await filterMenu.getByRole('menuitem', { name: /^Archived$/ }).click();
    await expect(page).toHaveURL(/scope=archived/);
    await expect(page.locator(`h6:has-text("${name}")`)).toBeVisible();

    await page.locator(`h6:has-text("${name}")`).first().click();
    await expect(page.locator('text=/^Archived$/').first()).toBeVisible();

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    const unarchiveResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/unarchive/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await page.getByRole('menuitem', { name: /^Unarchive$/ }).click();
    await unarchiveResponse;

    await expect(page.locator('text=/^Draft$/').first()).toBeVisible({ timeout: 15_000 });
  });
});
