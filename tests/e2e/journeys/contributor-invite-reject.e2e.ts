import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * End-to-end ruleset contributor invite REJECT flow (via /notifications):
 *  - Owner forks the SRD and sends a contributor invite to inviteeUser
 *  - Invitee signs in, navigates to /notifications (not the bell)
 *  - Invitee clicks Reject on the actionable contributor invite row
 *  - Assert the actionable row is gone (Reject button no longer present
 *    for this fork — actionable state requires unread + actionable type)
 *  - Assert the fork does NOT appear in the invitee's /rulesets list
 *    (server rejected the contributor membership)
 */
test.describe('Ruleset Contributor Invite Reject Flow', () => {
  test('invitee rejects a ruleset contributor invite from the notifications page', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const forkName = `Contrib Reject Fork ${Date.now()}`;

    // ── Owner forks the SRD and invites a contributor ──────────
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    await ownerPage.goto('/rulesets');
    await ownerPage.locator('h6:has-text("Core SRD 3.5")').first().click();
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = ownerPage.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(ownerPage.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10000 });

    // Open Contributors and send the invite
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: 'Contributors' }).click();
    const contributorsModal = ownerPage.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Contributors' }).first();
    await expect(contributorsModal).toBeVisible();
    await contributorsModal.getByRole('button', { name: /^Invite$/ }).click();

    const inviteDialog = ownerPage.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: 'Invite Contributor' });
    await expect(inviteDialog).toBeVisible();
    await inviteDialog.getByLabel('Email address').fill(inviteeUser.email);
    const inviteResponse = ownerPage.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/contributors/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteDialog.getByRole('button', { name: /^Invite$/ }).click();
    await inviteResponse;

    // ── Invitee context — open /notifications and reject ───────
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);

    await inviteePage.goto('/notifications');

    // The contributor invite row references the fork name in its message
    // ("<actor> invited you to contribute to <forkName>" or similar).
    const inviteRow = inviteePage.locator('tr').filter({ hasText: forkName }).first();
    await expect(inviteRow).toBeVisible({ timeout: 10000 });

    // Sanity: row is actionable — both Accept and Reject buttons render
    await expect(inviteRow.getByRole('button', { name: 'Accept' })).toBeVisible();
    const rejectResponse = inviteePage.waitForResponse(
      (r) => /\/api\/rulesets\/contributors\/invites\/[^/]+\/reject/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteRow.getByRole('button', { name: 'Reject' }).click();
    await rejectResponse;

    // After reject, the notification is marked read → no longer actionable.
    // The row may still render (notifications are kept after read), but the
    // Accept/Reject buttons must no longer be present for this fork's row.
    await expect(async () => {
      const stillActionable = inviteePage.locator('tr')
        .filter({ hasText: forkName })
        .filter({ has: inviteePage.getByRole('button', { name: 'Reject' }) });
      await expect(stillActionable).toHaveCount(0);
    }).toPass({ timeout: 10_000 });

    // ── Invitee does NOT see the fork in their rulesets list ──
    await inviteePage.goto('/rulesets');
    // Searching by exact fork name; rejected contributor → no membership →
    // ruleset not visible. (Owner's fork is private until published.)
    await expect(inviteePage.locator(`h6:has-text("${forkName}")`)).toHaveCount(0);

    await ownerContext.close();
    await inviteeContext.close();
  });
});
