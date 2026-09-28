import { describe, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { EmailVerifications, Users } from "@/server/repositories/index.ts";
import { api, apiAs, createSignedInUser, expectOk, guestApi, sessionIdFrom } from "@/tests/api.ts";
import { getSeedCtx, NIL_UUID, uniqueId } from "@/tests/helpers.ts";

const invites = api.api.campaigns.invites;

/** A campaign of the seeded user with an invite sent to `email`. */
async function createInvite(email: string) {
  const { rulesetId } = await getSeedCtx();
  const { campaign } = await expectOk(api.api.campaigns.$post({ json: { name: "Invites Campaign", rulesetId } }));
  const { invite } = await expectOk(api.api.campaigns[":id"].players.$post({ param: { id: campaign.id }, json: { email, role: "Player Character" } }));
  return { campaignId: campaign.id, inviteId: invite!.id };
}

/** An invite sent to a new user, and a client signed in as them. */
async function createInviteForNewUser() {
  const invitee = await createSignedInUser("invitee");
  return { ...(await createInvite(invitee.user.emailAddress)), invitee };
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
    expect(await expectOk(theirs[":inviteId"].$get({ param: { inviteId } }))).toMatchObject({ id: inviteId, status: "Pending" });
    expect(await expectOk(theirs[":inviteId"].accept.$post({ param: { inviteId } }))).toMatchObject({ status: "Accepted" });
  });

  test("lets the invitee reject an invite", async () => {
    const { inviteId, invitee } = await createInviteForNewUser();
    const rejected = await expectOk(invitee.api.api.campaigns.invites[":inviteId"].reject.$post({ param: { inviteId } }));
    expect(rejected.status).toBe("Rejected");
  });

  test("lets the Game Master revoke an invite", async () => {
    const { inviteId } = await createInviteForNewUser();
    expect(await expectOk(invites[":inviteId"].revoke.$post({ param: { inviteId } }))).toMatchObject({ status: "Revoked" });
  });

  test("hands an email-only invite to whoever signs up with that email", async () => {
    const email = `email-only-${uniqueId()}@example.com`;
    const { inviteId } = await createInvite(email);

    await expectOk(guestApi.auth["sign-up"].$post({ json: { emailAddress: email, password: "password1234", passwordConfirmation: "password1234" } }));
    const user = await Users.findOne(db, { emailAddress: email });
    const verification = await EmailVerifications.findOne(db, { userId: user!.id });
    const verified = await guestApi.auth["verify-email"].$post({ json: { emailAddress: email, code: verification!.code } });
    await expectOk(verified);
    const theirs = apiAs(sessionIdFrom(verified)).api.campaigns.invites;
    expect(await expectOk(theirs.me.$get())).toMatchObject([{ id: inviteId, status: "Pending" }]);
    expect(await expectOk(theirs[":inviteId"].accept.$post({ param: { inviteId } }))).toMatchObject({ status: "Accepted" });
  });

  test("requires a session", async () => {
    const { campaignId } = await createInviteForNewUser();
    expect((await guestApi.api.campaigns[":id"].invites.$get({ param: { id: campaignId }, query: {} })).status).toBe(401);
  });

  test("returns 404 for a missing campaign or invite", async () => {
    expect((await api.api.campaigns[":id"].invites.$get({ param: { id: NIL_UUID }, query: {} })).status).toBe(404);
    const param = { inviteId: NIL_UUID };
    expect((await invites[":inviteId"].$get({ param })).status).toBe(404);
    expect((await invites[":inviteId"].accept.$post({ param })).status).toBe(404);
    expect((await invites[":inviteId"].reject.$post({ param })).status).toBe(404);
    expect((await invites[":inviteId"].revoke.$post({ param })).status).toBe(404);
  });
});
