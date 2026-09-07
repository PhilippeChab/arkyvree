import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Customization page — add a modifier to a race in a forked ruleset:
 *  - Fork SRD
 *  - Open Human race → customization → Modifiers tab
 *  - Add a +2 Strength modifier via the path autocomplete
 *  - Verify the modifier row appears in the table
 */
test.describe('Customization — Add Modifier', () => {
  test('owner adds a Strength +2 modifier to Human in a fork', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `Customize Fork ${Date.now()}`;

    // Fork the SRD
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10000 });

    // Open Human race customization → Modifiers tab.
    // Exact match — `text=Human` would also catch Half-Elf rows whose descriptions mention Humans.
    await page.getByRole('tab', { name: 'Races' }).click();
    await page.getByRole('cell', { name: 'Human', exact: true }).first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+\/customization/);
    await page.getByRole('tab', { name: 'Modifiers' }).click();

    // Add Modifier
    await page.getByRole('button', { name: 'Add Modifier' }).click();
    const modDialog = page.getByRole('dialog', { name: 'Create New Modifier' });
    await expect(modDialog).toBeVisible();

    const searchInput = modDialog.locator('input[placeholder="Search..."]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('strength');
    const strengthOption = modDialog.getByText('Abilities › Strength › Misc').first();
    await expect(strengthOption).toBeVisible({ timeout: 10_000 });
    await strengthOption.click();

    // Path selection auto-fills operator (add) and seeds a "0" default in the
    // numeric value field — clear it before typing so we don't end up with "20".
    const valueInput = modDialog.locator('input[type="number"]');
    await valueInput.click();
    await valueInput.press('Control+a');
    await valueInput.fill('2');

    const createMod = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/customization\/[^/]+\/[^/]+\/modifiers(?:\?|$)/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await modDialog.getByRole('button', { name: /^Create$/ }).click();
    await createMod;

    // Modifier row appears in the table — adding a modifier on an inherited
    // entity triggers COW shadowing, so the URL changes to the override ID.
    await expect(page).toHaveURL(/\/customization\/modifiers/, { timeout: 15_000 });
    const newRow = page.locator('table tbody tr').filter({ hasText: /Abilities.*Strength.*Misc/ });
    await expect(newRow).toBeVisible({ timeout: 15_000 });
    await expect(newRow.locator('text="2"').first()).toBeVisible();
  });
});
