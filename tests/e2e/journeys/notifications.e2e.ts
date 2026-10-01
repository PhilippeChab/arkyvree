import { expect, test } from '@/tests/e2e/fixtures.ts';
import { answerInvite, apiResponse, createCampaign, invitePlayer, notificationBell, signedInPage, unreadCount } from '@/tests/e2e/helpers.ts';

test.describe('Notifications', () => {
  test('the bell counts an invite, answers it and takes the invitee to the campaign', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const name = `Notif Bell Test ${Date.now()}`;
    const gm = await signedInPage(browser, ownerUser);
    await createCampaign(gm, name);
    await invitePlayer(gm, inviteeUser.email);

    const invitee = await signedInPage(browser, inviteeUser);
    await expect.poll(() => unreadCount(invitee), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await notificationBell(invitee).click();
    const menu = invitee.locator('[role="menu"]').first();
    await expect(menu.locator('text=/invited you to/').filter({ hasText: name }).first()).toBeVisible();
    const accepted = apiResponse(invitee, 'POST', /\/api\/campaigns\/invites\/[^/]+\/accept/);
    await menu.locator(':scope > div', { hasText: name }).first().getByRole('button', { name: 'Accept' }).click();
    await accepted;
    await expect(invitee.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });

    // The answered invite is off the bell.
    await invitee.goto('/dashboard');
    await notificationBell(invitee).click();
    await expect(invitee.locator('[role="menu"]').first().getByText(name)).toHaveCount(0);

    await gm.context().close();
    await invitee.context().close();
  });

  // Marking all read leaves invites waiting for an answer: an invitee's rejections are what the GM can clear.
  test('marking all read clears the notifications that need no answer', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const names = [`GM Mark Read A ${stamp}`, `GM Mark Read B ${stamp}`];
    const gm = await signedInPage(browser, ownerUser);
    for (const name of names) {
      await createCampaign(gm, name);
      await invitePlayer(gm, inviteeUser.email);
    }
    const invitee = await signedInPage(browser, inviteeUser);
    for (const name of names) await answerInvite(invitee, name, 'Reject');
    await invitee.context().close();

    await gm.goto('/notifications');
    const unreadRejections = gm.locator('tr', { hasText: 'declined your campaign invite' }).getByRole('img', { name: 'Unread' });
    await expect.poll(() => unreadRejections.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    const unread = await unreadCount(gm);

    const markedRead = apiResponse(gm, 'POST', /\/api\/notifications\/read-all$/);
    await gm.getByRole('button', { name: 'Mark all as read' }).click();
    await markedRead;
    await expect.poll(() => unreadRejections.count(), { timeout: 10_000 }).toBe(0);
    await expect.poll(() => unreadCount(gm), { timeout: 15_000 }).toBeLessThanOrEqual(unread - 2);

    await gm.context().close();
  });
});
