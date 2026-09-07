import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';
import { queueClassLevels, walkAddLevelWizard } from '@/tests/e2e/levelUpHelpers.ts';

/**
 * Level Up — multiclass. Queues one Fighter level AND one Sorcerer level
 * in the same Add Level wizard pass to exercise the cross-class plan
 * (martial feats + caster spell pools merged into one walk-through).
 * Finalize must succeed without "Proceed Anyway", and the sheet must
 * show both classes in Classes & Levels.
 */
test.describe('Level Up Wizard — Multiclass', () => {
  test('owner takes Fighter 1 and Sorcerer 1 in one wizard, finishes without warnings', async ({ page, ownerUser }) => {
    test.setTimeout(120_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Multiclass Hero ${Date.now()}`;
    await createCharacter(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Add Level/ }).click();

    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    await expect(wizard).toBeVisible({ timeout: 10_000 });

    await queueClassLevels(wizard, page, 'Fighter', 1);
    await queueClassLevels(wizard, page, 'Sorcerer', 1);
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    await walkAddLevelWizard(wizard);

    await expect(wizard).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('text=Classes & Levels')).toBeVisible();
    await expect(page.locator('text=Fighter').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Sorcerer').first()).toBeVisible({ timeout: 10_000 });
  });
});
