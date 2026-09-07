import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Override management on a fork:
 *  - Fork the SRD
 *  - Rename Human (creates a "modified" override row)
 *  - Open the "Local changes" dialog from the fork's MoreVert menu
 *  - Verify the override is listed under Races with the "modified" chip
 *  - Click the Restore icon to revert the override
 *  - Verify the row goes away (the dialog ends up showing "No local changes")
 *
 * This is the only place the "Local changes" / OverridesDialog flow is
 * exercised in e2e — the rest of the cow tests only confirm that the
 * fork shows the renamed entity, never that revert un-does it.
 */
test.describe('Fork override management', () => {
  test('owner can list and revert an override via Local changes', async ({ page, ownerUser }) => {
    test.setTimeout(90_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `Override Fork ${Date.now()}`;
    const renamedHuman = `Override Test ${Date.now()}`;

    // Fork SRD
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10_000 });

    const forkId = page.url().match(/\/rulesets\/([a-f0-9-]+)/)?.[1];
    expect(forkId).toBeTruthy();

    // Modify Human → creates a "modified" override
    await page.getByRole('tab', { name: 'Races' }).click();
    await page.locator('text=Human').first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+\/customization/);

    const nameField = page.getByLabel('Name', { exact: true }).first();
    await nameField.fill(renamedHuman);
    await page.locator('form').filter({ has: page.getByLabel('Name') }).first()
      .getByRole('button', { name: /^Save$/ }).click();

    // Wait for the rename to round-trip — the form's Name input value
    // updates after the PUT response settles.
    await expect(nameField).toHaveValue(renamedHuman, { timeout: 10_000 });

    // Back to the fork's main page so the More-Vert menu renders
    // "Local changes" (it's only shown when isFork is true on the
    // ruleset detail page).
    await page.goto(`/rulesets/${forkId}`);
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10_000 });

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Local changes/ }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Local changes' });
    await expect(dialog).toBeVisible();

    // Override grouped under Races with a "modified" chip on the row
    await expect(dialog.getByText('Races', { exact: true })).toBeVisible();
    const overrideRow = dialog.getByRole('listitem').filter({ hasText: renamedHuman });
    await expect(overrideRow).toBeVisible();
    await expect(overrideRow.locator('.MuiChip-root', { hasText: 'modified' })).toBeVisible();

    // Revert
    const revertResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/entities\/[^/]+\/[^/]+\/restore/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await overrideRow.locator('[data-testid="RestoreIcon"]').click();
    await revertResponse;

    // Row is gone — and since this was the only override, the dialog
    // collapses to "No local changes".
    await expect(dialog.getByText('No local changes')).toBeVisible({ timeout: 15_000 });
  });
});
