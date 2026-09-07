import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';
import { queueClassLevels, walkAddLevelWizard } from '@/tests/e2e/levelUpHelpers.ts';

/**
 * Level Up — caster class. Exercises the Spells step's aptitude
 * chip → list pick flow that the Fighter happy-path test skips
 * (Fighter has no spells). A Sorcerer at level 1 has both Cantrips
 * and Level 1 spell-known pools that must be filled, so finalize
 * surfaces a warning if any aren't picked.
 *
 * After finishing, the character sheet should report Sorcerer in the
 * Classes & Levels section AND the spells the wizard picked must
 * actually land in the on-sheet Spells display.
 */
test.describe('Level Up Wizard — Caster', () => {
  test('owner takes a Sorcerer level, picks cantrips + 1st-level spells, finishes without warnings', async ({ page, ownerUser }) => {
    test.setTimeout(150_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Sorcerer Hero ${Date.now()}`;
    await createCharacter(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Add Level/ }).click();

    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    await expect(wizard).toBeVisible({ timeout: 10_000 });

    await queueClassLevels(wizard, page, 'Sorcerer', 1);
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    const { pickedSpells } = await walkAddLevelWizard(wizard);

    await expect(wizard).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('text=Classes & Levels')).toBeVisible();
    await expect(page.locator('text=Sorcerer').first()).toBeVisible({ timeout: 10_000 });

    expect(pickedSpells.length).toBeGreaterThanOrEqual(6);

    // The on-sheet Spells section uses MUI Typography with explicit
    // `variant` props (h6 / subtitle2), which render as <h6> elements
    // — NOT <p>. The agent's earlier `<p>` selectors didn't match.
    // The class-group label is `${apt.aptitudeName} (${total})` where
    // `aptitudeName` for the Sorcerer is "Sorcerer Spells".
    const spellsHeading = page.getByText(/^Spells$/, { exact: true }).first();
    await spellsHeading.scrollIntoViewIfNeeded();
    await expect(spellsHeading).toBeVisible({ timeout: 10_000 });

    const sorcererGroup = page
      .getByRole('heading', { name: /^Sorcerer Spells\s*\(\d+\)/ })
      .first();
    await expect(sorcererGroup).toBeVisible({ timeout: 10_000 });
    await sorcererGroup.click();

    const levelHeaders = page.getByRole('heading', {
      name: /^(Cantrips|Level \d+)\s*\(\d+\)/,
    });
    const headerCount = await levelHeaders.count();
    expect(headerCount).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < headerCount; i++) {
      await levelHeaders.nth(i).click();
    }

    for (const spellName of pickedSpells) {
      await expect(
        page.getByRole('cell', { name: spellName, exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }

    const spellNameCells = page.locator('table tbody tr td:first-child').filter({
      hasText: new RegExp(pickedSpells.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')),
    });
    expect(await spellNameCells.count()).toBeGreaterThanOrEqual(6);
  });
});
