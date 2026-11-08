import { describe, expect, test } from "bun:test";

import { api, expectOk } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { createTestUser } from "@/tests/support/users.ts";

const players = api.api.campaigns[":id"].players;
const player = players[":playerId"];

describe("campaigns players", () => {
  test("lists the creator as Game Master and finds players by username or email", async () => {
    const { id } = await postCampaign();
    const list = async (search?: string) => (await expectOk(players.$get({ param: { id }, query: { search } }))).items;

    const [gameMaster] = await list();
    expect(gameMaster.role).toBe("Game Master");
    const email = gameMaster.usersInAccount!.emailAddress;
    expect((await list(email!.slice(0, 6))).map((p) => p.id)).toContain(gameMaster.id);
    expect(await list("no-player-matches-this")).toEqual([]);
  });

  test("invites a user by email into a new player slot", async () => {
    const { id } = await postCampaign();
    const { user } = await createTestUser();
    const added = await expectOk(
      players.$post({ param: { id }, json: { email: user.emailAddress, role: "Player Character" } }),
    );
    expect(added.invite).toMatchObject({ userId: user.id });
    expect((await expectOk(players.$get({ param: { id }, query: {} }))).items.map((p) => p.id)).toContain(
      added.player.id,
    );
  });

  test("updates a player's role and removes the player", async () => {
    const { id } = await postCampaign();
    const added = await expectOk(players.$post({ param: { id }, json: { role: "Player Character" } }));
    const param = { id, playerId: added.player.id };

    const updated = await expectOk(player.$put({ param, json: { role: "Game Master" } }));
    expect(updated.player.role).toBe("Game Master");

    await expectOk(player.$delete({ param }));
    expect((await expectOk(players.$get({ param: { id }, query: {} }))).items.map((p) => p.id)).not.toContain(
      added.player.id,
    );
  });
});
