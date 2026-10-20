import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Players } from "@/server/repositories/index.ts";
import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createCharacterAs, createTestCharacter } from "@/tests/support/characters.ts";
import { queuedPdfJobs } from "@/tests/support/jobs.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user in a campaign's slot of `role`, their key's client. */
async function joinAs(campaignId: string, role: "Game Master" | "Player Character") {
  const { user, session } = await createTestUser();
  if (role === "Player Character") await Players.create(db, { campaignId, role, userId: user.id });
  return { api: (await createKeyedApi(user.id)).api, session, user };
}

/** A campaign with its Game Master, a player with a character of theirs, and another player, each with a key. */
async function setup() {
  const { user: gm } = await createTestUser("gm");
  const { campaign } = await createTestCampaign(gm.id);
  const player = await joinAs(campaign.id, "Player Character");
  const other = await joinAs(campaign.id, "Player Character");
  const character = await createCharacterAs(player.session);
  return { campaign, character, gm: (await createKeyedApi(gm.id)).api, other, player };
}

/** A character the setup's player linked to its campaign, `Partial` unless `visibility` says otherwise. */
async function setupLinked(visibility: "Partial" | "Private" | "Public" = "Partial") {
  const context = await setup();
  const { campaign, character, player } = context;
  await expectOk(
    player.api.v1.campaigns[":id"].characters.$post({
      param: { id: campaign.id },
      json: { characterId: character.id, visibility },
    }),
  );
  return { ...context, param: { characterId: character.id, id: campaign.id } };
}

describe("v1 campaign characters", () => {
  test("links a character of the key's user's that the campaign could link, which it can't link twice", async () => {
    const { campaign, character, player } = await setup();
    const param = { id: campaign.id };
    const linkable = player.api.v1.campaigns[":id"]["linkable-characters"];
    expect((await expectOk(linkable.$get({ param, query: {} }))).items).toEqual([
      { id: character.id, name: character.name },
    ]);

    const characters = player.api.v1.campaigns[":id"].characters;
    const link = await expectOk(characters.$post({ param, json: { characterId: character.id } }));
    expect(link).toEqual({ characterId: character.id, visibility: "Private" });
    expect((await expectOk(linkable.$get({ param, query: {} }))).items).toEqual([]);
    await expectStatus(characters.$post({ param, json: { characterId: character.id } }), 409);
  });

  test("refuses a character on another ruleset, and one of another user's", async () => {
    const { campaign, character, other, player } = await setup();
    const elsewhere = await createTestCharacter(player.user.id, {
      rulesetId: (await createTestRuleset(player.user.id)).id,
    });
    const param = { id: campaign.id };
    await expectStatus(
      player.api.v1.campaigns[":id"].characters.$post({ param, json: { characterId: elsewhere.id } }),
      400,
    );
    await expectStatus(
      other.api.v1.campaigns[":id"].characters.$post({ param, json: { characterId: character.id } }),
      404,
    );
  });

  test("lists a campaign's characters, a `Partial` one by its identity alone to the other players", async () => {
    const { campaign, character, gm, other, player } = await setupLinked();
    const list = async (client: typeof gm) =>
      (await expectOk(client.v1.campaigns[":id"].characters.$get({ param: { id: campaign.id }, query: {} }))).items;
    const whole = {
      classes: [],
      id: character.id,
      level: 0,
      name: character.name,
      race: "Human",
      visibility: "Partial" as const,
    };

    expect(await list(player.api)).toEqual([{ ...whole, own: true, partial: false }]);
    expect(await list(gm)).toEqual([{ ...whole, own: false, partial: false }]);
    expect(await list(other.api)).toEqual([{ ...whole, level: null, own: false, partial: true }]);
  });

  test("answers a linked character's sheet, or its identity alone to whom it's `Partial`", async () => {
    const { character, gm, other, param } = await setupLinked();
    const sheet = await expectOk(gm.v1.campaigns[":id"].characters[":characterId"].$get({ param }));
    expect(sheet).toMatchObject({
      own: false,
      partial: false,
      sheet: { id: character.id, name: character.name },
      visibility: "Partial",
    });

    expect(await expectOk(other.api.v1.campaigns[":id"].characters[":characterId"].$get({ param }))).toEqual({
      own: false,
      partial: true,
      sheet: {
        id: character.id,
        identity: { age: 25, gender: "Male", height: "180", weight: "80" },
        name: character.name,
        race: { id: expect.any(String), name: "Human", size: "Medium", speed: 30 },
      },
      visibility: "Partial",
    });
  });

  test("changes what the other players see of a character its player linked: `Private` hides it", async () => {
    const { gm, other, param, player } = await setupLinked();
    const route = player.api.v1.campaigns[":id"].characters[":characterId"];
    expect(await expectOk(route.$put({ param, json: { visibility: "Private" } }))).toEqual({
      characterId: param.characterId,
      visibility: "Private",
    });
    await expectStatus(other.api.v1.campaigns[":id"].characters[":characterId"].$get({ param }), 404);
    await expectOk(gm.v1.campaigns[":id"].characters[":characterId"].$get({ param }));
    await expectStatus(
      gm.v1.campaigns[":id"].characters[":characterId"].$put({ param, json: { visibility: "Public" } }),
      403,
    );
  });

  test("queues a linked character's PDF for its player and the Game Master, not the other players", async () => {
    const { character, gm, other, param, player } = await setupLinked();
    const pdf = (client: typeof gm) => client.v1.campaigns[":id"].characters[":characterId"].pdf.$post({ param });
    expect(await expectOk(pdf(gm))).toMatchObject({ fileName: `${character.name}-sheet.pdf`, status: "pending" });
    expect(await expectOk(pdf(player.api))).toMatchObject({ status: "pending" });
    await expectStatus(pdf(other.api), 404);
    expect((await queuedPdfJobs(character.id)).map(({ payload }) => payload.campaignId)).toEqual([param.id, param.id]);
  });

  test("refuses a stranger, and a campaign that doesn't exist", async () => {
    const { campaign, param } = await setupLinked("Public");
    const { api } = await createKeyedApi((await createTestUser()).user.id);
    await expectStatus(api.v1.campaigns[":id"].characters.$get({ param: { id: campaign.id }, query: {} }), 403);
    await expectStatus(api.v1.campaigns[":id"].characters[":characterId"].$get({ param }), 403);
    await expectStatus(api.v1.campaigns[":id"].characters.$get({ param: { id: NIL_UUID }, query: {} }), 404);
    await expectStatus(
      api.v1.campaigns[":id"]["linkable-characters"].$get({ param: { id: NIL_UUID }, query: {} }),
      404,
    );
  });
});
