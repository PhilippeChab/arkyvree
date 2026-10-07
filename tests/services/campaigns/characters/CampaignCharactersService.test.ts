import { describe, expect, test } from "bun:test";

import { and, eq, inArray } from "drizzle-orm";

import { klassLevelsInRules, playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, CharacterLevels, Characters, Players } from "@/server/repositories/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { measure } from "@/tests/support/database.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

type Visibility = "Private" | "Public" | "Partial";

function link(userId: string, campaignId: string, characterId: string, visibility: Visibility = "Public") {
  return CampaignCharactersService.linkCharacter(makeSession(userId), campaignId, characterId, visibility);
}

function list(userId: string, campaignId: string, pagination = { limit: 10, page: 1 }) {
  return CampaignCharactersService.getCharacters(makeSession(userId), campaignId, {}, pagination);
}

/** Gives the character the seeded class levels, as `[class, level]` pairs. */
async function addLevels(characterId: string, levels: [string, number][]) {
  const ctx = await getSeedCtx();
  for (const [klass, level] of levels) {
    const [klassLevel] = await db
      .select({ id: klassLevelsInRules.id })
      .from(klassLevelsInRules)
      .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc[klass]), inArray(klassLevelsInRules.level, [level])));
    await CharacterLevels.create(db, { characterId, klassLevelId: klassLevel.id, hp: 8 });
  }
}

/** A new user playing in the campaign, with a character of theirs linked with `visibility`. */
async function joinWithCharacter(campaignId: string, visibility: Visibility) {
  const { user } = await createTestUser("player");
  await Players.create(db, { userId: user.id, campaignId, role: "Player Character" });
  const character = await createTestCharacter(user.id);
  await link(user.id, campaignId, character.id, visibility);
  return { user, character };
}

describe("CampaignCharactersService", () => {
  describe("linkCharacter", () => {
    test.each(["Public", "Private", "Partial"] as const)(
      "links the player's character with %s visibility",
      async (visibility) => {
        const { user } = await createTestUser();
        const { campaign, player } = await createTestCampaign(user.id);
        const character = await createTestCharacter(user.id);
        expect(await link(user.id, campaign.id, character.id, visibility)).toMatchObject({
          characterId: character.id,
          playerId: player.id,
          visibility,
        });
      },
    );

    test("refuses a non-member", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const { user: other } = await createTestUser();
      const character = await createTestCharacter(other.id);
      await expect(link(other.id, campaign.id, character.id)).rejects.toThrow(NotFoundError);
    });

    test("links a character to one campaign, once", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const { campaign: other } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);
      await link(user.id, campaign.id, character.id);

      await expect(link(user.id, campaign.id, character.id)).rejects.toThrow(
        "Character already linked to this campaign",
      );
      await expect(link(user.id, other.id, character.id)).rejects.toThrow("Character is already linked to a campaign");
    });

    test("refuses a bonded character", async () => {
      const ctx = await getSeedCtx();
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const master = await createTestCharacter(user.id);
      const familiar = await createTestCharacter(user.id, {
        name: "Cat Familiar",
        raceId: ctx.raceMap.familiar["Cat"],
        kind: "familiar",
        parentCharacterId: master.id,
      });
      await expect(link(user.id, campaign.id, familiar.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("getCharacters", () => {
    test("summarizes each character's classes at their highest level", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      expect((await list(user.id, campaign.id)).items).toEqual([]);

      const newcomer = await createTestCharacter(user.id);
      const fighter = await createTestCharacter(user.id);
      const multiclass = await createTestCharacter(user.id);
      await addLevels(fighter.id, [
        ["Fighter", 1],
        ["Fighter", 2],
        ["Fighter", 3],
      ]);
      await addLevels(multiclass.id, [
        ["Fighter", 1],
        ["Fighter", 2],
        ["Ranger", 1],
      ]);
      for (const { id } of [newcomer, fighter, multiclass]) await link(user.id, campaign.id, id);

      const byId = new Map((await list(user.id, campaign.id)).items.map((c) => [c.id, c]));
      expect(byId.get(newcomer.id)).toMatchObject({
        name: newcomer.name,
        description: newcomer.description,
        race: "Human",
        levels: [],
        totalLevel: 0,
      });
      expect(byId.get(fighter.id)).toMatchObject({ levels: [{ klass: "Fighter", level: 3 }], totalLevel: 3 });
      expect(byId.get(multiclass.id)?.totalLevel).toBe(3);
      expect(
        byId
          .get(multiclass.id)
          ?.levels.map((l) => [l.klass, l.level])
          .sort(),
      ).toEqual([
        ["Fighter", 2],
        ["Ranger", 1],
      ]);
    });

    test("leaves out unlinked and archived characters", async () => {
      const { user } = await createTestUser();
      const { campaign, player } = await createTestCampaign(user.id);
      const [kept, unlinked, archived] = [
        await createTestCharacter(user.id),
        await createTestCharacter(user.id),
        await createTestCharacter(user.id),
      ];
      for (const { id } of [kept, unlinked, archived]) await link(user.id, campaign.id, id);
      await db
        .update(playerCharactersInCampaign)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(playerCharactersInCampaign.playerId, player.id),
            eq(playerCharactersInCampaign.characterId, unlinked.id),
          ),
        );
      await Characters.archive(db, { id: archived.id });

      expect((await list(user.id, campaign.id)).items.map((c) => c.id)).toEqual([kept.id]);
    });

    test("shows each player what the visibility allows, and the Game Master everything", async () => {
      const { user: gm } = await createTestUser("gm");
      const { campaign } = await createTestCampaign(gm.id);
      const viewer = await joinWithCharacter(campaign.id, "Private");
      const publicOne = await joinWithCharacter(campaign.id, "Public");
      const partialOne = await joinWithCharacter(campaign.id, "Partial");
      const privateOne = await joinWithCharacter(campaign.id, "Private");

      const seen = new Map((await list(viewer.user.id, campaign.id)).items.map((c) => [c.id, c]));
      expect([...seen.keys()].sort()).toEqual(
        [viewer.character.id, publicOne.character.id, partialOne.character.id].sort(),
      );
      // Their own Private character, and others' Public ones, in full.
      expect(seen.get(viewer.character.id)).toMatchObject({
        visibility: "Private",
        description: viewer.character.description,
      });
      expect(seen.get(publicOne.character.id)).toMatchObject({
        visibility: "Public",
        description: publicOne.character.description,
      });
      // Others' Partial ones: name and race only.
      expect(seen.get(partialOne.character.id)).toMatchObject({
        visibility: "Partial",
        name: partialOne.character.name,
        race: "Human",
        description: null,
        levels: [],
        totalLevel: null,
      });
      expect(seen.has(privateOne.character.id)).toBe(false);

      // Their own Partial character in full.
      expect(
        (await list(partialOne.user.id, campaign.id)).items.find((c) => c.id === partialOne.character.id),
      ).toMatchObject({ visibility: "Partial", description: partialOne.character.description });

      expect((await list(gm.id, campaign.id)).items).toHaveLength(4);
    });

    test("shows a Partial character whole to its contributors, as its sheet does, in one query for the page", async () => {
      const { user: gm } = await createTestUser("gm");
      const { campaign } = await createTestCampaign(gm.id);
      const viewer = await joinWithCharacter(campaign.id, "Private");
      const edited = await joinWithCharacter(campaign.id, "Partial");
      const hidden = await joinWithCharacter(campaign.id, "Partial");
      await joinWithCharacter(campaign.id, "Partial");
      for (const { character } of [edited, hidden])
        await Characters.update(db, { description: "A scar runs down her left cheek" }, { id: character.id });
      await addCharacterContributor(edited.character.id, viewer.user, edited.user.id);

      const seen = new Map((await list(viewer.user.id, campaign.id)).items.map((c) => [c.id, c]));
      expect(seen.get(edited.character.id)).toMatchObject({
        description: "A scar runs down her left cheek",
        totalLevel: 0,
        isPartial: false,
      });
      expect(seen.get(hidden.character.id)).toMatchObject({ description: null, totalLevel: null, isPartial: true });

      // The contributions are read once for the page, whatever its size.
      const { timing: two } = await measure(() => list(viewer.user.id, campaign.id, { limit: 2, page: 1 }));
      const { timing: four } = await measure(() => list(viewer.user.id, campaign.id, { limit: 10, page: 1 }));
      expect(two.queryCount).toBeGreaterThan(0);
      expect(four.queryCount).toBe(two.queryCount);
    });

    test("pages the characters", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      for (let i = 0; i < 5; i++) await link(user.id, campaign.id, (await createTestCharacter(user.id)).id);

      const pages = [];
      for (const page of [1, 2, 3]) pages.push(await list(user.id, campaign.id, { limit: 2, page }));
      expect(pages.map((p) => [p.items.length, p.nextPage])).toEqual([
        [2, 2],
        [2, 3],
        [1, undefined],
      ]);
    });

    test("refuses a non-member, and an unknown campaign is a 404", async () => {
      const { rulesetId } = await getSeedCtx();
      const { user } = await createTestUser();
      const [campaign] = await Campaigns.create(db, { name: "Empty Campaign", rulesetId });
      await expect(list(user.id, campaign.id)).rejects.toThrow(ForbiddenError);
      await expect(list(user.id, NIL_UUID)).rejects.toThrow("Campaign not found");
    });
  });

  describe("getCharacter", () => {
    test("gives the owner the full sheet whatever the visibility, and lets them edit", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      for (const visibility of ["Private", "Public", "Partial"] as const) {
        const character = await createTestCharacter(user.id);
        await link(user.id, campaign.id, character.id, visibility);
        const result = await CampaignCharactersService.getCharacter(makeSession(user.id), campaign.id, character.id);
        expect(result).toMatchObject({ visibility, canEdit: true, isPartial: false });
        expect(result.detailedCharacter).toBeDefined();
      }
    });

    test("gives other members the full sheet of a Public character, identity only for a Partial one, nothing for a Private one", async () => {
      const { user: gm } = await createTestUser("gm");
      const { campaign } = await createTestCampaign(gm.id);
      const viewer = await joinWithCharacter(campaign.id, "Private");
      const get = (characterId: string) =>
        CampaignCharactersService.getCharacter(makeSession(viewer.user.id), campaign.id, characterId);

      const publicOne = await joinWithCharacter(campaign.id, "Public");
      expect(await get(publicOne.character.id)).toMatchObject({ visibility: "Public", canEdit: false });

      const { character } = await joinWithCharacter(campaign.id, "Partial");
      const partial = await get(character.id);
      expect(partial).toMatchObject({ visibility: "Partial", isOwner: false, canEdit: false, isPartial: true });
      expect(partial.character).toMatchObject({
        name: character.name,
        gender: character.gender,
        age: character.age,
        height: character.height,
        weight: character.weight,
      });

      const privateOne = await joinWithCharacter(campaign.id, "Private");
      await expect(get(privateOne.character.id)).rejects.toThrow(NotFoundError);
    });

    test("gives an active character contributor the full, editable sheet", async () => {
      const { user: gm } = await createTestUser("gm");
      const { campaign } = await createTestCampaign(gm.id);
      const { user: owner, character } = await joinWithCharacter(campaign.id, "Partial");
      const contributor = await joinWithCharacter(campaign.id, "Private");
      await addCharacterContributor(character.id, contributor.user, owner.id);

      const result = await CampaignCharactersService.getCharacter(
        makeSession(contributor.user.id),
        campaign.id,
        character.id,
      );
      expect(result).toMatchObject({ canEdit: true, isOwner: false, isPartial: false });
    });

    test("refuses a non-member, and throws NotFoundError for a character outside the campaign", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const linked = await createTestCharacter(user.id);
      await link(user.id, campaign.id, linked.id);
      const { user: stranger } = await createTestUser();

      await expect(
        CampaignCharactersService.getCharacter(makeSession(stranger.id), campaign.id, linked.id),
      ).rejects.toThrow(ForbiddenError);
      const unlinked = await createTestCharacter(user.id);
      await expect(
        CampaignCharactersService.getCharacter(makeSession(user.id), campaign.id, unlinked.id),
      ).rejects.toThrow(NotFoundError);
      await expect(CampaignCharactersService.getCharacter(makeSession(user.id), NIL_UUID, linked.id)).rejects.toThrow(
        "Campaign not found",
      );
    });
  });
});
