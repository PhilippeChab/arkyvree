import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';
import {
  queueClassLevels,
  fillEveryAptitudePool,
  fillEverySpellPool,
} from '@/tests/e2e/levelUpHelpers.ts';

/**
 * Level-up Attribute Increase: in D&D 3.5 every 4th class level grants a +1
 * to one ability score. The wizard's Attribute step is a no-op at levels 1–3
 * but at level 4 (and 8/12/16/20) it requires picking an ability before the
 * Next button is enabled. This test queues four Fighter levels in one wizard
 * session, picks Strength at the Attribute step, finishes without warnings,
 * and asserts the Strength card on the sheet shows Level: +1.
 */
test.describe('Level Up Wizard — Attribute Increase', () => {
  test('fourth level grants an ability increase that lands on the sheet', async ({ page, ownerUser }) => {
    test.setTimeout(180_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Fighter Quad ${Date.now()}`;
    await createCharacter(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Add Level/ }).click();

    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    await expect(wizard).toBeVisible({ timeout: 10_000 });

    await queueClassLevels(wizard, page, 'Fighter', 4);
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // HP — Max All
    await wizard.getByRole('button', { name: /^Max All$/ }).click();
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Attributes — Fighter level 4 grants +1; pick Strength.
    // The step renders a "Fighter Level 4" heading with a RadioGroup of
    // FormControlLabels labelled like "Strength: 14 (+2)". The Next button
    // stays disabled until a radio is selected.
    await expect(wizard.getByRole('heading', { name: /Fighter Level 4/i }))
      .toBeVisible({ timeout: 10_000 });
    await wizard.getByLabel(/^Strength:/).check();
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Skills — Auto
    await wizard.getByRole('button', { name: /^Auto$/ }).click();
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Feats
    await fillEveryAptitudePool(wizard);
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Spells (Fighter has none, but call helper to advance the loading state)
    await fillEverySpellPool(wizard);
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Review — Finish All, no warnings
    await wizard.getByRole('button', { name: /^Finish All$/ }).click();
    await expect(
      wizard.getByRole('button', { name: /^Proceed Anyway$/ }),
    ).toBeHidden({ timeout: 1_500 });

    await expect(wizard).toBeHidden({ timeout: 15_000 });

    // Fighter level 4 visible on the sheet (ClassesSection renders an
    // accordion summary "Fighter — Level 4" once levels exist).
    await expect(page.locator('text=Classes & Levels')).toBeVisible();
    await expect(page.getByText(/Fighter\s*[—-]\s*Level 4/i).first())
      .toBeVisible({ timeout: 10_000 });

    // Strength card on the sheet should show Level: +1 (the ability bump).
    // AbilityScoresSection renders each ability inside a Paper with the name
    // uppercased; the level row reads "Level: +1" when level === 1.
    const strengthCard = page
      .locator('.MuiPaper-root')
      .filter({ hasText: /^STRENGTH/i })
      .first();
    await expect(strengthCard).toBeVisible({ timeout: 10_000 });
    await expect(strengthCard.getByText(/Level:\s*\+1/)).toBeVisible();
  });
});
