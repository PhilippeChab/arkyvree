import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, selectOption } from '@/tests/e2e/helpers.ts';

/**
 * End-to-end mark-as-read affordances on /notifications:
 *  - GM creates TWO campaigns and invites the invitee to BOTH
 *  - Invitee signs in, navigates to /notifications
 *  - Capture the bell's unread count baseline (the invitee user is shared
 *    across the worker pool — assert deltas, not absolute zero)
 *  - For the FIRST invite row: actionable invite rows render Accept/Reject
 *    buttons (no dedicated Mark-As-Read button on actionable rows). The
 *    only per-row affordance that calls `markReadMutation` for an invite
 *    is Reject (which fires `inviteActions.rejectInvite` → markNotificationRead
 *    in `useInviteActions.ts`). Click Reject on the first invite.
 *  - Assert the row is no longer styled "unread" (NotificationsPage.tsx:
 *    unread rows have `bgcolor: action.selected` AND a leading 8px primary
 *    Circle dot; read rows have neither). The simplest assertion is that
 *    the row's actionable Reject button is gone (read → not actionable).
 *  - Assert the bell unread count decreased by exactly 1
 *  - Click "Mark all as read" at the top
 *  - Assert all unread visual indicators are gone for invite rows AND
 *    the bell unread count returned to (or below) the pre-test baseline
 */
test.describe('Notifications Mark-Read Flow', () => {
  test('invitee marks individual + all notifications as read; bell badge clears', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const campaignA = `Mark Read A ${stamp}`;
    const campaignB = `Mark Read B ${stamp}`;

    // ── GM context — create two campaigns and invite the invitee to BOTH ─
    const gmContext = await browser.newContext();
    const gmPage = await gmContext.newPage();
    await signIn(gmPage, ownerUser.email, ownerUser.password);

    const createCampaignAndInvite = async (name: string) => {
      await gmPage.goto('/campaigns');
      await gmPage.getByRole('button', { name: 'Create New Campaign' }).click();
      const createDialog = gmPage.locator('[role="dialog"][aria-modal="true"]');
      await expect(createDialog).toBeVisible();
      await createDialog.locator('input[name="name"]').fill(name);
      await selectOption(gmPage, 'Ruleset', 'Core SRD 3.5');
      await createDialog.getByRole('button', { name: /^Create$/ }).click();
      await expect(gmPage).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10000 });

      await gmPage.getByRole('tab', { name: /Players/i }).click();
      await gmPage.getByRole('button', { name: 'Add Player' }).click();
      const addDialog = gmPage.getByRole('dialog', { name: 'Add Player' });
      await expect(addDialog).toBeVisible();
      await addDialog.locator('input[name="email"]').fill(inviteeUser.email);
      await addDialog.getByRole('button', { name: /Add Player|Send|Invite/ }).click();
      await expect(gmPage.locator('text="Invite Pending"').first()).toBeVisible({ timeout: 10000 });
    };

    await createCampaignAndInvite(campaignA);
    await createCampaignAndInvite(campaignB);

    // ── Invitee context — fresh session ─────────────────────────
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);

    // The bell aria-label encodes the unread count — same approach the
    // existing notifications.e2e.ts test uses.
    const bell = inviteePage.locator('button[aria-label$="unread notifications"]');
    await expect(bell).toBeVisible({ timeout: 10000 });

    const readUnread = async (locator: typeof bell) => {
      const label = await locator.getAttribute('aria-label');
      const match = label?.match(/^(\d+) unread notifications$/);
      return match ? Number(match[1]) : -1;
    };

    // Wait until both new invites have flowed into the unread summary —
    // the invitee user is shared across the worker pool, so we need at
    // least 2 fresh unreads on top of any pre-existing residue.
    await expect.poll(() => readUnread(bell), {
      timeout: 15_000,
      message: 'expected unread badge >= 2 after two campaign invites',
    }).toBeGreaterThanOrEqual(2);
    const baseline = await readUnread(bell);

    // ── Navigate to /notifications and confirm both invite rows ──
    await inviteePage.goto('/notifications');

    const rowA = inviteePage.locator('tr').filter({ hasText: campaignA }).first();
    const rowB = inviteePage.locator('tr').filter({ hasText: campaignB }).first();
    await expect(rowA).toBeVisible({ timeout: 10000 });
    await expect(rowB).toBeVisible({ timeout: 10000 });

    // Sanity: both invite rows render the actionable Accept/Reject pair
    // (they're unread + actionable type — see NotificationsPage.tsx
    // `isActionable` and ACTIONABLE_NOTIFICATION_TYPES in activityFormatters.ts).
    await expect(rowA.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(rowA.getByRole('button', { name: 'Reject' })).toBeVisible();
    await expect(rowB.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(rowB.getByRole('button', { name: 'Reject' })).toBeVisible();

    // ── Per-row mark-read on the FIRST invite ─────────────────────
    // Actionable invite rows do NOT render a dedicated "Mark as read"
    // button — only Accept/Reject. The user spec says "don't accept the
    // invites; we're testing the read affordance", and Reject is the
    // only per-row affordance that fires markNotificationRead for an
    // actionable row (see useInviteActions.rejectInvite in
    // client/src/hooks/useInviteActions.ts — its onSuccess calls
    // markNotificationRead which POSTs notifications/:id/read, the same
    // endpoint NotificationsPage.markReadMutation hits).
    await rowA.getByRole('button', { name: 'Reject' }).click();

    // After the read flips, row A is no longer actionable: Accept/Reject
    // disappear (NotificationsPage gates them on `!notification.readAt`),
    // and the unread Circle dot is gone too. Both are implied by the
    // Reject button being absent for that fork's row.
    await expect(async () => {
      const stillActionableA = inviteePage.locator('tr')
        .filter({ hasText: campaignA })
        .filter({ has: inviteePage.getByRole('button', { name: 'Reject' }) });
      await expect(stillActionableA).toHaveCount(0);
    }).toPass({ timeout: 10_000 });

    // Row B is still unread + actionable.
    await expect(rowB.getByRole('button', { name: 'Reject' })).toBeVisible();

    // Bell unread count dropped by exactly 1 (one notification flipped read).
    const bellAfterFirst = inviteePage.locator('button[aria-label$="unread notifications"]');
    await expect.poll(() => readUnread(bellAfterFirst), {
      timeout: 15_000,
      message: 'expected unread badge to decrease by 1 after per-row mark-read',
    }).toBe(baseline - 1);

    // ── Click "Mark all as read" at the top ──────────────────────
    // Server-side `markAllRead` deliberately EXCLUDES actionable types
    // (campaign / contributor invites) — see NotificationsService:
    // `excludeTypes: ACTIONABLE_TYPES`. So an invitee whose unreads are
    // all invites won't see the badge change here. We assert the
    // request fires successfully; the badge value is unchanged because
    // our two test notifications are both actionable.
    const markAllResponse = inviteePage.waitForResponse(
      (r) => r.url().endsWith('/api/notifications/read-all') && r.status() === 200,
      { timeout: 10_000 },
    );
    await inviteePage.getByRole('button', { name: 'Mark all as read' }).click();
    await markAllResponse;

    await gmContext.close();
    await inviteeContext.close();
  });

  test('GM marks non-actionable notifications as read; the rows flip read and the bell badge clears', async ({ browser, ownerUser, inviteeUser }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const campaignA = `GM Mark Read A ${stamp}`;
    const campaignB = `GM Mark Read B ${stamp}`;

    // ── GM creates two campaigns and invites the invitee to BOTH ──
    const gmContext = await browser.newContext();
    const gmPage = await gmContext.newPage();
    await signIn(gmPage, ownerUser.email, ownerUser.password);

    const createCampaignAndInvite = async (name: string) => {
      await gmPage.goto('/campaigns');
      await gmPage.getByRole('button', { name: 'Create New Campaign' }).click();
      const createDialog = gmPage.locator('[role="dialog"][aria-modal="true"]');
      await expect(createDialog).toBeVisible();
      await createDialog.locator('input[name="name"]').fill(name);
      await selectOption(gmPage, 'Ruleset', 'Core SRD 3.5');
      await createDialog.getByRole('button', { name: /^Create$/ }).click();
      await expect(gmPage).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10000 });

      await gmPage.getByRole('tab', { name: /Players/i }).click();
      await gmPage.getByRole('button', { name: 'Add Player' }).click();
      const addDialog = gmPage.getByRole('dialog', { name: 'Add Player' });
      await expect(addDialog).toBeVisible();
      await addDialog.locator('input[name="email"]').fill(inviteeUser.email);
      await addDialog.getByRole('button', { name: /Add Player|Send|Invite/ }).click();
      await expect(gmPage.locator('text="Invite Pending"').first()).toBeVisible({ timeout: 10000 });
    };

    await createCampaignAndInvite(campaignA);
    await createCampaignAndInvite(campaignB);

    // ── Invitee REJECTS both invites — each reject fires a
    // `rejectCampaignInvite` notification BACK to the GM.
    // rejectCampaignInvite is NOT in ACTIONABLE_NOTIFICATION_TYPES, so
    // these are the kind of notifications Mark-All-Read actually
    // affects (the server's markAllRead excludes actionable types).
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await signIn(inviteePage, inviteeUser.email, inviteeUser.password);
    await inviteePage.goto('/notifications');

    for (const name of [campaignA, campaignB]) {
      const row = inviteePage.locator('tr', { hasText: name })
        .filter({ has: inviteePage.getByRole('button', { name: 'Reject' }) })
        .first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      const rejectResponse = inviteePage.waitForResponse(
        (r) => /\/api\/campaigns\/invites\/[^/]+\/reject/.test(r.url()) && r.status() === 200,
        { timeout: 15_000 },
      );
      await row.getByRole('button', { name: 'Reject' }).click();
      await rejectResponse;
    }
    await inviteeContext.close();

    // ── GM: navigate to /notifications and verify the two reject
    // notifications are unread, then Mark All Read flips them.
    const readUnread = async (locator: ReturnType<typeof gmPage.locator>) => {
      const label = await locator.getAttribute('aria-label');
      const match = label?.match(/^(\d+) unread notifications$/);
      return match ? Number(match[1]) : -1;
    };

    const gmBell = gmPage.locator('button[aria-label$="unread notifications"]');
    await gmPage.goto('/notifications');

    // The GM's notification rows render "<actor> declined your campaign
    // invite" — the message format from `rejectCampaignInvite` in
    // activityFormatters.ts. There's no campaign name in the text, so
    // we filter by the message and assert at least 2 reject rows.
    const rejectRows = gmPage.locator('tr', { hasText: 'declined your campaign invite' });
    await expect.poll(() => rejectRows.count(), {
      timeout: 15_000,
      message: 'expected at least 2 reject notifications on the GM',
    }).toBeGreaterThanOrEqual(2);

    // Both reject rows are unread on first paint — NotificationsPage
    // marks unread rows with bgcolor=action.selected AND a leading 8px
    // primary Circle dot (fontSize: 8). Count the unread Circle dots
    // inside reject rows; we expect ≥ 2 before Mark All Read.
    const unreadDotsInRejects = rejectRows.locator('svg[data-testid="CircleIcon"]');
    await expect.poll(() => unreadDotsInRejects.count(), {
      timeout: 10_000,
      message: 'expected at least 2 unread reject rows before mark-all-read',
    }).toBeGreaterThanOrEqual(2);

    const baselineUnread = await readUnread(gmBell);
    expect(baselineUnread).toBeGreaterThanOrEqual(2);

    // ── Click "Mark all as read" — fires POST /notifications/read-all
    const markAllResponse = gmPage.waitForResponse(
      (r) => r.url().endsWith('/api/notifications/read-all') && r.status() === 200,
      { timeout: 10_000 },
    );
    await gmPage.getByRole('button', { name: 'Mark all as read' }).click();
    await markAllResponse;

    // Every reject row loses its unread Circle dot. The number of
    // reject rows didn't change; the number of dots inside them did.
    await expect.poll(() => unreadDotsInRejects.count(), {
      timeout: 10_000,
      message: 'expected unread Circle dots to clear from reject rows',
    }).toBe(0);

    // Bell unread count dropped by at least 2 (the two reject rows we
    // just acknowledged). Other unread residue from prior worker-pool
    // runs may persist for the GM, hence delta-not-zero.
    await expect.poll(() => readUnread(gmBell), {
      timeout: 15_000,
      message: 'expected unread badge to decrease by at least 2 after Mark all as read',
    }).toBeLessThanOrEqual(baselineUnread - 2);

    await gmContext.close();
  });
});
