import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Wizard helpers for the dnd3.5 Add Level dialog. Used by the level-up
 * happy-path test (Fighter) and the multiclass-caster test (Sorcerer).
 */

export async function queueClassLevels(
  wizard: Locator,
  page: Page,
  klassName: string,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    await wizard.getByRole('button', { name: 'Add Level' }).first().click();
    const combobox = wizard.getByRole('combobox').last();
    await combobox.click();
    await combobox.fill(klassName);
    await page.getByRole('option', { name: new RegExp(`^${klassName}`) }).first().click();
  }
}

/**
 * Fill every required aptitude pool at the Feats step. Skips pools
 * marked "(optional)". Picks the first eligible non-family list item.
 */
export async function fillEveryAptitudePool(wizard: Locator) {
  await wizard
    .getByRole('heading', { name: /Select Feats by Aptitude/i })
    .waitFor({ state: 'visible', timeout: 15_000 });

  for (let safety = 0; safety < 20; safety++) {
    const chips = wizard.locator('.MuiChip-root').filter({ hasText: /\b\d+\/\d+/ });
    const count = await chips.count();
    let nextIdx: number | null = null;
    for (let i = 0; i < count; i++) {
      const text = (await chips.nth(i).textContent()) ?? '';
      const m = text.match(/(\d+)\/(\d+)/);
      if (!m) continue;
      const picked = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      if (picked < total && !text.includes('optional')) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === null) return;
    await chips.nth(nextIdx).click();
    const feat = wizard
      .locator('.MuiListItemButton-root:not(.Mui-disabled)')
      .filter({ hasNotText: /variants/ })
      .first();
    await feat.waitFor({ state: 'visible', timeout: 10_000 });
    await feat.click();
  }
  throw new Error('fillEveryAptitudePool exceeded safety bound — chips not converging');
}

/**
 * Fill every required spell aptitude pool at the Spells step. Same
 * shape as the feat step — chips with `${name} ${picked}/${total}`,
 * click chip then click the first eligible list item to add a spell.
 *
 * Returns the names of every spell picked (in pick order). Empty array
 * if there were no chips with remaining slots (e.g. non-caster class).
 * Callers that only care about advancing the step can ignore the return.
 */
export async function fillEverySpellPool(wizard: Locator): Promise<string[]> {
  // Wait for the spells step header OR the "no spells" alert. Both
  // settle the loading state.
  await Promise.race([
    wizard.getByRole('heading', { name: /Select Spells by Aptitude/i })
      .waitFor({ state: 'visible', timeout: 15_000 }),
    wizard.getByText('No spells to select at this level')
      .waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => {/* timeout — continue, the chip loop will exit on count 0 */});

  const picked: string[] = [];
  for (let safety = 0; safety < 30; safety++) {
    const chips = wizard.locator('.MuiChip-root').filter({ hasText: /\b\d+\/\d+/ });
    const count = await chips.count();
    let nextIdx: number | null = null;
    for (let i = 0; i < count; i++) {
      const text = (await chips.nth(i).textContent()) ?? '';
      const m = text.match(/(\d+)\/(\d+)/);
      if (!m) continue;
      if (parseInt(m[1], 10) < parseInt(m[2], 10)) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === null) return picked;
    await chips.nth(nextIdx).click();
    const spell = wizard
      .locator('.MuiListItemButton-root:not(.Mui-disabled)')
      .first();
    await spell.waitFor({ state: 'visible', timeout: 10_000 });
    const spellName = ((await spell.textContent()) ?? '').trim();
    if (spellName) picked.push(spellName);
    await spell.click();
  }
  throw new Error('fillEverySpellPool exceeded safety bound — chips not converging');
}

/**
 * Walk the wizard's intermediate steps (HP → Attributes → Skills →
 * Feats → Spells) starting after class plan, then submit on Review.
 *
 * Returns `{ pickedSpells }` — names of spells picked at the Spells
 * step, in pick order. Non-caster classes return an empty array.
 */
export async function walkAddLevelWizard(wizard: Locator): Promise<{ pickedSpells: string[] }> {
  // HP — Max All
  await wizard.getByRole('button', { name: /^Max All$/ }).click();
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  // Attributes — only level 4/8/12/16/20 grant increases; Next at low levels
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  // Skills — randomize
  await wizard.getByRole('button', { name: /^Auto$/ }).click();
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  // Feats
  await fillEveryAptitudePool(wizard);
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  // Spells
  const pickedSpells = await fillEverySpellPool(wizard);
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  // Review
  await wizard.getByRole('button', { name: /^Finish All$/ }).click();
  await expect(
    wizard.getByRole('button', { name: /^Proceed Anyway$/ }),
  ).toBeHidden({ timeout: 1_500 });
  return { pickedSpells };
}
