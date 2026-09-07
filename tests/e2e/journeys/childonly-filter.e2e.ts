import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Local-changes (childOnly) toggle on a fork's section pages:
 *  - Fork the Core SRD
 *  - Rename Human in the fork (creates exactly ONE local override)
 *  - The Races list shows many races (inherited + the one override)
 *  - Toggling "Local changes" narrows the list to only the override
 *  - Toggling it off restores the full list
 */
test.describe('childOnly filter on a forked ruleset section', () => {
  test('childOnly toggle on a fork section narrows the list to local overrides', async ({ page, ownerUser }) => {
    test.setTimeout(60_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `ChildOnly Fork ${Date.now()}`;
    const renamedHuman = `Wandering Folk ${Date.now()}`;

    // ── Fork the SRD ─────────────────────────────────────────────
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10000 });

    // ── Open Races, click Human, rename it ──────────────────────
    await page.getByRole('tab', { name: 'Races' }).click();
    await page.locator('text=Human').first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+\/customization/);

    const nameField = page.getByLabel('Name', { exact: true }).first();
    await expect(nameField).toBeVisible();
    await nameField.fill(renamedHuman);

    const forkUrl = page.url();
    const forkId = forkUrl.match(/\/rulesets\/([a-f0-9-]+)\//)?.[1];
    expect(forkId).toBeTruthy();

    const racePut = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await page.locator('form').filter({ has: page.getByLabel('Name') }).first()
      .getByRole('button', { name: /^Save$/ }).click();
    await racePut;

    // ── Return to the fork's Races section ──────────────────────
    await page.goto(`/rulesets/${forkId}/races`);
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`text="${renamedHuman}"`).first()).toBeVisible({ timeout: 15_000 });

    // ── Verify the table shows the full inherited race list ─────
    // The fork should display all SRD races (Dwarf, Elf, Gnome, Half-Elf,
    // Half-Orc, Halfling, the renamed Human, …). The DOM rows we want
    // are inside the table body — at least 5 rows means childOnly is OFF.
    const tableRows = page.locator('table tbody tr');
    const initialRowCount = await tableRows.count();
    expect(initialRowCount).toBeGreaterThanOrEqual(5);
    await expect(page.locator('text=Dwarf').first()).toBeVisible();
    await expect(page.locator('text=Elf').first()).toBeVisible();

    // ── Click the "Local changes" toggle ────────────────────────
    const toggle = page.getByRole('button', { name: 'Local changes' });
    await expect(toggle).toBeVisible();
    await toggle.click();

    // URL gains childOnly=true
    await expect(page).toHaveURL(/childOnly=true/);

    // ── Table now contains only the renamed Human row ──────────
    await expect(tableRows).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator(`text="${renamedHuman}"`).first()).toBeVisible();
    await expect(page.locator('table tbody').getByText('Dwarf', { exact: true })).toHaveCount(0);
    await expect(page.locator('table tbody').getByText('Elf', { exact: true })).toHaveCount(0);

    // ── Toggle off — full list returns ──────────────────────────
    await toggle.click();
    await expect(page).toHaveURL(/childOnly=false/);
    // Wait for an inherited race to come back BEFORE counting; the
    // overridden Human row alone makes `tableRows.first()` already
    // visible, so without this wait we'd race the API refetch.
    await expect(page.locator('table tbody').getByText('Dwarf', { exact: true }))
      .toBeVisible({ timeout: 10_000 });
    const restoredRowCount = await tableRows.count();
    expect(restoredRowCount).toBeGreaterThanOrEqual(5);
    await expect(page.locator('text=Elf').first()).toBeVisible();
    await expect(page.locator(`text="${renamedHuman}"`).first()).toBeVisible();
  });
});
