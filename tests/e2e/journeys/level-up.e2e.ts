import { test, expect } from '@/tests/e2e/fixtures.ts';
import { apiResponse, createCharacter, openActionsMenu, signIn } from '@/tests/e2e/helpers.ts';
import { addLevels, finishWithoutWarnings, openAddLevelWizard, planLevels, walkFromFeats, walkToFeats } from '@/tests/e2e/levelUpHelpers.ts';

/** Every wizard here must finish without "Proceed Anyway": a warning means a pick a real user would have to make was missed. */
test.describe('Level up', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await createCharacter(page, `Level Up Hero ${Date.now()}`);
  });

  test('takes levels of two classes in one pass', async ({ page }) => {
    await addLevels(page, [['Fighter', 1], ['Sorcerer', 1]]);
    await expect(page.locator('text=Classes & Levels')).toBeVisible();
    await expect(page.locator('text=Fighter').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Sorcerer').first()).toBeVisible({ timeout: 10_000 });
  });

  test('takes a fourth level with its ability increase', async ({ page }) => {
    await addLevels(page, [['Fighter', 4]], 'Strength');
    await expect(page.getByText(/Fighter\s*[—-]\s*Level 4/i).first()).toBeVisible({ timeout: 10_000 });
    const strength = page.locator('.MuiPaper-root').filter({ hasText: /^STRENGTH/i }).first();
    await expect(strength.getByText(/Level:\s*\+1/)).toBeVisible({ timeout: 10_000 });
  });

  test('puts the spells a caster picks on the sheet', async ({ page }) => {
    const spells = await addLevels(page, [['Sorcerer', 1]]);
    // Four cantrips and two first-level spells.
    expect(spells.length).toBeGreaterThanOrEqual(6);
    const sorcererSpells = page.getByRole('heading', { name: /^Sorcerer Spells\s*\(\d+\)/ }).first();
    await sorcererSpells.scrollIntoViewIfNeeded();
    await sorcererSpells.click();
    const levels = page.getByRole('heading', { name: /^(Cantrips|Level \d+)\s*\(\d+\)/ });
    expect(await levels.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < await levels.count(); i++) await levels.nth(i).click();
    for (const spell of spells) await expect(page.getByRole('cell', { name: spell }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('finds a feat by name, and one variant of a feat family', async ({ page }) => {
    const wizard = await openAddLevelWizard(page);
    await planLevels(wizard, page, [['Fighter', 1]]);
    await walkToFeats(wizard);

    // Toughness has no prerequisites: the rolled abilities can't rule it out.
    await wizard.locator('.MuiChip-root').filter({ hasText: /^General \d+\/\d+/ }).click();
    await wizard.getByLabel(/^Search General Feats$/).fill('Toughness');
    // Wait for the search to land, not to pick Toughness off the unfiltered page.
    await expect.poll(() => wizard.locator('.MuiList-root .MuiListItemButton-root').count(), { timeout: 10_000 }).toBeLessThan(8);
    await wizard.getByRole('button', { name: /^Toughness$/ }).click();
    await expect(wizard.locator('.MuiChip-root').filter({ hasText: /^Toughness$/ })).toBeVisible();

    await wizard.locator('.MuiChip-root').filter({ hasText: /^Fighter Bonus Feat \d+\/\d+/ }).click();
    // The pools share their search: the family would hide behind "Toughness".
    const search = wizard.getByLabel(/^Search Fighter Bonus Feat Feats$/);
    await search.fill('');
    await search.fill('Weapon Focus');
    await wizard.getByRole('button', { name: /^Weapon Focus \d+ variants$/ }).click();
    await wizard.getByRole('button', { name: /^Weapon Focus: Longsword$/ }).click();
    await expect(wizard.locator('.MuiChip-root').filter({ hasText: /^Weapon Focus: Longsword$/ })).toBeVisible();
    await expect(wizard.locator('.MuiChip-root').filter({ hasText: /\b0\/\d+/ }).filter({ hasNotText: /optional/ })).toHaveCount(0);
    await walkFromFeats(wizard);

    await expect(page.getByText('Feats & Special Abilities', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Toughness', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Weapon Focus: Longsword', { exact: true }).first()).toBeVisible();
  });

  // The edit wizard shows every step again, a caster's spells included.
  for (const [klass, maxHp, hp] of [['Fighter', 10, 5], ['Sorcerer', 4, 3]] as const) {
    test(`edits and removes a ${klass} level`, async ({ page }) => {
      await addLevels(page, [[klass, 1]]);
      await page.getByRole('button', { name: new RegExp(`${klass}.*Level 1`, 'i') }).click();
      await expect(page.getByText(`Level 1 — HP: +${maxHp}`)).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: `Edit ${klass} level 1` }).click();
      const editWizard = page.getByRole('dialog', { name: 'Edit Level' });
      await editWizard.getByLabel('HP Gain').fill(String(hp));
      for (let step = 0; step < 5; step++) await editWizard.getByRole('button', { name: /^Next$/ }).click();
      const edited = apiResponse(page, 'PUT', /\/api\/characters\/levels\/[^/]+\/[^/?]+/);
      await finishWithoutWarnings(editWizard, /^Finish$/);
      await edited;
      await expect(page.getByText(`Level 1 — HP: +${maxHp}`)).toHaveCount(0, { timeout: 10_000 });
      // The level may have folded away with the refresh.
      const edit = page.getByText(`Level 1 — HP: +${hp}`);
      if (!(await edit.isVisible())) await page.getByRole('button', { name: new RegExp(`${klass}.*Level 1`, 'i') }).click();
      await expect(edit).toBeVisible({ timeout: 10_000 });

      await openActionsMenu(page, /^Remove Level/);
      const removed = apiResponse(page, 'DELETE', /\/api\/characters\/levels\/[^/?]+/);
      await page.getByRole('dialog', { name: 'Remove Level' }).getByRole('button', { name: /^Remove Level$/ }).click();
      await removed;
      await expect(page.getByText('No classes available')).toBeVisible({ timeout: 10_000 });
    });
  }
});
