import { test, expect } from '@/tests/e2e/fixtures.ts';
import { createCharacter, signIn } from '@/tests/e2e/helpers.ts';

/**
 * Character detail page — runtime modifier management:
 *  - Create a fresh character
 *  - Open MoreVert → Manage Modifiers (opens CharacterModifiersModal)
 *  - Add a +1 Strength modifier via the path autocomplete (same shape as
 *    customization-add-modifier, but the create dialog title here is
 *    "Add Modifier" — the customization page uses "Create New Modifier")
 *  - Verify the row appears in the manager's table
 *  - Delete the modifier via the row's delete IconButton, confirm the
 *    DeleteDialog, and verify the BlankState ("No modifiers") returns.
 *
 * The Manage Modifiers wrapper is a plain `Modal` (Typography title, not
 * DialogTitle) so it has no accessible name — scope to it via
 * `[role="dialog"][aria-modal="true"]` filtered by the visible heading.
 * Nested CreateDialog / DeleteDialog do use DialogTitle and are reachable
 * via getByRole('dialog', { name: ... }).
 */
test.describe('Character — Manage Modifiers (runtime)', () => {
  test('owner adds and removes a runtime modifier via Manage Modifiers', async ({ page, ownerUser }) => {
    test.setTimeout(90_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Modifier Hero ${Date.now()}`;
    await createCharacter(page, name);

    // Open MoreVert and pick "Manage Modifiers"
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Manage Modifiers$/ }).click();

    // The wrapper Modal has no accessible name (Typography title), so scope
    // to the visible aria-modal dialog containing the "Manage Modifiers"
    // heading. Excludes Featurebase iframe role=dialogs (no aria-modal).
    const manageDialog = page
      .locator('[role="dialog"][aria-modal="true"]')
      .filter({ hasText: 'Manage Modifiers' });
    await expect(manageDialog).toBeVisible();

    // Empty state on a fresh character
    await expect(manageDialog.getByText('No modifiers')).toBeVisible();

    // Open the inner Add dialog
    await manageDialog.getByRole('button', { name: /^Add$/ }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add Modifier' });
    await expect(addDialog).toBeVisible();

    // Path autocomplete — same pattern as customization-add-modifier.e2e.ts
    await addDialog.locator('input[placeholder="Search..."]').fill('strength');
    await addDialog.getByText('Abilities › Strength › Misc').first().click({ timeout: 10_000 });

    // Path selection seeds a "0" default in the numeric value field; clear
    // before typing so we don't end up with "10".
    const valueInput = addDialog.locator('input[type="number"]');
    await valueInput.click();
    await valueInput.press('Control+a');
    await valueInput.fill('1');

    const createMod = page.waitForResponse(
      (r) => /\/api\/characters\/modifiers\/[a-f0-9-]+\/modifiers(?:\/[a-f0-9-]+)?(?:\?|$)/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await addDialog.getByRole('button', { name: /^Create$/ }).click();
    await createMod;
    await expect(addDialog).toBeHidden({ timeout: 15_000 });

    // Row appears in the manager table
    const modRow = manageDialog
      .locator('table tbody tr')
      .filter({ hasText: /Abilities.*Strength.*Misc/ });
    await expect(modRow).toBeVisible({ timeout: 15_000 });
    await expect(modRow.locator('text="1"').first()).toBeVisible();

    // Delete via the row's DeleteIcon IconButton
    await modRow.locator('[data-testid="DeleteIcon"]').click();

    const deleteDialog = page.getByRole('dialog', { name: 'Delete Modifier' });
    await expect(deleteDialog).toBeVisible();
    const deleteMod = page.waitForResponse(
      (r) => /\/api\/characters\/modifiers\/[a-f0-9-]+\/modifiers\/[a-f0-9-]+/.test(r.url()) && r.request().method() === 'DELETE' && r.ok(),
      { timeout: 15_000 },
    );
    await deleteDialog.getByRole('button', { name: /^Delete$/ }).click();
    await deleteMod;
    await expect(deleteDialog).toBeHidden({ timeout: 15_000 });

    // Row gone — and since this was the only modifier, the BlankState returns
    await expect(modRow).toHaveCount(0);
    await expect(manageDialog.getByText('No modifiers')).toBeVisible({ timeout: 15_000 });
  });
});
