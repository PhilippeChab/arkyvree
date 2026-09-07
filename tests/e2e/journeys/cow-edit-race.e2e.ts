import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Copy-on-write edit of a forked ruleset entity:
 *  - Fork the Core SRD
 *  - In the fork, open the Human race and rename it
 *  - The fork's race list reflects the new name
 *  - The base SRD's Human is untouched (parent unaffected by the override)
 */
test.describe('COW Edit on a Forked Ruleset', () => {
  test('renaming Human in a fork does not change Human in the base SRD', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `COW Fork ${Date.now()}`;
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

    // ── Open Races, click Human, rename in customization page ───
    await page.getByRole('tab', { name: 'Races' }).click();
    await page.locator('text=Human').first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+\/customization/);

    // Race form is editable in a fork — locate the Name field and rename
    const nameField = page.getByLabel('Name', { exact: true }).first();
    await expect(nameField).toBeVisible();
    await nameField.fill(renamedHuman);

    // Capture the fork's ruleset id from the URL before saving
    const forkUrl = page.url();
    const forkId = forkUrl.match(/\/rulesets\/([a-f0-9-]+)\//)?.[1];
    expect(forkId).toBeTruthy();

    // Submit the race-details form (a Save button inside the Race Details card)
    const racePut = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await page.locator('form').filter({ has: page.getByLabel('Name') }).first()
      .getByRole('button', { name: /^Save$/ }).click();
    await racePut;

    // ── The fork's Races list now shows the renamed entity ──────
    await page.goto(`/rulesets/${forkId}/races`);
    await expect(page.locator(`text="${renamedHuman}"`).first()).toBeVisible({ timeout: 15_000 });

    // ── The base SRD is unaffected ──────────────────────────────
    await page.goto('/rulesets');
    const coreCard = page.locator('h6:has-text("Core SRD 3.5")').first();
    await expect(coreCard).toBeVisible();
    await coreCard.click();
    await page.getByRole('tab', { name: 'Races' }).click();
    await expect(page.locator('text=Human').first()).toBeVisible();
    await expect(page.locator(`text="${renamedHuman}"`)).toHaveCount(0);
  });
});
