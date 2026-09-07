import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter, selectOption } from '@/tests/e2e/helpers.ts';

/**
 * Character sheet inventory CRUD: add an item, equip it, edit its
 * quantity, then delete it. Exercises the EquipmentSection mutations
 * end-to-end (POST /api/characters/inventory + PATCH + DELETE) and
 * confirms the sheet reflects the changes.
 *
 * Item choice: "Amulet of Health +2" is a wondrous item with slot
 * "Neck" and no proficiency requirements, so it equips cleanly without
 * triggering the proceed-anyway warning path.
 */
test.describe('Character inventory CRUD', () => {
  test('owner adds, equips, edits, then deletes an item from a character', async ({ page, ownerUser }) => {
    test.setTimeout(90_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Inventory Hero ${Date.now()}`;
    await createCharacter(page, name);

    // BlankState "Add Item" — only one such button at this point
    await page.getByRole('button', { name: 'Add Item' }).click();

    const addDialog = page.getByRole('dialog', { name: 'Add Item to Inventory' });
    await expect(addDialog).toBeVisible();

    // Search and pick Amulet of Health +2. Selecting an item fires a
    // separate `/api/rulesets/:id/items/:itemId` query whose response
    // populates the auto-detect-slot effect (slot=Neck for a wondrous
    // item with slot=Neck). We MUST wait for that response before
    // clicking Create — otherwise the submit races the effect and the
    // item is added with equipped=false / location=null.
    const itemSearch = addDialog.getByRole('combobox', { name: 'Search Item' });
    await itemSearch.click();
    await itemSearch.fill('Amulet of Health');
    const itemDetailResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[^/]+\/items\/[^/]+$/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.getByRole('option', { name: 'Amulet of Health +2' }).click();
    await itemDetailResponse;

    // Wait for the Add Item POST and the follow-up character refetch
    // to land before we move on. Under parallel load these can lag,
    // and a click on the Edit icon while React is still committing
    // the new row gets intercepted by transitioning MUI elements.
    const addItemResponse = page.waitForResponse(
      (r) => r.url().includes('/api/characters/inventory') && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await addDialog.getByRole('button', { name: /^Create$/ }).click();
    await addItemResponse;
    await expect(addDialog).toBeHidden({ timeout: 10_000 });

    // Row appears with the equipped Neck slot
    const inventoryRow = page.locator('table tbody tr', { hasText: 'Amulet of Health +2' }).first();
    await expect(inventoryRow).toBeVisible({ timeout: 15_000 });
    await expect(inventoryRow.getByText('Neck', { exact: false })).toBeVisible();

    // Under load the auto-opened Level Up wizard occasionally reappears
    // mid-test via a delayed character refetch. Dismiss if present.
    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    if (await wizard.isVisible().catch(() => false)) {
      await wizard.getByRole('button', { name: 'Cancel' }).click();
      await expect(wizard).toBeHidden({ timeout: 10_000 });
    }
    await inventoryRow.locator('[data-testid="EditIcon"]').click();
    const editDialog = page.getByRole('dialog', { name: 'Edit Inventory Item' });
    await expect(editDialog).toBeVisible();
    const qty = editDialog.locator('input[name="quantity"]');
    await qty.fill('2');
    await editDialog.getByRole('button', { name: /^Update$/ }).click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });

    await expect(
      page.locator('table tbody tr', { hasText: 'Amulet of Health +2' }).first().getByText('2', { exact: true }).first(),
    ).toBeVisible();

    // The character refetch after Update can re-open the Level Up wizard
    // (same race the pre-edit guard handles); dismiss before the delete
    // click or the wizard backdrop intercepts pointer events.
    if (await wizard.isVisible().catch(() => false)) {
      await wizard.getByRole('button', { name: 'Cancel' }).click();
      await expect(wizard).toBeHidden({ timeout: 10_000 });
    }
    // Delete
    await page.locator('table tbody tr', { hasText: 'Amulet of Health +2' }).first().locator('[data-testid="DeleteIcon"]').click();
    const deleteDialog = page.getByRole('dialog', { name: 'Remove Item' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: /^Delete$/ }).click();
    await expect(deleteDialog).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText('No equipment')).toBeVisible({ timeout: 10_000 });
  });

  test('owner equips a weapon to Main Hand and re-equips to Two Handed', async ({ page, ownerUser }) => {
    test.setTimeout(90_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Weapon Wielder ${Date.now()}`;
    await createCharacter(page, name);

    // BlankState "Add Item"
    await page.getByRole('button', { name: 'Add Item' }).click();

    const addDialog = page.getByRole('dialog', { name: 'Add Item to Inventory' });
    await expect(addDialog).toBeVisible();

    // Pick the Longsword — type "Weapon" so the location dropdown becomes
    // a Hand Slot picker (Main Hand / Off Hand / Two Handed).
    const itemSearch = addDialog.getByRole('combobox', { name: 'Search Item' });
    await itemSearch.click();
    await itemSearch.fill('Longsword');
    // Option labels include cost+weight, e.g. "Longsword 15.00gp | 4.00 lbs".
    // Anchor on word-boundary to avoid matching "Masterwork Cold Iron Longsword".
    await page.getByRole('option', { name: /^Longsword\s/ }).first().click();

    // Wait for the Hand Slot picker to appear (item details query resolves).
    // "Hand Slot" appears as both the label <div> and a <span> inside the
    // Select — use .first() to dodge the strict-mode duplicate match.
    await expect(addDialog.getByText('Hand Slot').first()).toBeVisible({ timeout: 10_000 });

    // Pick "Main Hand" — selectOption scopes to the open modal dialog
    await selectOption(page, 'Hand Slot', 'Main Hand');

    // weaponSet defaults to 0; leave it as-is.
    const addItemResponse = page.waitForResponse(
      (r) => r.url().includes('/api/characters/inventory') && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await addDialog.getByRole('button', { name: /^Create$/ }).click();

    // A class-less level-0 character has no proficiency conflicts, so
    // requirement validation passes silently. If a warning DOES appear
    // (e.g., the character later gains a class that prohibits martial
    // weapons), accept the proceed-anyway path.
    const addProceed = addDialog.getByRole('button', { name: 'Proceed Anyway' });
    if (await addProceed.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await addProceed.click();
    }
    await addItemResponse;
    await expect(addDialog).toBeHidden({ timeout: 10_000 });

    // Row appears with the equipped Main Hand slot — formatSlotDisplay
    // renders hand slots as "<Slot> (Set <n>)". Scope to the Equipment
    // & Inventory paper so we don't pick up the Weapons table row,
    // which renders the same item name with "(Main Hand)" but no
    // weaponSet suffix.
    const inventoryPaper = page.locator('div', { hasText: /^Equipment & Inventory/ }).first();
    const longswordRow = inventoryPaper.locator('table tbody tr', { hasText: 'Longsword' }).first();
    await expect(longswordRow).toBeVisible();
    await expect(longswordRow.getByText('Main Hand (Set 0)')).toBeVisible();

    // Under load the auto-opened Level Up wizard occasionally reappears
    // mid-test via a delayed character refetch. Dismiss if present.
    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    if (await wizard.isVisible().catch(() => false)) {
      await wizard.getByRole('button', { name: 'Cancel' }).click();
      await expect(wizard).toBeHidden({ timeout: 10_000 });
    }
    // Edit — change the Hand Slot to "Two Handed"
    await longswordRow.locator('[data-testid="EditIcon"]').click();
    const editDialog = page.getByRole('dialog', { name: 'Edit Inventory Item' });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByText('Hand Slot').first()).toBeVisible();

    await selectOption(page, 'Hand Slot', 'Two Handed');

    await editDialog.getByRole('button', { name: /^Update$/ }).click();

    // Same proficiency warning fires on update; Proceed Anyway again.
    const editProceed = editDialog.getByRole('button', { name: 'Proceed Anyway' });
    if (await editProceed.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await editProceed.click();
    }
    await expect(editDialog).toBeHidden({ timeout: 10_000 });

    // Row's Slot column now reads "Two Handed (Set 0)"
    await expect(
      inventoryPaper.locator('table tbody tr', { hasText: 'Longsword' }).first().getByText('Two Handed (Set 0)'),
    ).toBeVisible();
  });
});
