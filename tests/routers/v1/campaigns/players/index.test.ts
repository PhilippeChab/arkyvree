import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A campaign of a new Game Master's, their key, and another user to invite. */
async function setup() {
  const { user: gm } = await createTestUser("gm");
  const { user: invitee } = await createTestUser("invitee");
  const { campaign, player } = await createTestCampaign(gm.id);
  const { api } = await createKeyedApi(gm.id);
  return { api, campaign, gm, gmSlot: player, invitee, players: api.v1.campaigns[":id"].players };
}

describe("v1 campaign players", () => {
  test("lists a campaign's slots: each one's role, its user and its pending invite", async () => {
    const { campaign, gm, gmSlot, invitee, players } = await setup();
    const param = { id: campaign.id };
    expect(await expectOk(players.$get({ param, query: {} }))).toEqual({
      items: [
        {
          archived: false,
          id: gmSlot.id,
          invite: null,
          joinedAt: expect.any(String),
          role: "Game Master",
          user: { id: gm.id, username: gm.username },
        },
      ],
      nextPage: null,
      page: 1,
    });

    const slot = await expectOk(
      players.$post({ param, json: { email: invitee.emailAddress, role: "Player Character" } }),
    );
    expect(slot).toEqual({
      id: expect.any(String),
      invite: { email: invitee.emailAddress, id: expect.any(String), status: "Pending" },
      role: "Player Character",
      userId: null,
    });
    const { items } = await expectOk(players.$get({ param, query: { search: gm.emailAddress } }));
    expect(items.map(({ id }) => id)).toEqual([gmSlot.id]);
    // A test's rows share their transaction's time: its slots tie on their creation
    const listed = (await expectOk(players.$get({ param, query: {} }))).items;
    expect(listed.find(({ id }) => id === slot.id)).toEqual({
      archived: false,
      id: slot.id,
      invite: slot.invite,
      joinedAt: null,
      role: "Player Character",
      user: null,
    });
  });

  test("changes a slot's role, invites into an open one, and removes it", async () => {
    const { campaign, invitee, players } = await setup();
    const param = { id: campaign.id };
    const slot = await expectOk(players.$post({ param, json: { role: "Player Character" } }));
    expect(slot.invite).toBeNull();
    const playerParam = { ...param, playerId: slot.id };

    const invited = await expectOk(
      players[":playerId"].$put({ param: playerParam, json: { email: invitee.emailAddress, role: "Game Master" } }),
    );
    expect(invited).toMatchObject({ invite: { email: invitee.emailAddress, status: "Pending" }, role: "Game Master" });
    // A slot whose invite is pending takes no other
    await expectStatus(
      players[":playerId"].$put({ param: playerParam, json: { email: "other@example.com", role: "Game Master" } }),
      409,
    );

    await expectStatus(players[":playerId"].$delete({ param: playerParam }), 204);
    expect((await expectOk(players.$get({ param, query: {} }))).items).toHaveLength(1);
  });

  test("refuses removing the last Game Master, and a slot of another campaign", async () => {
    const { campaign, gm, gmSlot, players } = await setup();
    await expectStatus(players[":playerId"].$delete({ param: { id: campaign.id, playerId: gmSlot.id } }), 409);
    const { player: elsewhere } = await createTestCampaign(gm.id);
    await expectStatus(players[":playerId"].$delete({ param: { id: campaign.id, playerId: elsewhere.id } }), 404);
  });

  test("refuses a stranger, and a campaign that doesn't exist", async () => {
    const { campaign } = await setup();
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    const players = api.v1.campaigns[":id"].players;
    await expectStatus(players.$get({ param: { id: campaign.id }, query: {} }), 403);
    await expectStatus(players.$post({ param: { id: campaign.id }, json: { role: "Player Character" } }), 403);
    await expectStatus(players.$get({ param: { id: NIL_UUID }, query: {} }), 404);
  });
});
