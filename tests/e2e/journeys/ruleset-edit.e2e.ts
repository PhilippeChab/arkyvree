import { type Page } from '@playwright/test';
import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

test.setTimeout(60_000);

async function forkSrd(page: Page, name: string) {
  await page.goto('/rulesets');
  await page.locator('h6:has-text("Core SRD 3.5")').first().click();
  await page.locator('[data-testid="MoreVertIcon"]').first().click();
  await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.getByRole('button', { name: /Fork Ruleset/ }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 10000 });
}

test.describe('Ruleset Edit', () => {
  test("owner edits a fork's name and description; the rename persists after reload", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Edit Fork ${Date.now()}`;
    const newName = `${name} renamed`;
    const newDescription = `Updated description ${Date.now()}`;
    await forkSrd(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Edit$/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Edit Ruleset' });
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill(newName);
    await dialog.locator('textarea[name="description"]').first().fill(newDescription);
    const editPut = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+(?:\?|$)/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: /Save Changes/ }).click();
    await editPut;

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: newName })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`text="${newDescription}"`).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: newName })).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text="${newDescription}"`).first()).toBeVisible();
  });
});
