import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Users } from "@/server/repositories/index.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi, sessionIdFrom } from "@/tests/support/api.ts";
import { postCampaignInvite } from "@/tests/support/campaigns.ts";
import { apiAs } from "@/tests/support/clients.ts";
import { NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { findVerificationCode } from "@/tests/support/users.ts";

const invites = api.api.campaigns.invites;

/** An invite sent to a new user, and a client signed in as them. */
async function createInviteForNewUser() {
  const invitee = await createSignedInUser("invitee");
  const { campaign, invite } = await postCampaignInvite(invitee.user.emailAddress);
  return { campaignId: campaign.id, inviteId: invite.id, invitee };
}

describe("campaigns invites", () => {
  test("lists a campaign's invites with the invitee's public fields only", async () => {
    const { campaignId, invitee } = await createInviteForNewUser();
    const result = await expectOk(api.api.campaigns[":id"].invites.$get({ param: { id: campaignId }, query: {} }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].users?.emailAddress).toBe(invitee.user.emailAddress);
    expect(result.items[0].users).not.toHaveProperty("passwordDigest");
  });

  test("shows the invitee their invite and lets them accept it", async () => {
    const { inviteId, invitee } = await createInviteForNewUser();
    const theirs = invitee.api.api.campaigns.invites;
    expect((await expectOk(theirs.me.$get())).map((i) => i.id)).toEqual([inviteId]);
    expect(await expectOk(theirs[":inviteId"].$get({ param: { inviteId } }))).toMatchObject({
      id: inviteId,
      status: "Pending",
    });
    expect(await expectOk(theirs[":inviteId"].accept.$post({ param: { inviteId } }))).toMatchObject({
      status: "Accepted",
    });
  });

  test("lets the invitee reject an invite", async () => {
    const { inviteId, invitee } = await createInviteForNewUser();
    const rejected = await expectOk(
      invitee.api.api.campaigns.invites[":inviteId"].reject.$post({ param: { inviteId } }),
    );
    expect(rejected.status).toBe("Rejected");
  });

  test("lets the Game Master revoke an invite", async () => {
    const { inviteId } = await createInviteForNewUser();
    expect(await expectOk(invites[":inviteId"].revoke.$post({ param: { inviteId } }))).toMatchObject({
      status: "Revoked",
    });
  });

  test("hands an email-only invite to whoever signs up with that email", async () => {
    const email = `email-only-${uniqueId()}@example.com`;
    const { id: inviteId } = (await postCampaignInvite(email)).invite;

    await expectOk(
      guestApi.auth["sign-up"].$post({
        json: { emailAddress: email, password: "password1234", passwordConfirmation: "password1234" },
      }),
    );
    const user = await Users.findOne(db, { emailAddress: email });
    const verified = await guestApi.auth["verify-email"].$post({
      json: { emailAddress: email, code: await findVerificationCode(user!.id) },
    });
    await expectOk(verified);
    const theirs = apiAs(sessionIdFrom(verified)).api.campaigns.invites;
    expect(await expectOk(theirs.me.$get())).toMatchObject([{ id: inviteId, status: "Pending" }]);
    expect(await expectOk(theirs[":inviteId"].accept.$post({ param: { inviteId } }))).toMatchObject({
      status: "Accepted",
    });
  });

  test("requires a session", async () => {
    const { campaignId } = await createInviteForNewUser();
    await expectStatus(guestApi.api.campaigns[":id"].invites.$get({ param: { id: campaignId }, query: {} }), 401);
  });

  test("returns 404 for a missing campaign or invite", async () => {
    await expectStatus(api.api.campaigns[":id"].invites.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    const param = { inviteId: NIL_UUID };
    await expectStatus(invites[":inviteId"].$get({ param }), 404);
    await expectStatus(invites[":inviteId"].accept.$post({ param }), 404);
    await expectStatus(invites[":inviteId"].reject.$post({ param }), 404);
    await expectStatus(invites[":inviteId"].revoke.$post({ param }), 404);
  });
});
