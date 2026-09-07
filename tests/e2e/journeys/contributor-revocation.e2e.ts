import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';

/**
 * Contributor revocation flows:
 *  - Ruleset: invitee accepts, then leaves; ruleset disappears from their list and the fork URL is no longer reachable.
 *  - Character: owner removes the contributor; the character disappears from the contributor's Shared view.
 */
test.describe('Contributor Revocation', () => {
  test('ruleset Editor invitee leaves and loses access to the fork', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(60_000);
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    const forkName = `Leave Fork ${Date.now()}`;

    // Owner forks SRD
    await ownerPage.goto('/rulesets');
    await ownerPage.locator('h6:has-text("Core SRD 3.5")').first().click();
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = ownerPage.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(ownerPage.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10000 });
    const forkId = ownerPage.url().match(/\/rulesets\/([a-f0-9-]+)/)?.[1];
    expect(forkId).toBeTruthy();

    // Owner invites testuser3 as Editor
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: 'Contributors' }).click();
    const contributorsModal = ownerPage.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Contributors' }).first();
    await contributorsModal.getByRole('button', { name: /^Invite$/ }).click();
    const inviteDialog = ownerPage.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Invite Contributor' });
    await inviteDialog.getByLabel('Email address').fill(inviteeUser.email);
    const inviteSent = ownerPage.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/contributors/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteDialog.getByRole('button', { name: /^Invite$/ }).click();
    await inviteSent;

    // Invitee accepts
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);
    await inviteePage.goto('/notifications');
    const inviteRow = inviteePage.locator('tr').filter({ hasText: forkName }).first();
    await expect(inviteRow).toBeVisible({ timeout: 10000 });
    const acceptResponse = inviteePage.waitForResponse(
      (r) => /\/api\/rulesets\/contributors\/invites\/[^/]+\/accept/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    await acceptResponse;

    // Invitee opens the fork and leaves via Contributors
    await inviteePage.goto(`/rulesets/${forkId}`);
    await expect(inviteePage.getByRole('heading', { name: forkName })).toBeVisible();
    await inviteePage.locator('[data-testid="MoreVertIcon"]').first().click();
    await inviteePage.getByRole('menuitem', { name: 'Contributors' }).click();
    const inviteeContribModal = inviteePage.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Contributors' }).first();
    await inviteeContribModal.getByRole('button', { name: /^Leave$/ }).click();
    const leaveDialog = inviteePage.getByRole('dialog', { name: 'Leave Ruleset' });
    const leaveResponse = inviteePage.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/contributors\/leave/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await leaveDialog.getByRole('button', { name: /^Leave$/ }).click();
    await leaveResponse;

    // Invitee bounced to /rulesets and the fork is gone from their list
    await expect(inviteePage).toHaveURL(/\/rulesets(\?|$)/, { timeout: 15_000 });
    await expect(inviteePage.locator(`h6:has-text("${forkName}")`)).toHaveCount(0);

    // Direct URL no longer renders the fork (heading should not appear)
    await inviteePage.goto(`/rulesets/${forkId}`);
    await expect(inviteePage.getByRole('heading', { name: forkName })).toHaveCount(0, { timeout: 5000 });

    await ownerContext.close();
    await inviteeContext.close();
  });

  test('character contributor is removed by the owner and loses access', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(60_000);
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    const characterName = `Remove Hero ${Date.now()}`;
    await createCharacter(ownerPage, characterName);

    // Owner invites testuser3
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: 'Contributors' }).click();
    const contribDialog = ownerPage.getByRole('dialog', { name: 'Contributors' });
    await contribDialog.getByRole('button', { name: /^Invite$/ }).click();
    const inviteDialog = ownerPage.getByRole('dialog', { name: 'Invite Contributor' });
    await inviteDialog.locator('input[name="email"]').fill(inviteeUser.email);
    const charInviteSent = ownerPage.waitForResponse(
      (r) => /\/api\/characters\/[a-f0-9-]+\/contributors/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteDialog.getByRole('button', { name: /^Invite$/ }).click();
    await charInviteSent;

    // Invitee accepts
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);
    await inviteePage.goto('/notifications');
    const inviteRow = inviteePage.locator('tr').filter({ hasText: characterName }).first();
    await expect(inviteRow).toBeVisible({ timeout: 10000 });
    const charAccept = inviteePage.waitForResponse(
      (r) => /\/api\/characters\/contributors\/invites\/[^/]+\/accept/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    await charAccept;

    // Invitee verifies access first
    await inviteePage.goto('/characters');
    await inviteePage.getByRole('button', { name: 'Filter' }).click();
    const charactersFilterMenu = inviteePage.getByRole('menu');
    await expect(charactersFilterMenu).toBeVisible();
    await charactersFilterMenu.getByRole('menuitem', { name: /^Shared$/ }).click();
    await expect(inviteePage.locator(`text="${characterName}"`).first()).toBeVisible({ timeout: 10000 });

    // Reload so the owner sees the post-accept contributor state instead of
    // the stale Pending row from before invitee accepted.
    await ownerPage.reload();
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: 'Contributors' }).click();
    const reopened = ownerPage.getByRole('dialog', { name: 'Contributors' });
    await expect(reopened).toBeVisible();
    await expect(reopened.locator(`text="${inviteeUser.email}"`).first()).toBeVisible({ timeout: 10000 });
    // The trash icon is an IconButton with Tooltip "Remove" inside the contributor row
    await reopened.getByRole('button', { name: 'Remove' }).first().click();

    const removeConfirm = ownerPage.getByRole('dialog', { name: 'Remove Contributor' });
    await expect(removeConfirm).toBeVisible();
    const removeResponse = ownerPage.waitForResponse(
      (r) => /\/api\/characters\/[a-f0-9-]+\/contributors\/[a-f0-9-]+/.test(r.url()) && r.request().method() === 'DELETE' && r.ok(),
      { timeout: 15_000 },
    );
    await removeConfirm.getByRole('button', { name: /^Remove$/ }).click();
    await removeResponse;

    // Invitee reloads — character is gone from their Shared view
    await inviteePage.goto('/characters?view=shared');
    await expect(inviteePage.locator(`text="${characterName}"`)).toHaveCount(0, { timeout: 15_000 });

    await ownerContext.close();
    await inviteeContext.close();
  });
});
