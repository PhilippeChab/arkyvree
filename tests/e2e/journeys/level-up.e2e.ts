import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';
import { queueClassLevels, walkAddLevelWizard } from '@/tests/e2e/levelUpHelpers.ts';

/**
 * Level Up happy path: walk the wizard distributing every skill point
 * and filling every aptitude pool so finalize succeeds *without* the
 * "Proceed Anyway" force-submit. If validation warnings appear, the
 * test fails — that means we missed an allocation a real user would have
 * to satisfy too.
 */
test.describe('Level Up Wizard', () => {
  test('owner queues two Fighter levels, distributes skills + feats, finishes without warnings', async ({ page, ownerUser }) => {
    test.setTimeout(120_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Fighter Hero ${Date.now()}`;
    await createCharacter(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Add Level/ }).click();

    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    await expect(wizard).toBeVisible({ timeout: 10_000 });

    await queueClassLevels(wizard, page, 'Fighter', 2);
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    await walkAddLevelWizard(wizard);

    await expect(wizard).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('text=Classes & Levels')).toBeVisible();
    await expect(page.locator('text=Fighter').first()).toBeVisible({ timeout: 10_000 });
  });
});
