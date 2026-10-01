import { expect, type Locator, type Page } from '@playwright/test';
import { openActionsMenu } from '@/tests/e2e/helpers.ts';

/** The d&d 3.5 Add Level wizard: opening it, planning its levels and walking its steps. */

/** Opens the Add Level wizard of the character on the page. */
export async function openAddLevelWizard(page: Page) {
  await openActionsMenu(page, /^Add Level/);
  const wizard = page.getByRole('dialog', { name: 'Add Level' });
  await expect(wizard).toBeVisible({ timeout: 10_000 });
  return wizard;
}

/** Queues `count` levels of each class, in order, then moves on from the class plan. */
export async function planLevels(wizard: Locator, page: Page, plan: [klass: string, count: number][]) {
  for (const [klass, count] of plan) {
    for (let i = 0; i < count; i++) {
      await wizard.getByRole('button', { name: 'Add Level' }).first().click();
      const combobox = wizard.getByRole('combobox').last();
      await combobox.click();
      await combobox.fill(klass);
      await page.getByRole('option', { name: new RegExp(`^${klass}`) }).first().click();
    }
  }
  await wizard.getByRole('button', { name: /^Next$/ }).click();
}

/**
 * Picks, for each pool chip still short of its total (`name picked/total`), the first item it lists, until every
 * pool is full. Returns what it picked.
 */
async function fillPools(wizard: Locator, { skipOptional }: { skipOptional: boolean }) {
  const picked: string[] = [];
  for (let safety = 0; safety < 30; safety++) {
    const chips = wizard.locator('.MuiChip-root').filter({ hasText: /\b\d+\/\d+/ });
    let next: Locator | undefined;
    for (let i = 0; i < await chips.count(); i++) {
      const text = (await chips.nth(i).textContent()) ?? '';
      const [, count, total] = text.match(/(\d+)\/(\d+)/) ?? [];
      if (Number(count) < Number(total) && !(skipOptional && text.includes('optional'))) {
        next = chips.nth(i);
        break;
      }
    }
    if (!next) return picked;
    await next.click();
    // A family row lists its variants: pick a plain item.
    const item = wizard.locator('.MuiListItemButton-root:not(.Mui-disabled)').filter({ hasNotText: /variants/ }).first();
    await item.waitFor({ state: 'visible', timeout: 10_000 });
    picked.push(((await item.textContent()) ?? '').trim());
    await item.click();
  }
  throw new Error('The pools never filled up');
}

/** Walks from hit points to the Feats step: maximum hit points, `ability` for an increase, random skills. */
export async function walkToFeats(wizard: Locator, ability?: string) {
  await wizard.getByRole('button', { name: /^Max All$/ }).click();
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  // Every fourth level asks for an ability; the step waits for one.
  if (ability) await wizard.getByLabel(new RegExp(`^${ability}:`)).check();
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  await wizard.getByRole('button', { name: /^Auto$/ }).click();
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  await expect(wizard.getByRole('heading', { name: /Select Feats by Aptitude/i })).toBeVisible({ timeout: 15_000 });
}

/** Clicks `button` to finish the wizard, which must take the levels without warnings. */
export async function finishWithoutWarnings(wizard: Locator, button = /^Finish All$/) {
  await wizard.getByRole('button', { name: button }).click();
  // Taken, the wizard closes; refused, it stays open on its warnings
  const proceed = wizard.getByRole('button', { name: /^Proceed Anyway$/ });
  const state = async () => (await proceed.isVisible()) ? 'warnings' : (await wizard.isVisible()) ? 'open' : 'closed';
  await expect.poll(state, { timeout: 15_000 }).not.toBe('open');
  expect(await state()).toBe('closed');
}

/** Walks from the Feats step to the end, filling every required feat pool and every spell pool. Returns the spells picked. */
export async function walkFromFeats(wizard: Locator) {
  await fillPools(wizard, { skipOptional: true });
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  const spellStep = wizard.getByRole('heading', { name: /Select Spells by Aptitude/i }).or(wizard.getByText('No spells to select at this level'));
  await expect(spellStep).toBeVisible({ timeout: 15_000 });
  const spells = await fillPools(wizard, { skipOptional: false });
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  await finishWithoutWarnings(wizard);
  return spells;
}

/** Plans `plan`'s levels and walks the whole wizard. Returns the spells picked. */
export async function addLevels(page: Page, plan: [klass: string, count: number][], ability?: string) {
  const wizard = await openAddLevelWizard(page);
  await planLevels(wizard, page, plan);
  await walkToFeats(wizard, ability);
  return await walkFromFeats(wizard);
}
