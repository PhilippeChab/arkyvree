import { expect, test } from '@/tests/e2e/fixtures.ts';
import type { Page } from '@playwright/test';
import { apiResponse, filterList, forkCoreRuleset, openActionsMenu, signIn, uniqueName, visitCoreRulesetList } from '@/tests/e2e/helpers.ts';

/** Opens the core rules. */
async function openCoreRuleset(page: Page) {
  await visitCoreRulesetList(page);
  await page.locator('h6:has-text("Core SRD 3.5")').first().click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+/);
}

test.describe('Rulesets', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
  });

  test('a fork needs a name, and is listed under Forked', async ({ page }) => {
    const name = uniqueName('My Fork');
    await openCoreRuleset(page);
    await openActionsMenu(page, /^Fork\b/);
    const dialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    const nameField = dialog.locator('input[name="name"]');
    await nameField.fill('');
    await dialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(dialog.getByText('Name is required')).toBeVisible();

    await nameField.fill(name);
    const forked = apiResponse(page, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/fork/);
    await dialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await forked;
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });
    await page.goto('/rulesets?scope=forked');
    await expect(page.locator(`h6:has-text("${name}")`)).toBeVisible();
  });

  test('a fork\'s name and description can be changed', async ({ page }) => {
    const name = uniqueName('Edit Fork');
    const description = `Updated description ${Date.now()}`;
    await forkCoreRuleset(page, name);
    await openActionsMenu(page, /^Edit$/);
    const dialog = page.getByRole('dialog', { name: 'Edit Ruleset' });
    await dialog.locator('input[name="name"]').fill(`${name} renamed`);
    await dialog.locator('textarea[name="description"]').first().fill(description);
    const saved = apiResponse(page, 'PUT', /\/api\/rulesets\/[a-f0-9-]+(?:\?|$)/);
    await dialog.getByRole('button', { name: /Save Changes/ }).click();
    await saved;

    await page.reload();
    await expect(page.getByRole('heading', { name: `${name} renamed` })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text="${description}"`).first()).toBeVisible();
  });

  test('an archived fork is listed under Archived until unarchived', async ({ page }) => {
    const name = uniqueName('Archive Test');
    await forkCoreRuleset(page, name);
    await openActionsMenu(page, /^Archive$/);
    const archived = apiResponse(page, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/archive/);
    await page.getByRole('dialog', { name: 'Archive Ruleset' }).getByRole('button', { name: /Archive Ruleset/ }).click();
    await archived;

    await expect(page).toHaveURL(/\/rulesets$/, { timeout: 15_000 });
    // The list has rendered before we check what it lacks.
    await expect(page.getByRole('textbox', { name: 'Search rulesets...' })).toBeVisible();
    await expect(page.locator(`h6:has-text("${name}")`)).toHaveCount(0);
    await filterList(page, /^Archived$/);
    await expect(page).toHaveURL(/scope=archived/);
    await page.locator(`h6:has-text("${name}")`).first().click();
    await expect(page.locator('text=/^Archived$/').first()).toBeVisible();

    const unarchived = apiResponse(page, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/unarchive/);
    await openActionsMenu(page, /^Unarchive$/);
    await unarchived;
    await expect(page.locator('text=/^Draft$/').first()).toBeVisible({ timeout: 15_000 });
  });

  test('a published fork is listed under Community', async ({ page }) => {
    const name = uniqueName('Publish Test');
    await forkCoreRuleset(page, name);
    await expect(page.locator('text=/^Draft$/').first()).toBeVisible();
    await openActionsMenu(page, /^Publish$/);
    const published = apiResponse(page, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/publish/);
    await page.getByRole('dialog', { name: 'Publish Ruleset' }).getByRole('button', { name: /Publish Ruleset/ }).click();
    await published;

    await expect(page.locator('text=/^Published$/').first()).toBeVisible({ timeout: 15_000 });
    await page.goto('/rulesets?scope=community');
    await expect(page.locator(`h6:has-text("${name}")`)).toBeVisible();
  });

  test('searching the feats narrows the list, and clearing the search restores it', async ({ page }) => {
    await openCoreRuleset(page);
    await page.getByRole('tab', { name: 'Feats' }).click();
    const rows = page.locator('table tbody tr');
    // A first page holds 10 feats.
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(10);
    const search = page.getByPlaceholder('Search feats...');
    await search.fill('Toughness');
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeLessThanOrEqual(5);
    await expect(rows.filter({ hasText: 'Toughness' }).first()).toBeVisible();
    await search.fill('');
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(10);
  });

  test('a subscribed extension adds its content to the fork until unsubscribed', async ({ page }) => {
    await forkCoreRuleset(page, uniqueName('Extension Fork'));
    await openActionsMenu(page, /^Subscribe\b/);
    const dialog = page.getByRole('dialog', { name: 'Subscribe to Extensions' });
    await dialog.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('option', { name: /Complete Arcane/ }).click();
    const subscribed = apiResponse(page, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/subscribe/);
    await dialog.getByRole('button', { name: /^Subscribe$/ }).click();
    await subscribed;
    await expect(page.locator('text="1 extension"').first()).toBeVisible({ timeout: 15_000 });

    // Cloud Chariot is one of Complete Arcane's own spells.
    const cloudChariot = page.getByRole('cell', { name: 'Cloud Chariot', exact: true });
    const searchSpells = async () => {
      await page.getByRole('tab', { name: 'Spells' }).click();
      await page.getByPlaceholder('Search spells...').fill('Cloud Chariot');
    };
    await searchSpells();
    await expect(cloudChariot).toBeVisible({ timeout: 10_000 });

    await page.locator('text="1 extension"').first().click();
    await page.locator('.MuiChip-root').filter({ hasText: 'Complete Arcane' }).first().locator('.MuiChip-deleteIcon').click();
    const unsubscribed = apiResponse(page, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/unsubscribe/);
    await page.getByRole('dialog', { name: 'Unsubscribe from Extension' }).getByRole('button', { name: /^Unsubscribe$/ }).click();
    await unsubscribed;
    await expect(page.locator('text="1 extension"')).toHaveCount(0, { timeout: 15_000 });
    await searchSpells();
    await expect(cloudChariot).toHaveCount(0, { timeout: 10_000 });
  });
});

// Starring changes the user: the test has one of its own, which never starred anything
test.describe('A starred ruleset', () => {
  test('is listed under Starred until unstarred', async ({ page, user }) => {
    await signIn(page, user.email, user.password);
    await visitCoreRulesetList(page);
    // The card opens the ruleset when clicked: press its star button, not the card.
    const star = (name: string) => page.locator('h6:has-text("Core SRD 3.5")').first()
      .locator('xpath=ancestor::*[contains(@class, "MuiCard-root")][1]')
      .getByRole('button', { name, exact: true });
    const starred = apiResponse(page, 'POST', /\/api\/rulesets\/[a-f0-9-]+\/star/);
    await star('Star ruleset').click();
    await starred;

    await filterList(page, /^Starred$/);
    await expect(page).toHaveURL(/scope=starred/);
    const unstarred = apiResponse(page, 'DELETE', /\/api\/rulesets\/[a-f0-9-]+\/star/);
    await star('Unstar ruleset').click();
    await unstarred;
    await expect(page.locator('h6:has-text("Core SRD 3.5")')).toHaveCount(0, { timeout: 15_000 });
  });
});
