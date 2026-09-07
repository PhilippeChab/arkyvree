import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';

/**
 * Character contributor invite flow — full journey:
 *  - Owner creates a character and invites a collaborator
 *  - Invitee accepts via /notifications
 *  - Invitee renames the character inline (the action contributors are invited to do)
 *  - Owner sees the rename when they reload
 */
test.describe('Character Contributor Invite Flow', () => {
  test('contributor invitee can accept and rename the character the owner sees', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(60_000);
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    const characterName = `Shared Hero ${Date.now()}`;
    const renamedByContributor = `${characterName} edited by contributor`;
    await createCharacter(ownerPage, characterName);

    const characterUrl = ownerPage.url();
    expect(characterUrl).toMatch(/\/characters\/[a-f0-9-]+/);

    // Open Contributors via the actions menu
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: 'Contributors' }).click();

    const contributorsDialog = ownerPage.getByRole('dialog', { name: 'Contributors' });
    await expect(contributorsDialog).toBeVisible();
    await contributorsDialog.getByRole('button', { name: /^Invite$/ }).click();

    const inviteDialog = ownerPage.getByRole('dialog', { name: 'Invite Contributor' });
    await expect(inviteDialog).toBeVisible();
    await inviteDialog.locator('input[name="email"]').fill(inviteeUser.email);
    await inviteDialog.getByRole('button', { name: /^Invite$/ }).click();

    // ── Invitee accepts ────────────────────────────────────────
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

    // ── Invitee opens the character and edits it ──────────────
    await inviteePage.goto('/characters');
    await inviteePage.getByRole('button', { name: 'Filter' }).click();
    const inviteeFilterMenu = inviteePage.getByRole('menu');
    await expect(inviteeFilterMenu).toBeVisible();
    await inviteeFilterMenu.getByRole('menuitem', { name: /^Shared$/ }).click();
    await expect(inviteePage.locator(`text="${characterName}"`).first()).toBeVisible({ timeout: 10000 });

    await inviteePage.locator(`text="${characterName}"`).first().click();
    await expect(inviteePage.locator(`h5:has-text("${characterName}")`)).toBeVisible({ timeout: 10000 });

    // Inline rename — clicking the heading enters edit mode
    await inviteePage.locator(`h5:has-text("${characterName}")`).first().click();
    const focused = inviteePage.locator('input:focus');
    await expect(focused).toBeVisible();
    await focused.fill(renamedByContributor);
    const renamePut = inviteePage.waitForResponse(
      (r) => /\/api\/characters\/[a-f0-9-]+(?:\?|$)/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await focused.press('Enter');
    await renamePut;
    await expect(inviteePage.locator(`h5:has-text("${renamedByContributor}")`)).toBeVisible({ timeout: 15_000 });

    // ── Owner reloads and sees the contributor's edit ─────────
    await ownerPage.goto(characterUrl);
    await expect(ownerPage.locator(`h5:has-text("${renamedByContributor}")`)).toBeVisible({ timeout: 10000 });

    await ownerContext.close();
    await inviteeContext.close();
  });
});
