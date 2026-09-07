import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

test.describe('Ruleset Fork', () => {
  test('forks the SRD ruleset and the fork shows up in the Forked filter', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    const forkName = `My Fork ${Date.now()}`;

    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+/);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill(forkName);
    const forkResponse = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/fork/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await forkResponse;

    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 15_000 });

    await page.goto('/rulesets?scope=forked');
    await expect(page.locator(`h6:has-text("${forkName}")`)).toBeVisible();
  });

  test('fork dialog blocks submit when the name is empty', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);

    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="name"]').fill('');
    await dialog.getByRole('button', { name: /Fork Ruleset/ }).click();

    await expect(dialog).toBeVisible();
  });
});
