import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A campaign whose Game Master invited a new user into a slot, through the public API: both users' clients. */
async function invite() {
  const { user: gm } = await createTestUser("gm");
  const { user: invitee } = await createTestUser("invitee");
  const { campaign } = await createTestCampaign(gm.id);
  const { api: gmApi } = await createKeyedApi(gm.id);
  const { api } = await createKeyedApi(invitee.id);
  const slot = await expectOk(
    gmApi.v1.campaigns[":id"].players.$post({
      param: { id: campaign.id },
      json: { email: invitee.emailAddress, role: "Player Character" },
    }),
  );
  return { api, campaign, gmApi, id: slot.invite!.id, invitee };
}

describe("v1 campaign invites to the key's user", () => {
  test("reads one, and accepts it: the user takes its slot", async () => {
    const { api, campaign, id } = await invite();
    const received = {
      campaign: { id: campaign.id, name: campaign.name },
      id,
      role: "Player Character" as const,
      status: "Pending",
    };
    expect(await expectOk(api.v1["campaign-invites"][":id"].$get({ param: { id } }))).toEqual(received);

    expect(await expectOk(api.v1["campaign-invites"][":id"].accept.$post({ param: { id } }))).toEqual({
      id,
      status: "Accepted",
    });
    expect(await expectOk(api.v1.campaigns[":id"].$get({ param: { id: campaign.id } }))).toMatchObject({
      permissions: { canEdit: false },
      players: 2,
    });
    await expectStatus(api.v1["campaign-invites"][":id"].reject.$post({ param: { id } }), 409);
  });

  test("rejects one", async () => {
    const { api, id } = await invite();
    expect(await expectOk(api.v1["campaign-invites"][":id"].reject.$post({ param: { id } }))).toEqual({
      id,
      status: "Rejected",
    });
  });

  test("lets the Game Master revoke a pending one, which can't be answered then", async () => {
    const { api, gmApi, id } = await invite();
    // Its invitee isn't in the campaign yet: its revoke is unknown to them
    await expectStatus(api.v1["campaign-invites"][":id"].revoke.$post({ param: { id } }), 404);
    expect(await expectOk(gmApi.v1["campaign-invites"][":id"].revoke.$post({ param: { id } }))).toEqual({
      id,
      status: "Revoked",
    });
    await expectStatus(api.v1["campaign-invites"][":id"].accept.$post({ param: { id } }), 409);
  });

  test("hides another campaign's invite from a stranger who would revoke it", async () => {
    const { id } = await invite();
    const { api: strangerApi } = await createKeyedApi((await createTestUser("stranger")).user.id);
    await expectStatus(strangerApi.v1["campaign-invites"][":id"].revoke.$post({ param: { id } }), 404);
  });

  test("hides another user's invite, and one that doesn't exist", async () => {
    const { gmApi, id } = await invite();
    for (const inviteId of [id, NIL_UUID]) {
      const param = { id: inviteId };
      await expectStatus(gmApi.v1["campaign-invites"][":id"].$get({ param }), 404);
      await expectStatus(gmApi.v1["campaign-invites"][":id"].accept.$post({ param }), 404);
      await expectStatus(gmApi.v1["campaign-invites"][":id"].reject.$post({ param }), 404);
    }
  });
});
