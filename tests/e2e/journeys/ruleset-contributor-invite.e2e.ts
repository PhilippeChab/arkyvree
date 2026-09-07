import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Ruleset contributor invite flow — full journey:
 *  - Owner forks the SRD
 *  - Owner invites another user as Editor
 *  - Invitee accepts the invitation from /notifications
 *  - Invitee uses their granted Editor permission to rename a Race in the fork
 *  - The owner sees the rename when they reload the fork's race list
 */
test.describe('Ruleset Contributor Invite Flow', () => {
  test('Editor invitee can accept and edit ruleset content the owner sees', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(60_000);
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    const forkName = `Contrib Fork ${Date.now()}`;
    const renamedRace = `Editor Touched ${Date.now()}`;

    // ── Owner forks the SRD ────────────────────────────────────
    await ownerPage.goto('/rulesets');
    await ownerPage.locator('h6:has-text("Core SRD 3.5")').first().click();
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = ownerPage.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(ownerPage.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10000 });
    const forkUrl = ownerPage.url();
    const forkId = forkUrl.match(/\/rulesets\/([a-f0-9-]+)/)?.[1];
    expect(forkId).toBeTruthy();

    // ── Owner opens Contributors and sends an invite ───────────
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: 'Contributors' }).click();
    const contributorsModal = ownerPage.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Contributors' }).first();
    await expect(contributorsModal).toBeVisible();
    await contributorsModal.getByRole('button', { name: /^Invite$/ }).click();

    const inviteDialog = ownerPage.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Invite Contributor' });
    await expect(inviteDialog).toBeVisible();
    await inviteDialog.getByLabel('Email address').fill(inviteeUser.email);
    const inviteSent = ownerPage.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/contributors/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteDialog.getByRole('button', { name: /^Invite$/ }).click();
    await inviteSent;

    // ── Invitee accepts via notifications ──────────────────────
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);

    await inviteePage.goto('/notifications');
    const inviteRow = inviteePage.locator('tr').filter({ hasText: forkName }).first();
    await expect(inviteRow).toBeVisible({ timeout: 10000 });
    const acceptResponse = inviteePage.waitForResponse(
      (r) => /\/api\/rulesets\/contributors\/invites\/[^/]+\/accept/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 },
    );
    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    await acceptResponse;

    // ── Invitee uses Editor permission to rename a Race ────────
    await inviteePage.goto(`/rulesets/${forkId}`);
    await expect(inviteePage.getByRole('heading', { name: forkName })).toBeVisible();

    await inviteePage.getByRole('tab', { name: 'Races' }).click();
    await inviteePage.locator('text=Human').first().click();
    await expect(inviteePage).toHaveURL(/\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+\/customization/);

    // The race form should be editable (Editor role grants canEdit)
    const nameField = inviteePage.getByLabel('Name', { exact: true }).first();
    await expect(nameField).toBeVisible();
    await nameField.fill(renamedRace);
    const racePut = inviteePage.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteePage.locator('form').filter({ has: inviteePage.getByLabel('Name') }).first()
      .getByRole('button', { name: /^Save$/ }).click();
    await racePut;

    // ── Owner reloads the fork's race list and sees the edit ──
    await ownerPage.goto(`/rulesets/${forkId}/races`);
    await expect(ownerPage.locator(`text="${renamedRace}"`).first()).toBeVisible({ timeout: 10000 });

    await ownerContext.close();
    await inviteeContext.close();
  });
});
