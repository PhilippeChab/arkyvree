import { describe, expect, test } from "bun:test";

import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
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
    expect((await list(email.slice(0, 6))).map((p) => p.id)).toContain(gameMaster.id);
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

  test("invites an email with no account yet", async () => {
    const { id } = await postCampaign();
    const added = await expectOk(
      players.$post({ param: { id }, json: { email: "nonexistent@example.com", role: "Player Character" } }),
    );
    expect(added.invite).toMatchObject({ email: "nonexistent@example.com", userId: null });
  });

  test("adds an empty slot when no email is given", async () => {
    const { id } = await postCampaign();
    const added = await expectOk(players.$post({ param: { id }, json: { role: "Player Character" } }));
    expect(added.invite).toBeNull();
  });

  test("refuses a second invite to the same user", async () => {
    const { id } = await postCampaign();
    const { user } = await createTestUser();
    const json = { email: user.emailAddress, role: "Player Character" as const };
    await expectOk(players.$post({ param: { id }, json }));
    await expectStatus(players.$post({ param: { id }, json }), 409);
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

  test("requires a session", async () => {
    const { id } = await postCampaign();
    await expectStatus(guestApi.api.campaigns[":id"].players.$get({ param: { id }, query: {} }), 401);
  });

  test("returns 404 for a missing campaign or player", async () => {
    const { id } = await postCampaign();
    await expectStatus(players.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    await expectStatus(player.$put({ param: { id, playerId: NIL_UUID }, json: { role: "Player Character" } }), 404);
    await expectStatus(player.$delete({ param: { id, playerId: NIL_UUID } }), 404);
  });
});
