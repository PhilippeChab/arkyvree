import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Customization page — add a modifier to a feat in a forked ruleset.
 * Mirrors customization-add-modifier.e2e.ts (which targets a Race) so
 * we cover at least one non-Race entity end-to-end through the same
 * shared CustomizationPage / ModifiersSection flow.
 */
test.describe('Customization — Add Modifier to a Feat', () => {
  test('owner adds a Strength +1 modifier to Toughness in a fork', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `Feat Customize Fork ${Date.now()}`;

    // Fork the SRD
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10_000 });

    // Open Feats tab → search Toughness → click into customization
    await page.getByRole('tab', { name: 'Feats' }).click();
    await page.getByPlaceholder('Search feats...').fill('Toughness');
    await page.getByRole('cell', { name: 'Toughness', exact: true }).first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/feats\/[a-f0-9-]+\/customization/);

    await page.getByRole('tab', { name: 'Modifiers' }).click();

    // Add a +1 Strength modifier
    await page.getByRole('button', { name: 'Add Modifier' }).click();
    const modDialog = page.getByRole('dialog', { name: 'Create New Modifier' });
    await expect(modDialog).toBeVisible();

    const searchInput = modDialog.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('strength');
    const strengthOption = modDialog.getByText('Abilities › Strength › Misc').first();
    await expect(strengthOption).toBeVisible({ timeout: 10_000 });
    await strengthOption.click();

    const valueInput = modDialog.locator('input[type="number"]');
    await valueInput.click();
    await valueInput.press('Control+a');
    await valueInput.fill('1');

    const createMod = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/customization\/[^/]+\/[^/]+\/modifiers(?:\?|$)/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await modDialog.getByRole('button', { name: /^Create$/ }).click();
    await createMod;

    // After save the URL flips to .../customization/modifiers (the
    // current tab), and the new modifier row shows up in the table.
    await expect(page).toHaveURL(/\/customization\/modifiers/, { timeout: 15_000 });
    const newRow = page.locator('table tbody tr').filter({ hasText: /Abilities.*Strength.*Misc/ });
    await expect(newRow).toBeVisible({ timeout: 15_000 });
    await expect(newRow.locator('text="1"').first()).toBeVisible();
  });
});
