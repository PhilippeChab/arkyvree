import { test, expect } from '@/tests/e2e/fixtures.ts';
import { answerInvite, createCampaign, invitePlayer, signedInPage, unreadCount } from '@/tests/e2e/helpers.ts';

test.describe('Campaign invites', () => {
  test('an invitee who accepts joins the campaign, and the GM sees them as a player', async ({ browser, ownerUser, inviteeUser }) => {
    const name = `Invite Test ${Date.now()}`;
    const gm = await signedInPage(browser, ownerUser);
    await createCampaign(gm, name);
    await invitePlayer(gm, inviteeUser.email);

    const invitee = await signedInPage(browser, inviteeUser);
    await answerInvite(invitee, name, 'Accept');
    await invitee.goto('/campaigns');
    await invitee.locator(`text="${name}"`).first().click();
    await expect(invitee.getByRole('heading', { name })).toBeVisible();

    await gm.reload();
    await expect(gm.locator('text="Invite Pending"')).toHaveCount(0);
    await expect(gm.locator(`text="${inviteeUser.email}"`).first()).toBeVisible();

    await gm.context().close();
    await invitee.context().close();
  });

  test('an invitee who rejects stays out, the invite read and answered', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const name = `Invite Reject Test ${Date.now()}`;
    const gm = await signedInPage(browser, ownerUser);
    await createCampaign(gm, name);
    await invitePlayer(gm, inviteeUser.email);

    const invitee = await signedInPage(browser, inviteeUser);
    await expect.poll(() => unreadCount(invitee), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    const unread = await unreadCount(invitee);
    await answerInvite(invitee, name, 'Reject');
    await expect(invitee.locator('tr', { hasText: name }).filter({ has: invitee.getByRole('button', { name: 'Reject' }) })).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(() => unreadCount(invitee), { timeout: 15_000 }).toBe(unread - 1);

    await invitee.goto('/campaigns');
    await expect(invitee.locator(`text="${name}"`)).toHaveCount(0);

    await gm.context().close();
    await invitee.context().close();
  });
});
