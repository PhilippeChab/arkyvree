import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';

test.describe('Contributor viewer scope', () => {
  test('a viewer-role contributor can read but not edit a shared character', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    const characterName = `Viewer Scope Hero ${Date.now()}`;
    await createCharacter(ownerPage, characterName);

    const characterUrl = ownerPage.url();
    expect(characterUrl).toMatch(/\/characters\/[a-f0-9-]+/);

    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: 'Contributors' }).click();

    const contributorsDialog = ownerPage.getByRole('dialog', { name: 'Contributors' });
    await expect(contributorsDialog).toBeVisible();
    await contributorsDialog.getByRole('button', { name: /^Invite$/ }).click();

    const inviteDialog = ownerPage.getByRole('dialog', { name: 'Invite Contributor' });
    await expect(inviteDialog).toBeVisible();
    await inviteDialog.locator('input[name="email"]').fill(inviteeUser.email);
    const inviteSent = ownerPage.waitForResponse(
      (r) => /\/api\/characters\/[a-f0-9-]+\/contributors/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteDialog.getByRole('button', { name: /^Invite$/ }).click();
    await inviteSent;
    await expect(inviteDialog).toBeHidden({ timeout: 15_000 });

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);

    await inviteePage.goto('/notifications');
    const inviteRow = inviteePage.locator('tr').filter({ hasText: characterName }).first();
    await expect(inviteRow).toBeVisible({ timeout: 10000 });
    const acceptResponse = inviteePage.waitForResponse(
      (r) => /\/api\/characters\/contributors\/invites\/[^/]+\/accept/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    await acceptResponse;

    await inviteePage.goto('/characters');
    await inviteePage.getByRole('button', { name: 'Filter' }).click();
    const filterMenu = inviteePage.getByRole('menu');
    await expect(filterMenu).toBeVisible();
    await filterMenu.getByRole('menuitem', { name: /^Shared$/ }).click();
    await expect(inviteePage.locator(`text="${characterName}"`).first()).toBeVisible({ timeout: 10000 });

    await inviteePage.locator(`text="${characterName}"`).first().click();
    await expect(inviteePage.locator(`h5:has-text("${characterName}")`)).toBeVisible({ timeout: 10000 });

    await inviteePage.locator('[data-testid="MoreVertIcon"]').first().click();
    const menu = inviteePage.getByRole('menu');
    await expect(menu).toBeVisible();

    await expect(menu.getByRole('menuitem', { name: 'Share' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Archive' })).toHaveCount(0);

    await inviteePage.keyboard.press('Escape');

    await ownerContext.close();
    await inviteeContext.close();
  });
});
