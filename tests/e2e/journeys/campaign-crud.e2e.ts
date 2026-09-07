import { type Page } from '@playwright/test';
import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, selectOption } from '@/tests/e2e/helpers.ts';


async function createCampaign(page: Page, name: string) {
  await page.goto('/campaigns');
  await page.getByRole('button', { name: 'Create New Campaign' }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(name);
  await selectOption(page, 'Ruleset', 'Core SRD 3.5');
  await dialog.getByRole('button', { name: /^Create$/ }).click();
  await expect(page).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10000 });
}

test.describe('Campaign CRUD', () => {
  test('creates a campaign and the new campaign appears in the list', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Campaign ${Date.now()}`;
    await createCampaign(page, name);

    // Detail page heading shows the new name
    await expect(page.getByRole('heading', { name })).toBeVisible();

    // List shows it
    await page.goto('/campaigns');
    await expect(page.locator(`text="${name}"`).first()).toBeVisible();
  });

  test('renames a campaign via the Edit menu', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Edit Campaign ${Date.now()}`;
    const newName = `${name} renamed`;
    await createCampaign(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Edit$/ }).click();

    const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
    await dialog.locator('input[name="name"]').fill(newName);
    const renamePut = page.waitForResponse(
      (r) => /\/api\/campaigns\/[a-f0-9-]+(?:\?|$)/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: /Save Changes/ }).click();
    await renamePut;

    await expect(page.getByRole('heading', { name: newName })).toBeVisible({ timeout: 15_000 });
  });

  test('archives a campaign and unarchives it from the archived list', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Archive Campaign ${Date.now()}`;
    await createCampaign(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Archive$/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Archive Campaign' });
    await expect(dialog).toBeVisible();
    const archiveResponse = page.waitForResponse(
      (r) => /\/api\/campaigns\/[a-f0-9-]+(?:\?|$)/.test(r.url()) && r.request().method() === 'DELETE' && r.ok(),
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: /Archive Campaign/ }).click();
    await archiveResponse;

    // Lands back on /campaigns
    await expect(page).toHaveURL(/\/campaigns(\?|$)/, { timeout: 15_000 });
    await expect(page.locator(`text="${name}"`)).toHaveCount(0);

    // Archived view shows it
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.getByRole('menuitem', { name: /^Archived$/ }).click();
    await expect(page).toHaveURL(/view=archived/);
    await expect(page.locator(`text="${name}"`).first()).toBeVisible();

    // Open and unarchive
    await page.locator(`text="${name}"`).first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    const unarchiveResponse = page.waitForResponse(
      (r) => /\/api\/campaigns\/[a-f0-9-]+\/unarchive/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await page.getByRole('menuitem', { name: /^Unarchive$/ }).click();
    await unarchiveResponse;

    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });
  });
});
