import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Customization page — Properties and Requirements tabs on the same fork's
 * Toughness feat. The Modifiers tab is already covered by
 * customization-feat-modifier.e2e.ts; this hits the two remaining tabs in a
 * single journey so both code paths see end-to-end coverage.
 */
test.describe('Customization — Properties and Requirements', () => {
  test.setTimeout(120_000);

  test('owner adds a property AND a requirement to a feat in a fork', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `Feat Props/Reqs Fork ${Date.now()}`;

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

    // ─── Properties tab ──────────────────────────────────────────────
    await page.getByRole('tab', { name: 'Properties' }).click();
    await expect(page).toHaveURL(/\/customization\/properties/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Add Property' }).click();
    const propDialog = page.getByRole('dialog', { name: 'Create New Property' });
    await expect(propDialog).toBeVisible();

    // Type and Value render as MUI Autocompletes (role="combobox").
    // The Value field carries the required-indicator "*" so its
    // accessible label is "Value *" — `getByLabel('Value', { exact: true })`
    // wouldn't match. Target by role explicitly.
    const propType = `e2e-tag-${Date.now()}`;
    const propValue = `e2e-value-${Date.now()}`;
    await propDialog.getByRole('combobox', { name: 'Type' }).fill(propType);
    await propDialog.getByRole('combobox', { name: 'Value' }).fill(propValue);

    const createProp = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/customization\/[^/]+\/[^/]+\/properties(?:\?|$)/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await propDialog.getByRole('button', { name: /^Create$/ }).click();
    await createProp;
    await expect(propDialog).toBeHidden({ timeout: 15_000 });

    // After save the URL stays on .../customization/properties (or flips to
    // the override entityId after COW shadowing — either way the section
    // remains "properties").
    await expect(page).toHaveURL(/\/customization\/properties/, { timeout: 15_000 });
    const propertyRow = page.locator('table tbody tr').filter({ hasText: propType }).filter({ hasText: propValue });
    await expect(propertyRow).toBeVisible({ timeout: 15_000 });

    // ─── Requirements tab ────────────────────────────────────────────
    await page.getByRole('tab', { name: 'Requirements' }).click();
    await expect(page).toHaveURL(/\/customization\/requirements/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Add Requirement' }).click();
    const reqDialog = page.getByRole('dialog', { name: 'Create Requirement' });
    await expect(reqDialog).toBeVisible();

    // Default toggle is "Condition" — same TargetPathBrowser as the modifier
    // flow. Search "strength" → first match is "Abilities › Strength › Base"
    // (paths sort alphabetically; modifier-only `.misc` doesn't apply here
    // because Base/Total/Modifier are requirementOnly leaves).
    await reqDialog.locator('input[placeholder="Search..."]').fill('strength');
    await reqDialog.getByText('Abilities › Strength › Base').first().click({ timeout: 10_000 });

    // After picking the path, the form seeds the numeric value to "0".
    // Wait for the seed to land, then type "13" via the real keyboard so
    // react-hook-form sees a normal change event (focus → select all → type).
    const reqValue = reqDialog.locator('input[type="number"]');
    await expect(reqValue).toBeEnabled({ timeout: 10_000 });
    await expect(reqValue).toHaveValue('0', { timeout: 10_000 });
    await reqValue.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('13');
    await expect(reqValue).toHaveValue('13', { timeout: 10_000 });

    const createReq = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/customization\/[^/]+\/[^/]+\/requirements(?:\?|$)/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await reqDialog.getByRole('button', { name: /^Create$/ }).click();
    await createReq;
    await expect(reqDialog).toBeHidden({ timeout: 15_000 });

    await expect(page).toHaveURL(/\/customization\/requirements/, { timeout: 15_000 });

    // Requirements render as Cards inside a TreeView (no table). The new
    // row contains the Strength breadcrumb. The card also renders the
    // requirement value as plain text — assert "13" persists.
    const requirementCard = page.locator('[role="treeitem"]').filter({ hasText: 'Strength' }).first();
    await expect(requirementCard).toBeVisible({ timeout: 15_000 });
    await expect(requirementCard.locator('text=13')).toBeVisible({ timeout: 15_000 });

    // ─── Persistence: reload and confirm both rows survive ──────────
    await page.reload();
    await expect(page).toHaveURL(/\/customization\/requirements/, { timeout: 10_000 });
    const reloadedCard = page.locator('[role="treeitem"]').filter({ hasText: 'Strength' }).first();
    await expect(reloadedCard).toBeVisible({ timeout: 10_000 });
    await expect(reloadedCard.locator('text=13')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('tab', { name: 'Properties' }).click();
    await expect(page).toHaveURL(/\/customization\/properties/, { timeout: 10_000 });
    await expect(
      page.locator('table tbody tr').filter({ hasText: propType }).filter({ hasText: propValue }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
