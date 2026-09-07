import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Extension subscribe / unsubscribe flow:
 *  - Owner forks the SRD
 *  - Owner subscribes to "Complete Arcane SRD 3.5" via the menu
 *  - "1 extension" chip appears on the fork header
 *  - Spells tab on the fork now lists a Complete Arcane spell ("Cloud Chariot")
 *    — proves extension content actually propagates, not just the
 *    subscription badge
 *  - Owner unsubscribes via the chip popover; the chip disappears and
 *    the same spell is no longer reachable from the fork
 */
test.describe('Ruleset Extension Subscribe / Unsubscribe', () => {
  test('subscribed extension content appears in the fork; unsubscribe removes it', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `Extension Fork ${Date.now()}`;

    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10000 });

    // Subscribe to Complete Arcane
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Subscribe\b/ }).click();
    const subscribeDialog = page.getByRole('dialog', { name: 'Subscribe to Extensions' });
    await expect(subscribeDialog).toBeVisible();
    await subscribeDialog.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('option', { name: /Complete Arcane/ }).click();
    const subscribeResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/subscribe/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await subscribeDialog.getByRole('button', { name: /^Subscribe$/ }).click();
    await subscribeResponse;

    await expect(page.locator('text="1 extension"').first()).toBeVisible({ timeout: 15_000 });

    // Content propagation — the fork's Spells tab must now include a
    // Complete Arcane spell. "Cloud Chariot" is a Complete Arcane cantrip
    // unique to that extension; if it doesn't appear, the subscription
    // didn't actually wire the content through.
    await page.getByRole('tab', { name: 'Spells' }).click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/powers/);
    await page.getByPlaceholder('Search spells...').fill('Cloud Chariot');
    await expect(
      page.getByRole('cell', { name: 'Cloud Chariot', exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // Unsubscribe via the chip popover
    await page.locator('text="1 extension"').first().click();
    const arcaneChip = page.locator('.MuiChip-root').filter({ hasText: 'Complete Arcane' }).first();
    await expect(arcaneChip).toBeVisible();
    await arcaneChip.locator('[data-testid="CancelIcon"]').click();

    const unsubscribeDialog = page.getByRole('dialog', { name: 'Unsubscribe from Extension' });
    await expect(unsubscribeDialog).toBeVisible();
    const unsubscribeResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/unsubscribe/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await unsubscribeDialog.getByRole('button', { name: /^Unsubscribe$/ }).click();
    await unsubscribeResponse;

    await expect(page.locator('text="1 extension"')).toHaveCount(0, { timeout: 15_000 });

    // And the propagated content is gone — re-search yields nothing.
    await page.getByRole('tab', { name: 'Spells' }).click();
    await page.getByPlaceholder('Search spells...').fill('Cloud Chariot');
    await expect(
      page.getByRole('cell', { name: 'Cloud Chariot', exact: true }),
    ).toHaveCount(0, { timeout: 10000 });
  });
});
