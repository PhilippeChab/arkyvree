import { test, expect } from '@/tests/e2e/fixtures.ts';
import { createCharacter, selectOption, signIn } from '@/tests/e2e/helpers.ts';

/**
 * Character identity section persists edits across reload. createCharacter
 * leaves the sheet on a fresh character with default alignment (Lawful
 * Good — the first MenuItem the helper picks). Identity fields commit
 * via an explicit Save button on the form (no auto-save), so we set
 * several fields, click Save, wait for the PUT, then reload to confirm
 * server-side persistence. "Aquan" is an exotic language unlikely to be
 * a racial automatic, so adding/removing it isolates the languages path.
 */
test.describe('Character Identity Edit', () => {
  test('owner edits alignment, deity, age, and adds/removes a language; changes persist after reload', async ({ page, ownerUser }) => {
    test.setTimeout(90_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `IdentityHero ${Date.now()}`;
    await createCharacter(page, name);

    // Scope to the identity section's form-Save button (other sections render
    // their own action buttons; matching the right one matters once the save
    // round-trip starts).
    const saveButton = page.getByRole('button', { name: /^Save$/ }).first();

    // ── Alignment: Lawful Good (helper default) → Chaotic Good ─────
    await selectOption(page, 'Alignment', 'Chaotic Good');

    // ── Deity (TextField, register("deity") sets name="deity") ───
    await page.locator('input[name="deity"]').fill('Olidammara');

    // ── Age (TextField) ─────────────────────────────────────────
    await page.locator('input[name="age"]').fill('27');

    // ── Languages: open the multi-Autocombobox and add "Aquan" ──
    const languagesCombo = page.getByRole('combobox', { name: 'Languages' });
    await languagesCombo.click();
    await page.locator('[role="listbox"]').waitFor({ state: 'visible' });
    await page.getByRole('option', { name: 'Aquan' }).click();
    // Dismiss the listbox so it doesn't intercept the Save click
    await page.keyboard.press('Escape');

    // The Save button enables once the form is dirty.
    await expect(saveButton).toBeEnabled();

    // Click Save and wait for the PUT to settle before reloading.
    const savePut = page.waitForResponse(
      (resp) => resp.request().method() === 'PUT'
        && /\/api\/characters\/[a-f0-9-]+(?:\?|$)/.test(resp.url())
        && resp.status() < 400,
      { timeout: 15_000 },
    );
    await saveButton.click();
    await savePut;

    // After a successful save, form.reset() clears dirty → button disables again.
    await expect(saveButton).toBeDisabled({ timeout: 10_000 });

    // ── Reload and verify everything persisted ──────────────────
    await page.reload();
    await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });

    // Alignment select renders the chosen value as visible text inside the combobox
    await expect(
      page.locator('text="Alignment"').first().locator('..').getByRole('combobox'),
    ).toHaveText('Chaotic Good');

    await expect(page.locator('input[name="deity"]')).toHaveValue('Olidammara');
    await expect(page.locator('input[name="age"]')).toHaveValue('27');

    // Aquan chip is present inside the Languages Autocomplete
    const aquanChip = page.locator('.MuiChip-root').filter({ hasText: 'Aquan' }).first();
    await expect(aquanChip).toBeVisible();

    // ── Bonus: remove the Aquan chip, save, reload, verify gone ─
    await aquanChip.locator('[data-testid="CancelIcon"]').click();
    await expect(saveButton).toBeEnabled();

    const removePut = page.waitForResponse(
      (resp) => resp.request().method() === 'PUT'
        && /\/api\/characters\/[a-f0-9-]+(?:\?|$)/.test(resp.url())
        && resp.status() < 400,
      { timeout: 15_000 },
    );
    await saveButton.click();
    await removePut;
    await expect(saveButton).toBeDisabled({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.MuiChip-root').filter({ hasText: 'Aquan' }),
    ).toHaveCount(0);
  });
});
