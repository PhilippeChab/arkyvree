import { test, expect } from '@/tests/e2e/fixtures.ts';
import { createCharacter, signIn } from '@/tests/e2e/helpers.ts';


test.describe('Character Edit', () => {
  test('renames a character inline by clicking the heading', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `EditMe ${Date.now()}`;
    const newName = `${name} renamed`;
    await createCharacter(page, name);

    // Click the name heading to enter edit mode — replaces h5 with an autofocused TextField
    await page.locator(`h5:has-text("${name}")`).first().click();
    const editor = page.locator('input').filter({ hasText: '' }).locator('visible=true').first();
    // Easier: use the only autofocused input on the page (the rename TextField)
    const focused = page.locator('input:focus');
    await expect(focused).toBeVisible();
    await focused.fill(newName);
    const renamePut = page.waitForResponse(
      (r) => /\/api\/characters\/[a-f0-9-]+(?:\?|$)/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await focused.press('Enter');
    await renamePut;

    await expect(page.locator(`h5:has-text("${newName}")`)).toBeVisible({ timeout: 15_000 });

    await page.goto('/characters');
    await expect(page.locator(`text="${newName}"`).first()).toBeVisible();
    void editor;
  });
});
