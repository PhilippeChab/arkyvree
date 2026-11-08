import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Players } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { createFork, findSeededBase } from "@/tests/support/v1.ts";

/** A new user's key, and a campaign they created through it, on the seeded ruleset. */
async function createCampaign() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const { id: rulesetId } = await findSeededBase();
  const name = `Campaign ${uniqueId()}`;
  const campaign = await expectOk(api.v1.campaigns.$post({ json: { description: "Into the dark", name, rulesetId } }));
  return { api, campaign, user };
}

describe("v1 campaigns", () => {
  test("creates a campaign, its creator its Game Master, and answers it as its read does", async () => {
    const { api, campaign } = await createCampaign();
    const { id: rulesetId, name } = await findSeededBase();
    expect(campaign).toEqual({
      archived: false,
      description: "Into the dark",
      id: expect.any(String),
      name: expect.stringMatching(/^Campaign /),
      permissions: {
        canArchive: true,
        canEdit: true,
        canHardDelete: false,
        // Its last Game Master, whom the campaign keeps
        canLeave: false,
        canLinkCharacters: true,
        canManagePlayers: true,
        canRevokeInvites: true,
        canUnarchive: false,
      },
      players: 1,
      ruleset: { id: rulesetId, name },
    });
    expect(await expectOk(api.v1.campaigns[":id"].$get({ param: { id: campaign.id } }))).toEqual(campaign);
  });

  test("lists the key's user's campaigns, active, archived or both, searched by name", async () => {
    const { api, campaign } = await createCampaign();
    const { campaign: other } = await createTestCampaign((await createTestUser()).user.id);
    const summary = {
      archived: false,
      description: "Into the dark",
      id: campaign.id,
      name: campaign.name,
      players: 1,
      ruleset: campaign.ruleset,
    };
    const list = (query: Parameters<typeof api.v1.campaigns.$get>[0]["query"]) =>
      expectOk(api.v1.campaigns.$get({ query }));

    expect(await list({})).toEqual({ items: [summary], nextPage: null, page: 1 });
    expect((await list({ search: other.name })).items).toEqual([]);
    await expectStatus(api.v1.campaigns[":id"].$delete({ param: { id: campaign.id } }), 204);
    expect((await list({})).items).toEqual([]);
    const archived = { ...summary, archived: true };
    expect((await list({ visibility: "archived" })).items).toEqual([archived]);
    expect((await list({ visibility: "all", search: campaign.name.slice(-6) })).items).toEqual([archived]);
  });

  test("counts a campaign's live players alike in its list and its read, and lists an archived slot as one", async () => {
    const { api, campaign } = await createCampaign();
    const [left, stays] = [(await createTestUser()).user, (await createTestUser()).user];
    for (const { id: userId } of [left, stays])
      await Players.create(db, { campaignId: campaign.id, role: "Player Character", userId });
    // A user whose account is deleted leaves their slot archived, which names no one
    await Players.archive(db, { userId: left.id });

    expect((await expectOk(api.v1.campaigns[":id"].$get({ param: { id: campaign.id } }))).players).toBe(2);
    expect((await expectOk(api.v1.campaigns.$get({ query: {} }))).items[0]?.players).toBe(2);
    const slots = (await expectOk(api.v1.campaigns[":id"].players.$get({ param: { id: campaign.id }, query: {} })))
      .items;
    expect(slots.filter(({ archived }) => archived).map(({ user }) => user)).toEqual([null]);
    expect(slots.find(({ user }) => user?.id === stays.id)?.archived).toBe(false);
  });

  test("edits a campaign's name and description, as its Game Master", async () => {
    const { api, campaign } = await createCampaign();
    const edited = await expectOk(
      api.v1.campaigns[":id"].$put({ param: { id: campaign.id }, json: { description: "Out of the dark" } }),
    );
    expect(edited).toEqual({ ...campaign, description: "Out of the dark" });
  });

  test("archives a campaign, restores it, and deletes it once archived: an active one is refused as not archived", async () => {
    const { api, campaign } = await createCampaign();
    const param = { id: campaign.id };
    await expectStatus(api.v1.campaigns[":id"].permanent.$delete({ param }), 409);

    await expectStatus(api.v1.campaigns[":id"].$delete({ param }), 204);
    // Archived, its permissions say what's left of it: unarchive it, or delete it for good
    expect(await expectOk(api.v1.campaigns[":id"].$get({ param }))).toMatchObject({
      archived: true,
      permissions: { canArchive: false, canEdit: false, canHardDelete: true, canUnarchive: true },
    });
    expect(await expectOk(api.v1.campaigns[":id"].unarchive.$post({ param }))).toEqual(campaign);

    await expectStatus(api.v1.campaigns[":id"].$delete({ param }), 204);
    await expectStatus(api.v1.campaigns[":id"].permanent.$delete({ param }), 204);
    await expectStatus(api.v1.campaigns[":id"].$get({ param }), 404);
  });

  test("answers whether the key's user may leave a campaign as its leave decides: never as its last Game Master", async () => {
    const { api, campaign, user } = await createCampaign();
    const param = { id: campaign.id };
    expect(campaign.permissions.canLeave).toBe(false);
    const [seat] = (await expectOk(api.v1.campaigns[":id"].players.$get({ param, query: {} }))).items;
    await expectStatus(
      api.v1.campaigns[":id"].players[":playerId"].$delete({ param: { ...param, playerId: seat!.id } }),
      409,
    );

    // Another Game Master seated, either may leave, and so may a player
    const [second, player] = [(await createTestUser()).user, (await createTestUser()).user];
    await Players.create(db, { campaignId: campaign.id, role: "Game Master", userId: second.id });
    await Players.create(db, { campaignId: campaign.id, role: "Player Character", userId: player.id });
    for (const { id } of [user, second, player]) {
      const { api: member } = await createKeyedApi(id);
      expect((await expectOk(member.v1.campaigns[":id"].$get({ param }))).permissions.canLeave).toBe(true);
    }
    await expectStatus(
      api.v1.campaigns[":id"].players[":playerId"].$delete({ param: { ...param, playerId: seat!.id } }),
      204,
    );
  });

  test("refuses a campaign on a ruleset the key's user can't build on", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const privateRuleset = await createFork((await createTestUser()).user.id, (await findSeededBase()).id);
    await expectStatus(api.v1.campaigns.$post({ json: { name: "Nope", rulesetId: privateRuleset.id } }), 404);
    await expectStatus(api.v1.campaigns.$post({ json: { name: "Nope", rulesetId: NIL_UUID } }), 404);
    await expectStatus(api.v1.campaigns.$post({ json: { name: "", rulesetId: NIL_UUID } }), 400);
    await expectStatus(api.v1.campaigns.$post({ json: { name: "   ", rulesetId: NIL_UUID } }), 400);
  });
});
