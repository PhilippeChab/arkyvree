import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, selectOption } from '@/tests/e2e/helpers.ts';

/**
 * End-to-end campaign invite flow:
 *  - testuser2 (GM) creates a campaign
 *  - testuser2 invites testuser3 by email from the Players section
 *  - testuser3 signs in, sees an actionable notification, accepts it
 *  - testuser3 sees the campaign in their list and on the detail page as a player
 */
test.describe('Campaign Invite Flow', () => {
  test('GM invites a user by email; invitee accepts and the campaign shows up for them', async ({ browser, ownerUser, inviteeUser }) => {
    const campaignName = `Invite Test ${Date.now()}`;

    // ── GM context ───────────────────────────────────────────────
    const gmContext = await browser.newContext();
    const gmPage = await gmContext.newPage();
    await signIn(gmPage, ownerUser.email, ownerUser.password);

    // Create campaign
    await gmPage.goto('/campaigns');
    await gmPage.getByRole('button', { name: 'Create New Campaign' }).click();
    const createDialog = gmPage.locator('[role="dialog"][aria-modal="true"]');
    await expect(createDialog).toBeVisible();
    await createDialog.locator('input[name="name"]').fill(campaignName);
    await selectOption(gmPage, 'Ruleset', 'Core SRD 3.5');
    await createDialog.getByRole('button', { name: /^Create$/ }).click();
    await expect(gmPage).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10000 });

    // Open Players section and invite testuser3 by email
    await gmPage.getByRole('tab', { name: /Players/i }).click();
    await gmPage.getByRole('button', { name: 'Add Player' }).click();
    const addDialog = gmPage.getByRole('dialog', { name: 'Add Player' });
    await expect(addDialog).toBeVisible();
    await addDialog.locator('input[name="email"]').fill(inviteeUser.email);
    const inviteResponse = gmPage.waitForResponse(
      (r) => /\/api\/campaigns\/[a-f0-9-]+\/players/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await addDialog.getByRole('button', { name: /Add Player|Send|Invite/ }).click();
    await inviteResponse;

    // Pending invite chip appears in the players table
    await expect(gmPage.locator('text="Invite Pending"').first()).toBeVisible({ timeout: 15_000 });

    // ── Invitee context ─────────────────────────────────────────
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);

    // Notifications page surfaces actionable invite with Accept/Reject buttons
    await inviteePage.goto('/notifications');
    const inviteRow = inviteePage.locator('tr').filter({ hasText: campaignName }).first();
    await expect(inviteRow).toBeVisible({ timeout: 10000 });
    const acceptResponse = inviteePage.waitForResponse(
      (r) => /\/api\/campaigns\/invites\/[^/]+\/accept/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    await acceptResponse;

    // Campaign appears in invitee's list and on detail page
    await inviteePage.goto('/campaigns');
    await expect(inviteePage.locator(`text="${campaignName}"`).first()).toBeVisible();

    await inviteePage.locator(`text="${campaignName}"`).first().click();
    await expect(inviteePage.getByRole('heading', { name: campaignName })).toBeVisible();

    // ── GM sees invitee as an active player (no longer pending) ─
    await gmPage.reload();
    await expect(gmPage.locator('text="Invite Pending"')).toHaveCount(0);
    await expect(gmPage.locator(`text="${inviteeUser.email}"`).first()).toBeVisible();

    await gmContext.close();
    await inviteeContext.close();
  });
});
