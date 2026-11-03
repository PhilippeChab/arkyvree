import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("v1 campaign invites", () => {
  test("lists the invites a campaign sent, each with its slot and whom it went to", async () => {
    const { user: gm } = await createTestUser("gm");
    const { user: invitee } = await createTestUser("invitee");
    const { campaign } = await createTestCampaign(gm.id);
    const { api } = await createKeyedApi(gm.id);
    const param = { id: campaign.id };
    const slot = await expectOk(
      api.v1.campaigns[":id"].players.$post({ param, json: { email: invitee.emailAddress, role: "Player Character" } }),
    );

    expect(await expectOk(api.v1.campaigns[":id"].invites.$get({ param, query: {} }))).toEqual({
      items: [
        {
          email: invitee.emailAddress,
          id: slot.invite!.id,
          player: { id: slot.id, role: "Player Character" },
          status: "Pending",
          user: { id: invitee.id, username: invitee.username },
        },
      ],
      nextPage: null,
      page: 1,
    });
  });

  test("shows a player the invites a campaign sent, and whom to, without their addresses, nor finds them by one", async () => {
    const { user: gm } = await createTestUser("gm");
    const { user: player } = await createTestUser("player");
    const { user: invitee } = await createTestUser("invitee");
    const { campaign } = await createTestCampaign(gm.id);
    const { api: gmApi } = await createKeyedApi(gm.id);
    const { api: playerApi } = await createKeyedApi(player.id);
    const param = { id: campaign.id };
    const role = "Player Character" as const;
    const seat = await expectOk(
      gmApi.v1.campaigns[":id"].players.$post({ param, json: { email: player.emailAddress, role } }),
    );
    await expectOk(playerApi.v1["campaign-invites"][":id"].accept.$post({ param: { id: seat.invite!.id } }));
    await expectOk(gmApi.v1.campaigns[":id"].players.$post({ param, json: { email: invitee.emailAddress, role } }));

    const { items } = await expectOk(playerApi.v1.campaigns[":id"].invites.$get({ param, query: {} }));
    expect(items).toContainEqual(
      expect.objectContaining({ email: null, user: { id: invitee.id, username: invitee.username } }),
    );
    const players = await expectOk(playerApi.v1.campaigns[":id"].players.$get({ param, query: {} }));
    expect(players.items.flatMap(({ invite }) => (invite ? [invite.email] : []))).toEqual([null]);

    // Nor do they find them by searching one: the Game Master does
    const query = { search: invitee.emailAddress };
    expect((await expectOk(playerApi.v1.campaigns[":id"].invites.$get({ param, query }))).items).toEqual([]);
    expect(
      (await expectOk(playerApi.v1.campaigns[":id"].players.$get({ param, query: { search: player.emailAddress } })))
        .items,
    ).toEqual([]);
    expect((await expectOk(gmApi.v1.campaigns[":id"].invites.$get({ param, query }))).items).toHaveLength(1);
  });

  test("refuses a stranger, and a campaign that doesn't exist", async () => {
    const { campaign } = await createTestCampaign((await createTestUser()).user.id);
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    await expectStatus(api.v1.campaigns[":id"].invites.$get({ param: { id: campaign.id }, query: {} }), 404);
    await expectStatus(api.v1.campaigns[":id"].invites.$get({ param: { id: NIL_UUID }, query: {} }), 404);
  });
});
