import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Customization page — add a modifier to a class level (klass_levels) in a
 * forked ruleset. Mirrors the Race / Feat customization tests so we cover
 * the klass_levels entity type end-to-end through the same shared
 * CustomizationPage / ModifiersSection flow. Navigation goes
 * Ruleset → Classes tab → Fighter → Levels table → Level row →
 * /rulesets/{id}/klass_levels/{levelId}/customization.
 */
test.describe('Customization — Class Level (klass_levels)', () => {
  test.setTimeout(120_000);

  test('owner can customize a class level on a fork', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `Class Level Customize Fork ${Date.now()}`;

    // Fork the SRD
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10_000 });

    // Open Classes tab → click Fighter → lands on the class detail Levels tab
    await page.getByRole('tab', { name: 'Classes' }).click();
    await page.getByRole('cell', { name: 'Fighter', exact: true }).first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/classes\/[a-f0-9-]+\/levels/);

    // The levels table renders rows whose first cell is a level Chip ("1", "2", ...).
    // Click the Level 1 row to enter klass_levels customization.
    await page
      .locator('table tbody tr')
      .filter({ has: page.locator('td').first().getByText('1', { exact: true }) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/klass_levels\/[a-f0-9-]+\/customization/);

    // The header reads "Customize Fighter Level 1". CustomizationPage
    // styles the title with `sx={{ typography: { xs: "h5", md: "h3" } }}`
    // (no `component` prop), so MUI renders it as <p> — getByRole('heading')
    // wouldn't match. Use a text-based selector instead.
    await expect(page.getByText(/Customize\s+Fighter\s+Level 1/)).toBeVisible();

    await page.getByRole('tab', { name: 'Modifiers' }).click();

    // Add a +1 Strength modifier — same flow as customization-feat-modifier.e2e.ts
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

    // After save the URL stays under /customization/modifiers and the new
    // modifier row shows up in the table. Adding a modifier on an inherited
    // klass_levels row triggers COW shadowing — entityId may change, so we
    // just assert the section URL and the row.
    await expect(page).toHaveURL(/\/customization\/modifiers/, { timeout: 15_000 });
    const newRow = page.locator('table tbody tr').filter({ hasText: /Abilities.*Strength.*Misc/ });
    await expect(newRow).toBeVisible({ timeout: 15_000 });
    await expect(newRow.locator('text="1"').first()).toBeVisible();

    // Reload to confirm the modifier persisted server-side.
    await page.reload();
    await expect(page.getByText(/Customize\s+Fighter\s+Level 1/)).toBeVisible({ timeout: 10_000 });
    const reloadedRow = page.locator('table tbody tr').filter({ hasText: /Abilities.*Strength.*Misc/ });
    await expect(reloadedRow).toBeVisible({ timeout: 10_000 });
  });

  test('owner can edit class-level distinctive fields (saves + feats) on a fork', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `Class Level Fields Fork ${Date.now()}`;

    // Fork the SRD
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10_000 });

    // Navigate Classes → Fighter → Level 1 customization
    await page.getByRole('tab', { name: 'Classes' }).click();
    await page.getByRole('cell', { name: 'Fighter', exact: true }).first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/classes\/[a-f0-9-]+\/levels/);
    await page
      .locator('table tbody tr')
      .filter({ has: page.locator('td').first().getByText('1', { exact: true }) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/klass_levels\/[a-f0-9-]+\/customization/);
    await expect(page.getByText(/Customize\s+Fighter\s+Level 1/)).toBeVisible();

    // The class-level form fields (saves, feats) live on the main customization
    // page above the tabs — not inside the Modifiers tab. The form renders three
    // number TextFields (one per Save: Fortitude/Reflex/Will) and an Autocomplete
    // labelled "Feats" pre-populated with the level's class features.
    //
    // Fighter L1 default: Fortitude (good) base = 2. Bump it to 3.
    const fortitudeInput = page.getByLabel('Fortitude Save');
    await expect(fortitudeInput).toBeVisible();
    await expect(fortitudeInput).toHaveValue('2');
    await fortitudeInput.click();
    await fortitudeInput.press('Control+a');
    await fortitudeInput.fill('3');

    // Feats autocomplete: Fighter L1 grants "Bonus Feat (Fighter)" and
    // "Weapon and Armor Proficiency (Fighter)" by default. Remove the
    // Weapon and Armor Proficiency chip to mark the feats list dirty
    // and to give us a deterministic post-save assertion.
    const feats = page.getByRole('combobox', { name: 'Feats' });
    await expect(feats).toBeVisible();
    const proficiencyChip = page.locator('.MuiChip-root', { hasText: /Weapon and Armor Proficiency \(Fighter\)/ }).first();
    await expect(proficiencyChip).toBeVisible();
    await proficiencyChip.locator('[data-testid="CancelIcon"]').click();
    await expect(page.locator('.MuiChip-root', { hasText: /Weapon and Armor Proficiency \(Fighter\)/ })).toHaveCount(0);

    // The class-level form's Save submit button lives in the Class Level Details
    // card, separate from any tab-section save buttons. Scope to the card.
    const detailsCard = page.locator('form').filter({ has: page.getByLabel('Fortitude Save') });
    const saveButton = detailsCard.getByRole('button', { name: /^Save$/ });
    await expect(saveButton).toBeEnabled();
    const savePut = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/classes\/[a-f0-9-]+\/levels\/[a-f0-9-]+/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await saveButton.click();
    await savePut;

    // Persist check: reload and confirm the form re-hydrates with the new values.
    // Editing klass_levels triggers COW shadowing — entityId may change — so we
    // wait for the page heading and then re-read the inputs.
    await page.reload();
    await expect(page.getByText(/Customize\s+Fighter\s+Level 1/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Fortitude Save')).toHaveValue('3');
    await expect(page.locator('.MuiChip-root', { hasText: /Weapon and Armor Proficiency \(Fighter\)/ })).toHaveCount(0);
    await expect(page.locator('.MuiChip-root', { hasText: /Bonus Feat \(Fighter\)/ })).toBeVisible();
  });
});
