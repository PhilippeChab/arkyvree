import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { klassLevelsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import {
  Campaigns,
  CharacterContributors,
  CharacterLevels,
  Characters,
  PlayerCharacters,
  Players,
  Users,
} from "@/server/repositories/index.ts";
import { PlayerCharactersMethods } from "@/server/services/campaigns/CharactersService.ts";
import type { Session } from "@/shared/relations.ts";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "bun:test";

describe("PlayerCharactersService", () => {
  let seedCtx: SeedContext;
  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

  // Helper to create test session
  function createTestSession(userId: string): Session {
    return {
      id: `session-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Helper to create test user
  async function createTestUser() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    return { user, session: createTestSession(user.id) };
  }

  // Helper to create test campaign
  async function createTestCampaign(userId: string) {
    const ctx = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const campaigns = await Campaigns.create(db, {
      name: `Test Campaign ${uniqueId}`,
      description: "Test campaign for character testing",
      rulesetId: ctx.rulesetId,
    });
    const campaign = campaigns[0];

    // Add user as a player (Game Master)
    const players = await Players.create(db, {
      userId,
      campaignId: campaign.id,
      role: "Game Master",
    });

    return { campaign, player: players[0] };
  }

  // Helper to create test character
  async function createTestCharacter(userId: string) {
    const ctx = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const characters = await Characters.create(db, {
      userId,
      name: `Test Character ${uniqueId}`,
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
      gender: "Male",
      age: 25,
      height: "180",
      weight: "75",
      alignment: "Neutral Good",
      deity: "None",
      xp: 0,
    });

    return characters[0];
  }

  describe("linkCharacter", () => {
    test("should link a character to a campaign", async () => {
      const { user } = await createTestUser();
      const { campaign, player } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      const result = await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");

      expect(result).toBeDefined();
      expect(result.characterId).toBe(character.id);
      expect(result.playerId).toBe(player.id);
      expect(result.visibility).toBe("Public");
    });

    test("should link a character with Private visibility", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      const result = await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Private");

      expect(result).toBeDefined();
      expect(result.visibility).toBe("Private");
    });

    test("should link a character with Partial visibility", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      const result = await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Partial");

      expect(result).toBeDefined();
      expect(result.visibility).toBe("Partial");
    });

    test("should throw NotFoundError when player not found in campaign", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      // Create a different user who is not in the campaign
      const { user: otherUser } = await createTestUser();

      await expect(
        PlayerCharactersMethods.linkCharacter(createTestSession(otherUser.id), campaign.id, character.id, "Public")
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw error when character is already linked to another campaign", async () => {
      const { user } = await createTestUser();
      const { campaign: campaign1 } = await createTestCampaign(user.id);
      const { campaign: campaign2 } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      // Link character to first campaign
      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign1.id, character.id, "Public");

      // Try to link to second campaign
      await expect(
        PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign2.id, character.id, "Public")
      ).rejects.toThrow("Character is already linked to a campaign");
    });

    test("should throw error when character already linked to campaign", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      // Link character first time
      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");

      // Try to link again
      await expect(
        PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public")
      ).rejects.toThrow("Character already linked to this campaign");
    });

    test("rejects a bonded character (404 via repo kind filter)", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const master = await createTestCharacter(user.id);
      const ctx = await getCtx();

      const bonded = (await Characters.create(db, {
        userId: user.id,
        name: "Test Cat Familiar",
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.familiar["Cat"],
        kind: "familiar",
        parentCharacterId: master.id,
        gender: "Other",
        alignment: "True Neutral",
        xp: 0,
      }))[0];

      await expect(
        PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, bonded.id, "Public"),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getCampaignCharacters", () => {
    test("should throw ForbiddenError for non-member", async () => {
      const { user } = await createTestUser();
      const ctx = await getCtx();
      const campaigns = await Campaigns.create(db, {
        name: "Empty Campaign",
        description: "No players",
        rulesetId: ctx.rulesetId,
      });
      const campaign = campaigns[0];

      await expect(
        PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should return empty array when no characters linked", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(result.items.length).toBe(0);
    });

    test("should return character with basic info when linked", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(1);
      expect(characters[0].id).toBe(character.id);
      expect(characters[0].name).toBe(character.name);
      expect(characters[0].description).toBe(character.description);
      expect(characters[0].race).toBe("Human");
      expect(characters[0].levels).toBeDefined();
      expect(Array.isArray(characters[0].levels)).toBe(true);
      expect(characters[0].totalLevel).toBe(0);
    });

    test("should return character with single class level", async () => {
      const { user } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      // Query seed Fighter level 1
      const [klassLevel] = await db.select({ id: klassLevelsInRules.id }).from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 1)));

      // Add level to character
      await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevel.id,
        hp: 8,
      });

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(1);
      expect(characters[0].levels.length).toBe(1);
      expect(characters[0].levels[0].klass).toBe("Fighter");
      expect(characters[0].levels[0].level).toBe(1);
      expect(characters[0].totalLevel).toBe(1);
    });

    test("should return character with multiple levels in same class", async () => {
      const { user } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      // Query seed Fighter levels 1-3
      const fighterLevels = await db.select({ id: klassLevelsInRules.id }).from(klassLevelsInRules)
        .where(and(
          eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]),
          inArray(klassLevelsInRules.level, [1, 2, 3]),
        ));

      // Add multiple levels to character
      for (const kl of fighterLevels) {
        await CharacterLevels.create(db, {
          characterId: character.id,
          klassLevelId: kl.id,
          hp: 8,
        });
      }

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(1);
      expect(characters[0].levels.length).toBe(1);
      expect(characters[0].levels[0].klass).toBe("Fighter");
      expect(characters[0].levels[0].level).toBe(3); // Should be highest level
      expect(characters[0].totalLevel).toBe(3);
    });

    test("should return character with multiclass levels", async () => {
      const { user } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      // Query seed Fighter levels 1-2 and Ranger level 1
      const [fighterLv1] = await db.select({ id: klassLevelsInRules.id }).from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 1)));
      const [fighterLv2] = await db.select({ id: klassLevelsInRules.id }).from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 2)));
      const [rangerLv1] = await db.select({ id: klassLevelsInRules.id }).from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Ranger"]), eq(klassLevelsInRules.level, 1)));

      // Add multiclass levels
      await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: fighterLv1.id,
        hp: 8,
      });
      await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: fighterLv2.id,
        hp: 8,
      });
      await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: rangerLv1.id,
        hp: 8,
      });

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(1);
      expect(characters[0].levels.length).toBe(2);
      expect(characters[0].totalLevel).toBe(3);

      // Check both classes are present
      const classNames = characters[0].levels.map((l) => l.klass).sort();
      expect(classNames).toContain("Fighter");
      expect(classNames).toContain("Ranger");

      // Check levels for each class
      const class1Level = characters[0].levels.find((l) => l.klass === "Fighter");
      const class2Level = characters[0].levels.find((l) => l.klass === "Ranger");
      expect(class1Level?.level).toBe(2);
      expect(class2Level?.level).toBe(1);
    });

    test("should return multiple characters in campaign", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character1 = await createTestCharacter(user.id);
      const character2 = await createTestCharacter(user.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character1.id, "Public");
      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character2.id, "Private");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(2);
      const charIds = characters.map((c) => c.id).sort();
      expect(charIds).toContain(character1.id);
      expect(charIds).toContain(character2.id);
    });

    test("should return characters from multiple players in campaign", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const { campaign } = await createTestCampaign(user1.id);

      // Add second player to campaign
      await Players.create(db, {
        userId: user2.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character1 = await createTestCharacter(user1.id);
      const character2 = await createTestCharacter(user2.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user1.id), campaign.id, character1.id, "Public");
      await PlayerCharactersMethods.linkCharacter(createTestSession(user2.id), campaign.id, character2.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user1.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(2);
      const charIds = characters.map((c) => c.id).sort();
      expect(charIds).toContain(character1.id);
      expect(charIds).toContain(character2.id);
    });

    test("should not return archived characters", async () => {
      const { user } = await createTestUser();
      const { campaign, player } = await createTestCampaign(user.id);
      const character1 = await createTestCharacter(user.id);
      const character2 = await createTestCharacter(user.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character1.id, "Public");
      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character2.id, "Public");

      // Archive one player character link
      await PlayerCharacters.archive(db, {
        playerId: player.id,
        characterId: character1.id,
      });

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(1);
      expect(characters[0].id).toBe(character2.id);
    });

    test("should not return deleted characters", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character1 = await createTestCharacter(user.id);
      const character2 = await createTestCharacter(user.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character1.id, "Public");
      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character2.id, "Public");

      // Archive (soft delete) one character
      await Characters.archive(db, { id: character1.id });

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(1);
      expect(characters[0].id).toBe(character2.id);
    });

    test("should hide other players' Private characters from non-GM players", async () => {
      const { user: gm } = await createTestUser();
      const { user: player1 } = await createTestUser();
      const { user: player2 } = await createTestUser();
      const { campaign } = await createTestCampaign(gm.id);

      // Add two players to campaign
      await Players.create(db, {
        userId: player1.id,
        campaignId: campaign.id,
        role: "Player Character",
      });
      await Players.create(db, {
        userId: player2.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character1 = await createTestCharacter(player1.id);
      const character2 = await createTestCharacter(player2.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(player1.id), campaign.id, character1.id, "Public");
      await PlayerCharactersMethods.linkCharacter(createTestSession(player2.id), campaign.id, character2.id, "Private");

      // player1 should only see their own character (player2's is Private)
      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(player1.id), campaign.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(character1.id);

      // GM should see all characters regardless of visibility
      const gmResult = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(gm.id), campaign.id, {}, { limit: 10, page: 1 });

      expect(gmResult.items.length).toBe(2);
    });

    test("should show own Private characters", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Private");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(character.id);
    });

    test("should show other players' Public characters with full data", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const { campaign } = await createTestCampaign(user1.id);

      await Players.create(db, {
        userId: user2.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character = await createTestCharacter(user2.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user2.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user1.id), campaign.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(character.id);
      expect(result.items[0].description).toBe(character.description);
      expect(result.items[0].visibility).toBe("Public");
    });

    test("should show other players' Partial characters with limited data", async () => {
      const { user: user1 } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const { campaign } = await createTestCampaign(user1.id);

      await Players.create(db, {
        userId: user2.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character = await createTestCharacter(user2.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user2.id), campaign.id, character.id, "Partial");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user1.id), campaign.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(character.id);
      expect(result.items[0].name).toBe(character.name);
      expect(result.items[0].description).toBeNull();
      expect(result.items[0].levels).toEqual([]);
      expect(result.items[0].visibility).toBe("Partial");
    });

    test("should handle characters with no levels", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      const characters = result.items;
      expect(characters.length).toBe(1);
      expect(characters[0].id).toBe(character.id);
      expect(characters[0].levels).toBeDefined();
      expect(Array.isArray(characters[0].levels)).toBe(true);
      expect(characters[0].levels.length).toBe(0);
      expect(characters[0].totalLevel).toBe(0);
    });

    test("should show own Partial characters with full data", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Partial");

      const result = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(character.id);
      expect(result.items[0].description).toBe(character.description);
      expect(result.items[0].visibility).toBe("Partial");
    });

    test("should paginate results correctly", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      // Create 5 characters
      for (let i = 0; i < 5; i++) {
        const character = await createTestCharacter(user.id);
        await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, "Public");
      }

      // First page
      const page1 = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 2, page: 1 });

      expect(page1.items.length).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.nextPage).toBe(2);

      // Second page
      const page2 = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 2, page: 2 });

      expect(page2.items.length).toBe(2);
      expect(page2.page).toBe(2);
      expect(page2.nextPage).toBe(3);

      // Third page (last page)
      const page3 = await PlayerCharactersMethods.getCampaignCharacters(createTestSession(user.id), campaign.id, {}, { limit: 2, page: 3 });

      expect(page3.items.length).toBe(1);
      expect(page3.page).toBe(3);
      expect(page3.nextPage).toBeUndefined();
    });
  });

  describe("getCampaignCharacter", () => {
    test("should throw ForbiddenError for non-member", async () => {
      const { user: owner } = await createTestUser();
      const { user: nonMember } = await createTestUser();
      const { campaign } = await createTestCampaign(owner.id);
      const character = await createTestCharacter(owner.id);

      await PlayerCharactersMethods.linkCharacter(createTestSession(owner.id), campaign.id, character.id, "Public");

      await expect(
        PlayerCharactersMethods.getCampaignCharacter(createTestSession(nonMember.id), campaign.id, character.id),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw NotFoundError for character not in campaign", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const character = await createTestCharacter(user.id);

      // Character exists but is not linked to the campaign
      await expect(
        PlayerCharactersMethods.getCampaignCharacter(createTestSession(user.id), campaign.id, character.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("should return full data for owner regardless of visibility", async () => {
      const { user } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      for (const visibility of ["Private", "Public", "Partial"] as const) {
        const character = await createTestCharacter(user.id);
        await PlayerCharactersMethods.linkCharacter(createTestSession(user.id), campaign.id, character.id, visibility);

        const result = await PlayerCharactersMethods.getCampaignCharacter(createTestSession(user.id), campaign.id, character.id);

        expect(result.visibility).toBe(visibility);
        expect("character" in result).toBe(true);
        expect("detailedCharacter" in result).toBe(true);
      }
    });

    test("should return full data for Public character viewed by another member", async () => {
      const { user: owner } = await createTestUser();
      const { user: viewer } = await createTestUser();
      const { campaign } = await createTestCampaign(owner.id);

      await Players.create(db, {
        userId: viewer.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character = await createTestCharacter(owner.id);
      await PlayerCharactersMethods.linkCharacter(createTestSession(owner.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacter(createTestSession(viewer.id), campaign.id, character.id);

      expect(result.visibility).toBe("Public");
      expect("character" in result).toBe(true);
      expect("detailedCharacter" in result).toBe(true);
    });

    test("should return partial data for Partial character viewed by another member", async () => {
      const { user: owner } = await createTestUser();
      const { user: viewer } = await createTestUser();
      const { campaign } = await createTestCampaign(owner.id);

      await Players.create(db, {
        userId: viewer.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character = await createTestCharacter(owner.id);
      await PlayerCharactersMethods.linkCharacter(createTestSession(owner.id), campaign.id, character.id, "Partial");

      const result = await PlayerCharactersMethods.getCampaignCharacter(createTestSession(viewer.id), campaign.id, character.id);

      expect(result.visibility).toBe("Partial");
      expect(result.isOwner).toBe(false);
      expect(result.character).toBeDefined();
      expect(result.detailedCharacter).toBeDefined();
      expect(result.character.name).toBe(character.name);
      expect(result.character.gender).toBe(character.gender);
      expect(result.character.age).toBe(character.age);
      expect(result.character.height).toBe(character.height);
      expect(result.character.weight).toBe(character.weight);
    });

    test("should throw NotFoundError for Private character viewed by another member", async () => {
      const { user: owner } = await createTestUser();
      const { user: viewer } = await createTestUser();
      const { campaign } = await createTestCampaign(owner.id);

      await Players.create(db, {
        userId: viewer.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character = await createTestCharacter(owner.id);
      await PlayerCharactersMethods.linkCharacter(createTestSession(owner.id), campaign.id, character.id, "Private");

      await expect(
        PlayerCharactersMethods.getCampaignCharacter(createTestSession(viewer.id), campaign.id, character.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("canEdit is true for the character owner regardless of campaign-link ownership", async () => {
      const { user: owner } = await createTestUser();
      const { campaign } = await createTestCampaign(owner.id);
      const character = await createTestCharacter(owner.id);
      await PlayerCharactersMethods.linkCharacter(createTestSession(owner.id), campaign.id, character.id, "Public");

      const result = await PlayerCharactersMethods.getCampaignCharacter(createTestSession(owner.id), campaign.id, character.id);

      expect(result.canEdit).toBe(true);
      expect(result.isPartial).toBe(false);
    });

    test("canEdit is true for an active character contributor and full sheet is returned", async () => {
      const { user: owner } = await createTestUser();
      const { user: contributor } = await createTestUser();
      const { campaign } = await createTestCampaign(owner.id);

      await Players.create(db, {
        userId: contributor.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character = await createTestCharacter(owner.id);
      await PlayerCharactersMethods.linkCharacter(createTestSession(owner.id), campaign.id, character.id, "Partial");
      const [createdContributor] = await CharacterContributors.create(db, {
        characterId: character.id,
        userId: contributor.id,
        email: contributor.emailAddress,
        role: "Editor",
        invitedBy: owner.id,
      });
      await CharacterContributors.update(db, { status: "Active" }, { id: createdContributor.id });

      const result = await PlayerCharactersMethods.getCampaignCharacter(createTestSession(contributor.id), campaign.id, character.id);

      // Contributor sees the full sheet — they're not an incidental viewer.
      expect(result.canEdit).toBe(true);
      expect(result.isOwner).toBe(false);
      expect(result.isPartial).toBe(false);
    });

    test("canEdit is false for a campaign-only viewer; partial mask still applies", async () => {
      const { user: owner } = await createTestUser();
      const { user: viewer } = await createTestUser();
      const { campaign } = await createTestCampaign(owner.id);

      await Players.create(db, {
        userId: viewer.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const character = await createTestCharacter(owner.id);
      await PlayerCharactersMethods.linkCharacter(createTestSession(owner.id), campaign.id, character.id, "Partial");

      const result = await PlayerCharactersMethods.getCampaignCharacter(createTestSession(viewer.id), campaign.id, character.id);

      expect(result.canEdit).toBe(false);
      expect(result.isPartial).toBe(true);
    });
  });
});
