import { describe, expect, test } from "bun:test";

import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCampaignInvite } from "@/tests/support/campaigns.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

/**
 * A new user invited to a campaign of the seeded user's, which gives them an
 * invite notification. Once they accept, the seeded user is notified too.
 */
async function invite() {
  const invitee = await createSignedInUser("notified");
  const { invite } = await postCampaignInvite(invitee.user.emailAddress);
  return { notifications: invitee.api.api.notifications, invitee, inviteId: invite.id };
}

describe("notifications", () => {
  test("lists notifications, counts the unread ones and marks one read", async () => {
    const { notifications } = await invite();
    const { items } = await expectOk(notifications.$get({ query: {} }));
    expect(items.map((n) => n.type)).toEqual(["createCampaignInvite"]);
    expect((await expectOk(notifications.unread.$get())).count).toBe(1);

    await expectOk(notifications[":id"].read.$post({ param: { id: items[0].id } }));
    expect((await expectOk(notifications.unread.$get())).count).toBe(0);
    expect((await expectOk(notifications.$get({ query: { unreadOnly: "true" } }))).items).toEqual([]);
    expect((await expectOk(notifications.$get({ query: {} }))).items).toHaveLength(1);
  });

  test("marks every notification read except the ones waiting for an answer", async () => {
    const { notifications, invitee, inviteId } = await invite();
    const { api: ownerApi } = await createSignedInUser("owner");
    // A notification that needs no answer: the owner of another campaign sees the invitee join it.
    const joined = await postCampaignInvite(invitee.user.emailAddress, ownerApi);
    await expectOk(
      invitee.api.api.campaigns.invites[":inviteId"].accept.$post({ param: { inviteId: joined.invite.id } }),
    );

    const ownerNotifications = ownerApi.api.notifications;
    expect((await expectOk(ownerNotifications.unread.$get())).count).toBe(1);
    expect(await expectOk(ownerNotifications["read-all"].$post())).toEqual({ success: true });
    expect((await expectOk(ownerNotifications.unread.$get())).count).toBe(0);

    // The invitee's pending invite to the seeded user's campaign stays unread until answered.
    await expectOk(notifications["read-all"].$post());
    const unread = await expectOk(notifications.$get({ query: { unreadOnly: "true" } }));
    expect(unread.items.map((n) => n.targetId)).toContain(inviteId);
  });

  test("requires a session", async () => {
    await expectStatus(guestApi.api.notifications.$get({ query: {} }), 401);
  });

  test("returns 404 for a missing notification, or another user's, which stays unread", async () => {
    await expectStatus(api.api.notifications[":id"].read.$post({ param: { id: NIL_UUID } }), 404);
    const { notifications } = await invite();
    const [theirs] = (await expectOk(notifications.$get({ query: {} }))).items;
    await expectStatus(api.api.notifications[":id"].read.$post({ param: { id: theirs.id } }), 404);
    expect((await expectOk(notifications.unread.$get())).count).toBe(1);
  });
});
