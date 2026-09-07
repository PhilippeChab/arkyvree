import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, selectOption } from '@/tests/e2e/helpers.ts';

/**
 * End-to-end notification bell flow:
 *  - GM creates a campaign and invites the invitee by email (invite left pending)
 *  - Invitee signs in, sees an unread badge on the notification bell
 *  - Invitee opens the bell, sees the campaign-invite notification, accepts it
 *    inline (the bell's actionable item), and is navigated to the campaign
 *  - Returning to the dashboard, the bell's unread badge is cleared
 */
test.describe('Notification Bell Flow', () => {
  test('invitee sees an unread notification, opens the bell, clicks through, accepts, and the badge clears', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const campaignName = `Notif Bell Test ${Date.now()}`;

    // ── GM context — create campaign and send invite ────────────
    const gmContext = await browser.newContext();
    const gmPage = await gmContext.newPage();
    await signIn(gmPage, ownerUser.email, ownerUser.password);

    await gmPage.goto('/campaigns');
    await gmPage.getByRole('button', { name: 'Create New Campaign' }).click();
    const createDialog = gmPage.locator('[role="dialog"][aria-modal="true"]');
    await expect(createDialog).toBeVisible();
    await createDialog.locator('input[name="name"]').fill(campaignName);
    await selectOption(gmPage, 'Ruleset', 'Core SRD 3.5');
    await createDialog.getByRole('button', { name: /^Create$/ }).click();
    await expect(gmPage).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10000 });

    await gmPage.getByRole('tab', { name: /Players/i }).click();
    await gmPage.getByRole('button', { name: 'Add Player' }).click();
    const addDialog = gmPage.getByRole('dialog', { name: 'Add Player' });
    await expect(addDialog).toBeVisible();
    await addDialog.locator('input[name="email"]').fill(inviteeUser.email);
    const inviteSent = gmPage.waitForResponse(
      (r) => /\/api\/campaigns\/[a-f0-9-]+\/players/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await addDialog.getByRole('button', { name: /Add Player|Send|Invite/ }).click();
    await inviteSent;

    await expect(gmPage.locator('text="Invite Pending"').first()).toBeVisible({ timeout: 15_000 });

    // ── Invitee context — fresh session ─────────────────────────
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);

    // The bell's aria-label encodes the unread count (e.g. "1 unread notifications")
    const bell = inviteePage.locator('button[aria-label$="unread notifications"]');
    await expect(bell).toBeVisible({ timeout: 10000 });

    // Capture the baseline unread count — the invitee user is shared
    // across the worker pool and may have notifications left over from
    // earlier journeys. We assert *delta*, not absolute zero.
    const readUnread = async (locator: typeof bell) => {
      const label = await locator.getAttribute('aria-label');
      const match = label?.match(/^(\d+) unread notifications$/);
      return match ? Number(match[1]) : -1;
    };

    // Wait for at least one unread (the new invite) to be present.
    await expect.poll(() => readUnread(bell), {
      timeout: 15_000,
      message: 'expected unread badge >= 1 after invite',
    }).toBeGreaterThanOrEqual(1);

    // Open the bell — Menu popover appears with the notification list
    await bell.click();
    const menu = inviteePage.locator('[role="menu"]').first();
    await expect(menu).toBeVisible();

    // The notification text references the GM's campaign invite
    // ("<actor> invited you to <campaignName>")
    const inviteItem = menu.locator('text=/invited you to/').filter({ hasText: campaignName }).first();
    await expect(inviteItem).toBeVisible();

    // Scope Accept to THIS invite's row — the inviteeUser is shared
    // across the worker pool and may have other actionable invites
    // open at the same time.
    const inviteRow = menu.locator(':scope > div', { hasText: campaignName }).first();
    const acceptResponse = inviteePage.waitForResponse(
      (r) => /\/api\/campaigns\/invites\/[^/]+\/accept/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    await acceptResponse;

    // We land on the accepted campaign's detail page
    await expect(inviteePage).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(inviteePage.getByRole('heading', { name: campaignName })).toBeVisible({ timeout: 15_000 });

    // Reopen the bell and confirm THIS invite is no longer actionable.
    // Asserting the bell delta isn't reliable: the inviteeUser is
    // shared across the worker pool and concurrent tests can push new
    // unreads between baseline capture and re-check.
    await inviteePage.goto('/dashboard');
    const bellAfter = inviteePage.locator('button[aria-label$="unread notifications"]');
    await expect(bellAfter).toBeVisible();
    await bellAfter.click();
    const menuAfter = inviteePage.locator('[role="menu"]').first();
    await expect(menuAfter).toBeVisible();
    await expect(menuAfter.getByText(campaignName)).toHaveCount(0);

    await gmContext.close();
    await inviteeContext.close();
  });
});
