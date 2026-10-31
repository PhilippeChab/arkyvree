import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Players } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a campaign they created through it, on the seeded ruleset. */
async function createCampaign() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const { rulesetId } = await getSeedCtx();
  const name = `Campaign ${uniqueId()}`;
  const campaign = await expectOk(api.v1.campaigns.$post({ json: { description: "Into the dark", name, rulesetId } }));
  return { api, campaign, user };
}

describe("v1 campaigns", () => {
  test("creates a campaign, its creator its Game Master, and answers it as its read does", async () => {
    const { api, campaign } = await createCampaign();
    const { rulesetId } = await getSeedCtx();
    expect(campaign).toEqual({
      archived: false,
      description: "Into the dark",
      id: expect.any(String),
      name: expect.stringMatching(/^Campaign /),
      permissions: { canEdit: true, canLeave: expect.any(Boolean), canManagePlayers: true, canRevokeInvites: true },
      players: 1,
      ruleset: { id: rulesetId, name: "Core SRD 3.5" },
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
    // A user whose account is deleted leaves their slot archived, their id on it
    await Players.archive(db, { userId: left.id });

    expect((await expectOk(api.v1.campaigns[":id"].$get({ param: { id: campaign.id } }))).players).toBe(2);
    expect((await expectOk(api.v1.campaigns.$get({ query: {} }))).items[0]?.players).toBe(2);
    const slots = (await expectOk(api.v1.campaigns[":id"].players.$get({ param: { id: campaign.id }, query: {} })))
      .items;
    const archivedOf = (userId: string) => slots.find(({ user }) => user?.id === userId)?.archived;
    expect([archivedOf(left.id), archivedOf(stays.id)]).toEqual([true, false]);
  });

  test("edits a campaign's name and description, as its Game Master", async () => {
    const { api, campaign } = await createCampaign();
    const edited = await expectOk(
      api.v1.campaigns[":id"].$put({ param: { id: campaign.id }, json: { description: "Out of the dark" } }),
    );
    expect(edited).toEqual({ ...campaign, description: "Out of the dark" });
  });

  test("archives a campaign, restores it, and deletes it once archived: an active one is no archived one to delete", async () => {
    const { api, campaign } = await createCampaign();
    const param = { id: campaign.id };
    await expectStatus(api.v1.campaigns[":id"].permanent.$delete({ param }), 404);

    await expectStatus(api.v1.campaigns[":id"].$delete({ param }), 204);
    expect(await expectOk(api.v1.campaigns[":id"].$get({ param }))).toMatchObject({ archived: true });
    expect(await expectOk(api.v1.campaigns[":id"].unarchive.$post({ param }))).toEqual(campaign);

    await expectStatus(api.v1.campaigns[":id"].$delete({ param }), 204);
    await expectStatus(api.v1.campaigns[":id"].permanent.$delete({ param }), 204);
    await expectStatus(api.v1.campaigns[":id"].$get({ param }), 404);
  });

  test("refuses a campaign the key's user isn't in, and one that doesn't exist", async () => {
    const { campaign } = await createCampaign();
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    const param = { id: campaign.id };
    // A campaign the user isn't in is unknown to them, as one that doesn't exist
    await expectStatus(api.v1.campaigns[":id"].$get({ param }), 404);
    await expectStatus(api.v1.campaigns[":id"].$put({ param, json: { name: "Mine now" } }), 404);
    await expectStatus(api.v1.campaigns[":id"].$delete({ param }), 404);
    await expectStatus(api.v1.campaigns[":id"].$get({ param: { id: NIL_UUID } }), 404);
  });

  test("refuses a campaign on a ruleset the key's user can't build on", async () => {
    const { user } = await createTestUser();
    const { api } = await createKeyedApi(user.id);
    const privateRuleset = await createTestRuleset((await createTestUser()).user.id);
    await expectStatus(api.v1.campaigns.$post({ json: { name: "Nope", rulesetId: privateRuleset.id } }), 404);
    await expectStatus(api.v1.campaigns.$post({ json: { name: "Nope", rulesetId: NIL_UUID } }), 404);
    await expectStatus(api.v1.campaigns.$post({ json: { name: "", rulesetId: NIL_UUID } }), 400);
  });
});
