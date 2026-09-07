import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, selectOption } from '@/tests/e2e/helpers.ts';

/**
 * The Create Character dialog wires several `required` rules through
 * react-hook-form (name, ruleset, race, alignment, gender). This journey
 * exercises the dialog's blocking behaviour by submitting partial forms
 * and asserting validation messages render before finally completing the
 * happy path.
 */
test.describe('Create Character Validation', () => {
  test('create character dialog blocks submission until all required fields are filled', async ({ page, ownerUser }) => {
    test.setTimeout(60_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    await page.goto('/characters');
    await page.getByRole('button', { name: 'Create Character' }).click();

    const dialog = page.getByRole('dialog', { name: 'Create New Character' });
    await expect(dialog).toBeVisible();

    const submit = dialog.getByRole('button', { name: /^Create$/ });
    const requiredPattern = /required|cannot be empty|select.*ruleset/i;

    // Submit empty form — at least one required-field error must render.
    await submit.click();
    await expect(dialog.getByText(requiredPattern).first()).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/Name is required/i)).toBeVisible();
    await expect(dialog.getByText(/Ruleset is required/i)).toBeVisible();

    // Fill name only — ruleset error should still render.
    await dialog.locator('input[name="name"]').fill(`Validation Hero ${Date.now()}`);
    await submit.click();
    await expect(dialog.getByText(/Ruleset is required/i)).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/Name is required/i)).toHaveCount(0);

    // Pick the ruleset, leave race empty — submit must NOT navigate.
    // The Race Select shows error styling on validation but has no
    // FormHelperText, so we can't text-match the error. The behaviour
    // we care about is that submission stays blocked.
    await selectOption(page, 'Ruleset', 'Core SRD 3.5');
    await page.waitForTimeout(500);
    await submit.click();
    await expect(dialog).toBeVisible();
    await expect(page).not.toHaveURL(/\/characters\/[a-f0-9-]+/);

    // Now fill the rest of the required fields and submit successfully.
    await selectOption(page, 'Race');
    await dialog.locator('input[name="height"]').fill('5 feet 8 inches');
    await dialog.locator('input[name="weight"]').fill('150 lbs');
    await expect(dialog.getByText('Strength', { exact: true })).toBeVisible({ timeout: 10000 });
    await dialog.getByRole('button', { name: /Roll all ability scores/i }).click();
    await selectOption(page, 'Alignment');
    await selectOption(page, 'Gender');

    await submit.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15000 });
  });
});
