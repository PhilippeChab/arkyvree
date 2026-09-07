import { test, expect } from '@/tests/e2e/fixtures.ts';
import { createCharacter, signIn } from '@/tests/e2e/helpers.ts';


test.describe('Character Archive / Unarchive', () => {
  test('archives a character, the character moves to Archived, and unarchive restores it', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Archive Hero ${Date.now()}`;
    await createCharacter(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Archive$/ }).click();

    const dialog = page.getByRole('dialog', { name: /^Archive$/ });
    await expect(dialog).toBeVisible();
    // Wait for the archive DELETE before asserting the list refetches —
    // under parallel load the request can take a few seconds.
    const archiveResponse = page.waitForResponse(
      (r) => /\/api\/characters\/[a-f0-9-]+$/.test(r.url()) && r.request().method() === 'DELETE' && r.ok(),
      { timeout: 15_000 },
    );
    // The archive dialog reuses DeleteDialog whose confirm button reads "Delete" by default.
    await dialog.getByRole('button', { name: /^Delete$/ }).click();
    await archiveResponse;

    await expect(page).toHaveURL(/\/characters(\?|$)/, { timeout: 10000 });
    await expect(page.locator(`text="${name}"`)).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByRole('menuitem', { name: /^Archived$/ }).click();
    await expect(page).toHaveURL(/view=archived/);
    await expect(page.locator(`text="${name}"`).first()).toBeVisible();

    await page.locator(`text="${name}"`).first().click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/);
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Unarchive$/ }).click();

    await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await expect(page.getByRole('menuitem', { name: /^Archive$/ })).toBeVisible();
  });
});
