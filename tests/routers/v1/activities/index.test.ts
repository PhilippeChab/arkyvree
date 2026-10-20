import { describe, expect, test } from "bun:test";

import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createCharacterAs } from "@/tests/support/characters.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user's key, and a campaign they created through it. */
async function setup() {
  const { user } = await createTestUser();
  const { api } = await createKeyedApi(user.id);
  const { rulesetId } = await getSeedCtx();
  const campaign = await expectOk(api.v1.campaigns.$post({ json: { name: "Logged", rulesetId } }));
  return { api, campaign, user };
}

describe("v1 activities", () => {
  test("lists what the key's user did, each's target named by its kind, filtered by kind or type", async () => {
    const { api, campaign } = await setup();
    const created = {
      createdAt: expect.any(String),
      data: null,
      id: expect.any(String),
      target: { id: campaign.id, kind: "campaigns" },
      type: "createCampaign",
    };
    expect(await expectOk(api.v1.activities.$get({ query: {} }))).toEqual({
      items: [created],
      nextPage: null,
      page: 1,
    });
    expect((await expectOk(api.v1.activities.$get({ query: { kind: "campaigns" } }))).items).toEqual([created]);
    expect((await expectOk(api.v1.activities.$get({ query: { kind: "characters" } }))).items).toEqual([]);
    expect((await expectOk(api.v1.activities.$get({ query: { type: "archiveCampaign" } }))).items).toEqual([]);
  });

  test("answers the app's page of what an activity is about, a kind v1 renames read back", async () => {
    const { api, campaign } = await setup();
    const { klassMap, rulesetId } = await getSeedCtx();
    const targets = api.v1.activities.targets[":kind"][":targetId"];
    expect(await expectOk(targets.$get({ param: { kind: "campaigns", targetId: campaign.id } }))).toEqual({
      path: `/campaigns/${campaign.id}`,
    });
    const fighter = klassMap.pc["Fighter"]!;
    expect(await expectOk(targets.$get({ param: { kind: "classes", targetId: fighter } }))).toEqual({
      path: `/rulesets/${rulesetId}/classes/${fighter}`,
    });
  });

  test("refuses a target that's gone or has no page, and one the key's user lost access to", async () => {
    const { api, user } = await setup();
    const targets = api.v1.activities.targets[":kind"][":targetId"];
    await expectStatus(targets.$get({ param: { kind: "campaigns", targetId: NIL_UUID } }), 404);
    await expectStatus(targets.$get({ param: { kind: "users", targetId: user.id } }), 404);

    const owner = await createTestUser("owner");
    const character = await createCharacterAs(owner.session);
    const invite = await CharacterContributorsService.inviteContributor(owner.session, character.id, user.emailAddress);
    await CharacterContributorsService.revokeContributor(owner.session, character.id, invite.id);
    await expectStatus(targets.$get({ param: { kind: "character_contributors", targetId: invite.id } }), 403);
  });
});
