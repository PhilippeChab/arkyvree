import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

test.describe('Ruleset Star / Starred filter', () => {
  test('owner stars a ruleset, sees it in the Starred filter, and unstars it', async ({ page, ownerUser }) => {
    test.setTimeout(60_000);

    await signIn(page, ownerUser.email, ownerUser.password);
    await page.goto('/rulesets');

    // Locate the Core SRD 3.5 card via its heading. The whole card is clickable
    // (navigates to the detail page on bare click), so we scope the star
    // IconButton lookup inside the card to avoid the title link.
    const srdHeading = page.locator('h6:has-text("Core SRD 3.5")').first();
    await expect(srdHeading).toBeVisible({ timeout: 10_000 });
    const srdCard = srdHeading.locator('xpath=ancestor::*[contains(@class, "MuiCard-root")][1]');
    await expect(srdCard).toBeVisible();

    // Initially the SRD card shows a hollow StarBorder icon (not starred).
    // Clicking it toggles to the filled Star icon. The IconButton wraps the
    // svg; click the svg's ancestor button to dodge the SVG-not-clickable
    // pointer-events trap.
    const starBorderButton = srdCard.locator('[data-testid="StarBorderIcon"]').locator('xpath=ancestor::button[1]');
    await expect(starBorderButton).toBeVisible();
    const starOn = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/star/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await starBorderButton.click();
    await starOn;

    // After the toggle round-trips, the card now shows the filled StarIcon.
    await expect(srdCard.locator('[data-testid="StarIcon"]')).toBeVisible({ timeout: 15_000 });

    // Open the Filter menu and pick Starred.
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByRole('menuitem', { name: /^Starred$/ }).click();

    // URL reflects the scope param.
    await expect(page).toHaveURL(/scope=starred/);

    // Core SRD 3.5 is in the filtered list.
    await expect(page.locator('h6:has-text("Core SRD 3.5")')).toBeVisible({ timeout: 10_000 });

    // Toggle the star OFF: in the filtered view the card shows the filled
    // StarIcon — click its IconButton ancestor.
    const srdCardStarred = page.locator('h6:has-text("Core SRD 3.5")').first()
      .locator('xpath=ancestor::*[contains(@class, "MuiCard-root")][1]');
    const starFilledButton = srdCardStarred.locator('[data-testid="StarIcon"]').locator('xpath=ancestor::button[1]');
    await expect(starFilledButton).toBeVisible();
    const starOff = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/star/.test(r.url()) && r.request().method() === 'DELETE' && r.ok(),
      { timeout: 15_000 },
    );
    await starFilledButton.click();
    await starOff;

    // After unstarring, the Starred view should no longer contain Core SRD 3.5.
    // The query is still scoped to `starred`, so the list either empties or
    // simply drops the card.
    await expect(page).toHaveURL(/scope=starred/);
    await expect(page.locator('h6:has-text("Core SRD 3.5")')).toHaveCount(0, { timeout: 15_000 });
  });
});
