import { getSeedContext, SEED_USER_ID, type SeedContext } from "@/database/seeds/helpers.ts";
import { charactersInCharacter, klassLevelsInRules, modifiersInCustomization } from "@/drizzle/schema.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { db } from "@/server/database/index.ts";
import {
  Rulesets,
  Users,
  Races,
  Requirements,
  Campaigns,
  Contributors,
  Players,
  CharacterLevels,
  CharacterLevelSkills,
  CharacterLevelFeats,
  CharacterInventory,
  CharacterLanguages,
  CharacterAbilities,
  Characters,
  PlayerCharacters,
} from "@/server/repositories/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { cowEntity } from "@/server/services/rulesets/cow.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import type { Session } from "@/shared/relations.ts";
import { and, eq, sql } from "drizzle-orm";
import { describe, test, expect } from "bun:test";

describe("CharactersService", () => {
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
  async function createTestCampaign(session: Session) {
    const ctx = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const campaigns = await Campaigns.create(db, {
      name: `Test Campaign ${uniqueId}`,
      description: "Test campaign for characters testing",
      rulesetId: ctx.rulesetId,
    });
    const campaign = campaigns[0];

    // Create player for the campaign
    const players = await Players.create(db, {
      userId: session.userId,
      campaignId: campaign.id,
      role: "Game Master",
    });
    const player = players[0];

    return { campaign, player };
  }

  // Helper to create test character
  async function createTestCharacter(session: Session, overrides?: { name?: string }) {
    const ctx = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);

    return await CharactersMethods.createCharacter(session, {
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
      name: overrides?.name ?? `Test Character ${uniqueId}`,
      xp: 1000,
      alignment: "Lawful Good",
      abilities: {},
      age: 25,
      gender: "Male",
      height: "6'0\"",
      weight: "180 lbs",
      deity: "Test Deity",
      description: "A test character",
      notes: "Test notes",
    });
  }

  describe("createCharacter", () => {
    test("creates and restores characters beyond the former six-character limit", async () => {
      const { session } = await createTestUser();
      const first = await createTestCharacter(session);
      for (let i = 0; i < 6; i++) {
        await createTestCharacter(session);
      }
      await CharactersMethods.archiveCharacter(session, first.id);
      await CharactersMethods.unarchiveCharacter(session, first.id);
      expect(await Characters.findOne(db, { id: first.id })).toBeDefined();
    });

    test("should create a character with all required fields", async () => {
      const { user, session } = await createTestUser();
      const ctx = await getCtx();

      const character = await CharactersMethods.createCharacter(session, {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name: "Test Hero",
        xp: 500,
        alignment: "Neutral Good",
        abilities: {},
        age: 30,
        gender: "Female",
        height: "5'8\"",
        weight: "150 lbs",
      });

      expect(character).toBeDefined();
      expect(character.id).toBeDefined();
      expect(character.name).toBe("Test Hero");
      expect(character.userId).toBe(user.id);
      expect(character.rulesetId).toBe(ctx.rulesetId);
      expect(character.raceId).toBe(ctx.raceMap.pc["Human"]);
      expect(character.xp).toBe(500);
      expect(character.alignment).toBe("Neutral Good");
      expect(character.age).toBe(30);
      expect(character.gender).toBe("Female");
      expect(character.height).toBe("5'8\"");
      expect(character.weight).toBe("150 lbs");
    });

    test("should create a character with optional fields", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const character = await CharactersMethods.createCharacter(session, {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name: "Test Paladin",
        xp: 2000,
        alignment: "Lawful Good",
        abilities: {},
        age: 28,
        gender: "Male",
        height: "6'2\"",
        weight: "200 lbs",
        deity: "Bahamut",
        description: "A noble paladin",
        notes: "Sworn to protect the innocent",
      });

      expect(character).toBeDefined();
      expect(character.deity).toBe("Bahamut");
      expect(character.description).toBe("A noble paladin");
      expect(character.notes).toBe("Sworn to protect the innocent");
    });

    test("should create a character with minimal data", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const character = await CharactersMethods.createCharacter(session, {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name: "Minimal Character",
        xp: 0,
        alignment: "True Neutral",
        abilities: {},
        age: 20,
        gender: "Other",
        height: "5'10\"",
        weight: "170 lbs",
      });

      expect(character).toBeDefined();
      expect(character.name).toBe("Minimal Character");
      expect(character.deity).toBeNull();
      expect(character.description).toBeNull();
      expect(character.notes).toBeNull();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUser();

      expect(
        CharactersMethods.createCharacter(session, {
          rulesetId: "00000000-0000-0000-0000-000000000000",
          raceId: "00000000-0000-0000-0000-000000000001",
          name: "Ghost Character",
          xp: 0,
          alignment: "True Neutral",
          abilities: {},
          age: 20,
          gender: "Male",
          height: "5'10\"",
          weight: "170 lbs",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("should allow creating character on private ruleset via campaign access", async () => {
      const { user: owner } = await createTestUser();
      const { user: player, session: playerSession } = await createTestUser();

      const uniqueId = Math.random().toString(36).substr(2, 9);
      const rulesets = await Rulesets.create(db, {
        name: `Test Ruleset ${uniqueId}`,
        description: "Test ruleset for characters testing",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: owner.id,
      });
      const ruleset = rulesets[0];

      const races = await Races.create(db, {
        rulesetId: ruleset.id,
        name: `Test Race ${uniqueId}`,
        description: "Test race for characters testing",
        size: "Medium",
        baseSpeed: 30,
      });
      const race = races[0];

      // Create a campaign using this ruleset and add the player
      const campaigns = await Campaigns.create(db, {
        name: "Test Campaign",
        description: "Campaign for access testing",
        rulesetId: ruleset.id,
      });
      await Players.create(db, {
        userId: player.id,
        campaignId: campaigns[0].id,
        role: "Player Character",
      });

      // Player should be able to create a character on this private ruleset
      const character = await CharactersMethods.createCharacter(playerSession, {
        rulesetId: ruleset.id,
        raceId: race.id,
        name: "Campaign Character",
        xp: 0,
        alignment: "True Neutral",
        abilities: {},
        age: 25,
        gender: "Male",
        height: "6'0\"",
        weight: "180 lbs",
      });

      expect(character).toBeDefined();
      expect(character.rulesetId).toBe(ruleset.id);
      expect(character.userId).toBe(player.id);
    });

    test("active contributor can create a character on a private draft they don't own", async () => {
      const { user: owner } = await createTestUser();
      const { user: contributor, session: contributorSession } = await createTestUser();

      const uniqueId = Math.random().toString(36).substr(2, 9);
      const [ruleset] = await Rulesets.create(db, {
        name: `Contributor Draft ${uniqueId}`,
        description: "Draft ruleset shared with a contributor",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: owner.id,
        status: "Draft",
      });
      const [race] = await Races.create(db, {
        rulesetId: ruleset.id,
        name: `Contributor Race ${uniqueId}`,
        description: "Race for contributor test",
        size: "Medium",
        baseSpeed: 30,
      });
      const [createdContributor] = await Contributors.create(db, {
        rulesetId: ruleset.id,
        userId: contributor.id,
        email: contributor.emailAddress,
        role: "Editor",
        invitedBy: owner.id,
      });
      await Contributors.update(db, { status: "Active" }, { id: createdContributor.id });

      const character = await CharactersMethods.createCharacter(contributorSession, {
        rulesetId: ruleset.id,
        raceId: race.id,
        name: "Contributor Character",
        xp: 0,
        alignment: "True Neutral",
        abilities: {},
        age: 30,
        gender: "Other",
        height: "5'10\"",
        weight: "170 lbs",
      });

      expect(character).toBeDefined();
      expect(character.rulesetId).toBe(ruleset.id);
      expect(character.userId).toBe(contributor.id);
    });

    test("should throw ForbiddenError on private ruleset without campaign access", async () => {
      const { user: owner } = await createTestUser();
      const { session: strangerSession } = await createTestUser();

      const uniqueId = Math.random().toString(36).substr(2, 9);
      const rulesets = await Rulesets.create(db, {
        name: `Test Ruleset ${uniqueId}`,
        description: "Test ruleset for characters testing",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: owner.id,
      });
      const ruleset = rulesets[0];

      const races = await Races.create(db, {
        rulesetId: ruleset.id,
        name: `Test Race ${uniqueId}`,
        description: "Test race for characters testing",
        size: "Medium",
        baseSpeed: 30,
      });
      const race = races[0];

      await expect(
        CharactersMethods.createCharacter(strangerSession, {
          rulesetId: ruleset.id,
          raceId: race.id,
          name: "Forbidden Character",
          xp: 0,
          alignment: "True Neutral",
          abilities: {},
          age: 25,
          gender: "Male",
          height: "6'0\"",
          weight: "180 lbs",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create character abilities from ruleset abilities", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const abilityScores: Record<string, number> = {};
      abilityScores[ctx.abilityMap["Strength"]] = 18;
      abilityScores[ctx.abilityMap["Dexterity"]] = 14;
      abilityScores[ctx.abilityMap["Constitution"]] = 16;

      const character = await CharactersMethods.createCharacter(session, {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name: "Abilities Character",
        xp: 0,
        alignment: "True Neutral",
        abilities: abilityScores,
        age: 25,
        gender: "Male",
        height: "6'0\"",
        weight: "180 lbs",
      });

      // Verify character abilities were created
      const charAbilities = await CharacterAbilities.findMany(db, { characterId: character.id });
      expect(charAbilities.length).toBe(6);

      const strengthAbility = charAbilities.find((ca) => ca.abilityId === ctx.abilityMap["Strength"]);
      const dexAbility = charAbilities.find((ca) => ca.abilityId === ctx.abilityMap["Dexterity"]);
      const conAbility = charAbilities.find((ca) => ca.abilityId === ctx.abilityMap["Constitution"]);

      expect(strengthAbility?.score).toBe(18);
      expect(dexAbility?.score).toBe(14);
      expect(conAbility?.score).toBe(16);
    });

    test("should default ability score to 10 when not provided", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const character = await CharactersMethods.createCharacter(session, {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name: "Default Score Character",
        xp: 0,
        alignment: "True Neutral",
        abilities: {},
        age: 25,
        gender: "Male",
        height: "6'0\"",
        weight: "180 lbs",
      });

      const charAbilities = await CharacterAbilities.findMany(db, { characterId: character.id });
      expect(charAbilities.length).toBe(6);
      for (const ca of charAbilities) {
        expect(ca.score).toBe(10);
      }
    });
  });

  describe("getCharacter", () => {
    test("should return character details", async () => {
      const { session } = await createTestUser();

      const created = await createTestCharacter(session);

      const result = await CharactersMethods.getCharacter(session, created.id);

      expect(result).toBeDefined();
      expect(result.character).toBeDefined();
      expect(result.character.id).toBe(created.id);
      expect(result.detailedCharacter).toBeDefined();
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharactersMethods.getCharacter(session, fakeCharacterId),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when accessing another user's character", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();

      const character = await createTestCharacter(session1);

      await expect(
        CharactersMethods.getCharacter(session2, character.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateCharacter", () => {
    test("should update character optional fields", async () => {
      const { session } = await createTestUser();

      const created = await createTestCharacter(session);

      const updated = await CharactersMethods.updateCharacter(
        session,
        created.id,
        {
          age: 35,
          deity: "New Deity",
          description: "Updated description",
          notes: "Updated notes",
        },
      );

      expect(updated.age).toBe(35);
      expect(updated.deity).toBe("New Deity");
      expect(updated.description).toBe("Updated description");
      expect(updated.notes).toBe("Updated notes");
      expect(updated.id).toBe(created.id);
    });

    test("should update character xp and alignment", async () => {
      const { session } = await createTestUser();

      const created = await createTestCharacter(session);

      const updated = await CharactersMethods.updateCharacter(
        session,
        created.id,
        {
          xp: 5000,
          alignment: "Chaotic Good",
        },
      );

      expect(updated.xp).toBe(5000);
      expect(updated.alignment).toBe("Chaotic Good");
    });

    test("should update only specified fields", async () => {
      const { session } = await createTestUser();

      const created = await createTestCharacter(session);
      const originalAge = created.age;

      const updated = await CharactersMethods.updateCharacter(
        session,
        created.id,
        {
          deity: "Only Deity Changed",
        },
      );

      expect(updated.deity).toBe("Only Deity Changed");
      expect(updated.age).toBe(originalAge);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharactersMethods.updateCharacter(session, fakeCharacterId, {
          age: 30,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when updating another user's character", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();

      const character = await createTestCharacter(session1);

      await expect(
        CharactersMethods.updateCharacter(session2, character.id, {
          age: 40,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ConflictError when updatedAt is stale", async () => {
      const { session } = await createTestUser();
      const created = await createTestCharacter(session);

      await CharactersMethods.updateCharacter(session, created.id, {
        age: 30,
        updatedAt: created.updatedAt,
      });

      await expect(
        CharactersMethods.updateCharacter(session, created.id, {
          age: 40,
          updatedAt: created.updatedAt,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("getMyCharacters", () => {
    test("should return empty array when user has no characters", async () => {
      const { session } = await createTestUser();

      const result = await CharactersMethods.getMyCharacters(session, {}, { limit: 10, page: 1 }) as { items: Array<unknown>; page: number; nextPage?: number };

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(0);
      expect(result.page).toBe(1);
    });

    test("should return user's characters", async () => {
      const { session } = await createTestUser();

      const character1 = await createTestCharacter(session);
      const character2 = await createTestCharacter(session);

      const result = await CharactersMethods.getMyCharacters(session, {}, { limit: 10, page: 1 }) as { items: Array<{ id: string }>; page: number; nextPage?: number };

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const foundChar1 = result.items.find((c: { id: string }) => c.id === character1.id);
      const foundChar2 = result.items.find((c: { id: string }) => c.id === character2.id);
      expect(foundChar1).toBeDefined();
      expect(foundChar2).toBeDefined();
    });

    test("should return character with race and levels", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const [klassLevel] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 1)));

      const character = await createTestCharacter(session);

      // Add a level to the character
      await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevel.id,
        hp: 10,
      });

      const result = await CharactersMethods.getMyCharacters(session, {}, { limit: 10, page: 1 }) as { items: Array<{ id: string; race?: string; levels?: Array<unknown> }>; page: number };

      const foundChar = result.items.find((c: { id: string }) => c.id === character.id);
      expect(foundChar).toBeDefined();
      expect(foundChar?.race).toBeDefined();
      expect(foundChar?.levels).toBeDefined();
      expect(Array.isArray(foundChar?.levels)).toBe(true);
    });

    test("should not return other users' characters", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();

      const character1 = await createTestCharacter(session1);

      const result = await CharactersMethods.getMyCharacters(session2, { visibility: Visibility.UnarchivedOnly }, { limit: 10, page: 1 }) as { items: Array<{ id: string }>; page: number };

      const foundChar = result.items.find((c: { id: string }) => c.id === character1.id);
      expect(foundChar).toBeUndefined();
    });

    test("should filter characters by search", async () => {
      const { session } = await createTestUser();

      const alpha = await createTestCharacter(session, { name: "Alpha Warrior" });
      const beta = await createTestCharacter(session, { name: "Beta Mage" });

      const result = await CharactersMethods.getMyCharacters(session, { search: "Alpha" }, { limit: 10, page: 1 }) as { items: Array<{ id: string }>; page: number };

      const foundAlpha = result.items.find((c) => c.id === alpha.id);
      const foundBeta = result.items.find((c) => c.id === beta.id);
      expect(foundAlpha).toBeDefined();
      expect(foundBeta).toBeUndefined();
    });

    test("should sort characters by name ascending", async () => {
      const { session } = await createTestUser();

      await createTestCharacter(session, { name: "Zephyr" });
      await createTestCharacter(session, { name: "Aiden" });

      const result = await CharactersMethods.getMyCharacters(session, { orderBy: "name", orderDir: "asc" }, { limit: 10, page: 1 }) as { items: Array<{ id: string; name: string }>; page: number };

      const names = result.items.map((c) => c.name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    test("should sort characters by name descending", async () => {
      const { session } = await createTestUser();

      await createTestCharacter(session, { name: "Aiden" });
      await createTestCharacter(session, { name: "Zephyr" });

      const result = await CharactersMethods.getMyCharacters(session, { orderBy: "name", orderDir: "desc" }, { limit: 10, page: 1 }) as { items: Array<{ id: string; name: string }>; page: number };

      const names = result.items.map((c) => c.name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i].localeCompare(names[i - 1])).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("getUnlinkedCharacters", () => {
    test("should return all user's characters when none are linked to campaign", async () => {
      const { session } = await createTestUser();
      const { campaign } = await createTestCampaign(session);

      const character1 = await createTestCharacter(session);
      const character2 = await createTestCharacter(session);

      const result = await CharactersMethods.getUnlinkedCharacters(
        session,
        campaign.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(result.page).toBe(1);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const foundChar1 = result.items.find(
        (c) => c.id === character1.id,
      );
      const foundChar2 = result.items.find(
        (c) => c.id === character2.id,
      );
      expect(foundChar1).toBeDefined();
      expect(foundChar2).toBeDefined();
    });

    test("should exclude characters linked to campaign", async () => {
      const { session } = await createTestUser();
      const { campaign, player } = await createTestCampaign(session);

      const linkedCharacter = await createTestCharacter(session);
      const unlinkedCharacter = await createTestCharacter(session);

      // Link one character to the campaign
      await PlayerCharacters.create(db, {
        playerId: player.id,
        characterId: linkedCharacter.id,
        visibility: "Public",
      });

      const result = await CharactersMethods.getUnlinkedCharacters(
        session,
        campaign.id,
        {},
        { limit: 10, page: 1 },
      );

      const foundLinked = result.items.find(
        (c) => c.id === linkedCharacter.id,
      );
      const foundUnlinked = result.items.find(
        (c) => c.id === unlinkedCharacter.id,
      );
      expect(foundLinked).toBeUndefined();
      expect(foundUnlinked).toBeDefined();
    });

    test("should return empty items array when all characters are linked", async () => {
      const { session } = await createTestUser();
      const { campaign, player } = await createTestCampaign(session);

      const character = await createTestCharacter(session);

      // Link the character to the campaign
      await PlayerCharacters.create(db, {
        playerId: player.id,
        characterId: character.id,
        visibility: "Public",
      });

      const result = await CharactersMethods.getUnlinkedCharacters(
        session,
        campaign.id,
        {},
        { limit: 10, page: 1 },
      );

      const foundChar = result.items.find((c: { id: string }) => c.id === character.id);
      expect(foundChar).toBeUndefined();
    });

    test("should paginate unlinked characters correctly", async () => {
      const { session } = await createTestUser();
      const { campaign } = await createTestCampaign(session);

      // Create 15 characters
      const characters = [];
      for (let i = 0; i < 15; i++) {
        const char = await createTestCharacter(session);
        characters.push(char);
      }

      // Fetch page 1 with limit 10
      const page1 = await CharactersMethods.getUnlinkedCharacters(
        session,
        campaign.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(page1.items.length).toBe(10);
      expect(page1.page).toBe(1);
      expect(page1.nextPage).toBe(2);

      // Fetch page 2
      const page2 = await CharactersMethods.getUnlinkedCharacters(
        session,
        campaign.id,
        {},
        { limit: 10, page: 2 },
      );

      expect(page2.items.length).toBeGreaterThanOrEqual(5);
      expect(page2.page).toBe(2);
      expect(page2.nextPage).toBeUndefined();

      // Verify no overlap between pages
      const page1Ids = page1.items.map((c) => c.id);
      const page2Ids = page2.items.map((c) => c.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  describe("enqueuePdf", () => {
    test("should enqueue a generatePdf job with correct payload and queue_name", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      await CharactersMethods.enqueuePdf(session, character.id);

      const jobs = await db.execute(
        sql`SELECT t.identifier AS task_identifier, j.payload, q.queue_name
            FROM graphile_worker._private_jobs j
            JOIN graphile_worker._private_tasks t ON t.id = j.task_id
            LEFT JOIN graphile_worker._private_job_queues q ON q.id = j.job_queue_id
            WHERE j.payload->>'characterId' = ${character.id}`,
      );

      expect(jobs.rows.length).toBe(1);
      const job = jobs.rows[0] as { task_identifier: string; payload: Record<string, unknown>; queue_name: string };
      expect(job.task_identifier).toBe("generatePdf");
      expect(job.payload.userId).toBe(session.userId);
      expect(job.payload.characterId).toBe(character.id);
      expect(job.payload.characterName).toBe(character.name);
      expect(job.queue_name).toBe(`pdf-${session.userId}`);
    });

    test("should log a generatePdf activity", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      await CharactersMethods.enqueuePdf(session, character.id);

      const activity = await db.query.activitiesInAccount.findFirst({
        where: (t, { and, eq }) =>
          and(
            eq(t.userId, session.userId),
            eq(t.targetId, character.id),
            eq(t.type, "generatePdf"),
          ),
      });
      expect(activity).toBeDefined();
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharactersMethods.enqueuePdf(session, fakeCharacterId),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for another user's character", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();
      const character = await createTestCharacter(session1);

      await expect(
        CharactersMethods.enqueuePdf(session2, character.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("archiveCharacter", () => {
    test("should archive character successfully", async () => {
      const { session } = await createTestUser();

      const character = await createTestCharacter(session);

      const archivedCharacter = await CharactersMethods.archiveCharacter(
        session,
        character.id,
      );

      expect(archivedCharacter).toBeDefined();
      expect(archivedCharacter.deletedAt).not.toBeNull();
      expect(archivedCharacter.id).toBe(character.id);
    });

    test("should set deletedAt timestamp when archiving", async () => {
      const { session } = await createTestUser();

      const character = await createTestCharacter(session);

      // Verify character is not archived initially
      expect(character.deletedAt).toBeNull();

      await CharactersMethods.archiveCharacter(session, character.id);

      // Verify character is now archived
      const archivedCharacter = await Characters.findOne(db, {
        id: character.id,
        userId: session.userId,
      }, Visibility.ArchivedOnly);

      expect(archivedCharacter).toBeDefined();
      expect(archivedCharacter?.deletedAt).not.toBeNull();
    });

    test("should throw NotFoundError when archiving non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharactersMethods.archiveCharacter(session, fakeCharacterId),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when archiving another user's character", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();

      const character = await createTestCharacter(session1);

      await expect(
        CharactersMethods.archiveCharacter(session2, character.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("hardDeleteCharacter", () => {
    test("hard-deletes an archived character and wipes its cascade", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      // Add a character-scoped modifier so we can verify cleanup
      await db.insert(modifiersInCustomization).values({
        sourceId: character.id,
        sourceType: "characters",
        target: "abilities.STR.score",
        value: "1",
        valueType: "number",
        operator: "add",
      });

      await CharactersMethods.archiveCharacter(session, character.id);
      await CharactersMethods.hardDeleteCharacter(session, character.id);

      const gone = await Characters.findOne(db, { id: character.id }, Visibility.All);
      expect(gone).toBeUndefined();

      const modRows = await db
        .select({ id: modifiersInCustomization.id })
        .from(modifiersInCustomization)
        .where(and(
          eq(modifiersInCustomization.sourceId, character.id),
          eq(modifiersInCustomization.sourceType, "characters"),
        ));
      expect(modRows.length).toBe(0);
    });

    test("throws NotFoundError when the character is not archived", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      // Active characters aren't visible to the hard-delete lookup (ArchivedOnly).
      await expect(
        CharactersMethods.hardDeleteCharacter(session, character.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("throws NotFoundError when hard-deleting another user's character", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();
      const character = await createTestCharacter(owner);
      await CharactersMethods.archiveCharacter(owner, character.id);

      await expect(
        CharactersMethods.hardDeleteCharacter(other, character.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("throws ConflictError when character is linked to an active campaign", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);
      const { player } = await createTestCampaign(session);

      await PlayerCharacters.create(db, {
        playerId: player.id,
        characterId: character.id,
      });

      await CharactersMethods.archiveCharacter(session, character.id);

      await expect(
        CharactersMethods.hardDeleteCharacter(session, character.id),
      ).rejects.toThrow(ConflictError);
    });

    test("succeeds when character had a soft-removed campaign link", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);
      const { player } = await createTestCampaign(session);

      await PlayerCharacters.create(db, {
        playerId: player.id,
        characterId: character.id,
      });
      // Archive the link (e.g. GM removed the character from the campaign)
      await PlayerCharacters.archive(db, { playerId: player.id, characterId: character.id });

      await CharactersMethods.archiveCharacter(session, character.id);
      await CharactersMethods.hardDeleteCharacter(session, character.id);

      const gone = await Characters.findOne(db, { id: character.id }, Visibility.All);
      expect(gone).toBeUndefined();
    });

    test("succeeds when the linked campaign itself is archived", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);
      const { campaign, player } = await createTestCampaign(session);

      await PlayerCharacters.create(db, {
        playerId: player.id,
        characterId: character.id,
      });
      // Archive the campaign (link row stays live, but the campaign is dormant)
      await Campaigns.archive(db, { id: campaign.id });

      await CharactersMethods.archiveCharacter(session, character.id);
      await CharactersMethods.hardDeleteCharacter(session, character.id);

      const gone = await Characters.findOne(db, { id: character.id }, Visibility.All);
      expect(gone).toBeUndefined();
    });

    test("cascades to bonded children when present", async () => {
      const { session } = await createTestUser();
      const master = await createTestCharacter(session);

      // Insert a fake bonded child directly (full bonded creation is ruleset-driven)
      const ctx = await getCtx();
      const [familiar] = await db.insert(charactersInCharacter).values({
        userId: session.userId,
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        parentCharacterId: master.id,
        kind: "familiar",
        xp: 0,
        name: "Whiskers",
        alignment: "True Neutral",
        gender: "Male",
      }).returning();

      await CharactersMethods.archiveCharacter(session, master.id);
      await CharactersMethods.hardDeleteCharacter(session, master.id);

      const masterGone = await Characters.findOne(db, { id: master.id }, Visibility.All);
      expect(masterGone).toBeUndefined();
      const familiarGone = await Characters.findOne(
        db,
        { id: familiar.id },
        Visibility.All,
      );
      expect(familiarGone).toBeUndefined();
    });
  });

  describe("unarchiveCharacter", () => {
    test("should unarchive character successfully", async () => {
      const { session } = await createTestUser();

      const character = await createTestCharacter(session);

      // Archive first
      await CharactersMethods.archiveCharacter(session, character.id);

      // Then unarchive
      const unarchivedCharacter = await CharactersMethods.unarchiveCharacter(
        session,
        character.id,
      );

      expect(unarchivedCharacter).toBeDefined();
      expect(unarchivedCharacter.deletedAt).toBeNull();
      expect(unarchivedCharacter.id).toBe(character.id);
    });

    test("should clear deletedAt timestamp when unarchiving", async () => {
      const { session } = await createTestUser();

      const character = await createTestCharacter(session);

      // Archive first
      await CharactersMethods.archiveCharacter(session, character.id);

      // Verify character is archived
      const archivedCharacter = await Characters.findOne(db, {
        id: character.id,
        userId: session.userId,
      }, Visibility.ArchivedOnly);
      expect(archivedCharacter?.deletedAt).not.toBeNull();

      // Then unarchive
      await CharactersMethods.unarchiveCharacter(session, character.id);

      // Verify character is no longer archived
      const unarchivedCharacter = await Characters.findOne(db, {
        id: character.id,
        userId: session.userId,
      }, Visibility.UnarchivedOnly);

      expect(unarchivedCharacter).toBeDefined();
      expect(unarchivedCharacter?.deletedAt).toBeNull();
    });

    test("should throw NotFoundError when unarchiving non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharactersMethods.unarchiveCharacter(session, fakeCharacterId),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when unarchiving another user's character", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();

      const character = await createTestCharacter(session1);

      // Archive first
      await CharactersMethods.archiveCharacter(session1, character.id);

      await expect(
        CharactersMethods.unarchiveCharacter(session2, character.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getMyCharacters with visibility", () => {
    test("should get active characters by default", async () => {
      const { session } = await createTestUser();

      const activeCharacter = await createTestCharacter(session);
      const archivedCharacter = await createTestCharacter(session);

      // Archive one character
      await CharactersMethods.archiveCharacter(session, archivedCharacter.id);

      const result = await CharactersMethods.getMyCharacters(
        session,
        { visibility: Visibility.UnarchivedOnly },
        { limit: 10, page: 1 },
      ) as { items: Array<{ id: string }>; page: number };

      const foundActive = result.items.find((c: { id: string }) => c.id === activeCharacter.id);
      const foundArchived = result.items.find(
        (c: { id: string }) => c.id === archivedCharacter.id,
      );

      expect(foundActive).toBeDefined();
      expect(foundArchived).toBeUndefined();
    });

    test("should get archived characters only", async () => {
      const { session } = await createTestUser();

      const activeCharacter = await createTestCharacter(session);
      const archivedCharacter = await createTestCharacter(session);

      // Archive one character
      await CharactersMethods.archiveCharacter(session, archivedCharacter.id);

      const result = await CharactersMethods.getMyCharacters(
        session,
        { visibility: Visibility.ArchivedOnly },
        { limit: 10, page: 1 },
      ) as { items: Array<{ id: string }>; page: number };

      const foundActive = result.items.find((c: { id: string }) => c.id === activeCharacter.id);
      const foundArchived = result.items.find(
        (c: { id: string }) => c.id === archivedCharacter.id,
      );

      expect(foundActive).toBeUndefined();
      expect(foundArchived).toBeDefined();
    });

    test("should get all characters when visibility is All", async () => {
      const { session } = await createTestUser();

      const activeCharacter = await createTestCharacter(session);
      const archivedCharacter = await createTestCharacter(session);

      // Archive one character directly at repository level to avoid transaction issues
      await Characters.archive(db, { id: archivedCharacter.id });

      // Now test the service method
      const result = await CharactersMethods.getMyCharacters(
        session,
        { visibility: Visibility.All },
        { limit: 10, page: 1 },
      ) as { items: Array<{ id: string }>; page: number };

      // Both characters should be in the result
      expect(result.items.length).toBeGreaterThanOrEqual(2);

      const foundActive = result.items.find((c: { id: string }) => c.id === activeCharacter.id);
      const foundArchived = result.items.find(
        (c: { id: string }) => c.id === archivedCharacter.id,
      );

      expect(foundActive).toBeDefined();
      expect(foundArchived).toBeDefined();
    });
  });

  describe("archiveCharacter child data", () => {
    test("does not cascade-archive level/skill/feat/language/inventory children", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const [klassLevel] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 1)));

      const character = await createTestCharacter(session);

      const [characterLevel] = await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevel.id,
        hp: 10,
      });
      await CharacterLevelSkills.create(db, {
        characterLevelId: characterLevel.id,
        skillId: ctx.skillMap["Climb"],
        rank: 1,
      });
      await CharacterLevelFeats.create(db, {
        characterLevelId: characterLevel.id,
        featId: ctx.featMap["Toughness"],
        aptitudeId: ctx.aptMap["General"],
      });
      await CharacterLanguages.create(db, {
        characterId: character.id,
        languageId: ctx.langMap["Common"],
      });
      await CharacterInventory.create(db, {
        characterId: character.id,
        itemId: ctx.itemMap["Longsword"],
        quantity: 1,
      });

      await CharactersMethods.archiveCharacter(session, character.id);

      // Children stay live — the archived parent hides them from all list
      // queries, and unarchive is a pure parent status flip.
      expect((await CharacterLevels.findMany(db, { characterId: character.id })).length).toBe(1);
      expect((await CharacterLevelSkills.findMany(db, { characterLevelIds: [characterLevel.id] })).length).toBe(1);
      expect((await CharacterLevelFeats.findMany(db, { characterLevelIds: [characterLevel.id] })).length).toBe(1);
      expect((await CharacterLanguages.findMany(db, { characterId: character.id }))[0].deletedAt).toBeNull();
      expect((await CharacterInventory.findMany(db, { characterId: character.id }))[0].deletedAt).toBeNull();
    });

    test("unarchive flips deletedAt back; child data remains accessible", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const [klassLevel] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 1)));

      const character = await createTestCharacter(session);

      const [characterLevel] = await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevel.id,
        hp: 10,
      });
      await CharacterLevelSkills.create(db, {
        characterLevelId: characterLevel.id,
        skillId: ctx.skillMap["Swim"],
        rank: 2,
      });
      await CharacterLevelFeats.create(db, {
        characterLevelId: characterLevel.id,
        featId: ctx.featMap["Dodge"],
        aptitudeId: ctx.aptMap["General"],
      });

      await CharactersMethods.archiveCharacter(session, character.id);
      await CharactersMethods.unarchiveCharacter(session, character.id);

      expect((await CharacterLevels.findMany(db, { characterId: character.id })).length).toBe(1);
      expect((await CharacterLevelSkills.findMany(db, { characterLevelIds: [characterLevel.id] })).length).toBe(1);
      expect((await CharacterLevelFeats.findMany(db, { characterLevelIds: [characterLevel.id] })).length).toBe(1);
    });
  });

  describe("COW fork", () => {
    async function createCowFork(parentUserId: string, childUserId: string) {
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const parentRulesets = await Rulesets.create(db, {
        name: `Test Ruleset ${uniqueId}`,
        description: "Test ruleset for characters testing",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: parentUserId,
      });
      const parentRuleset = parentRulesets[0];
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      const races = await Races.create(db, {
        rulesetId: parentRuleset.id,
        name: `Test Race ${uniqueId}`,
        description: "Test race for characters testing",
        size: "Medium",
        baseSpeed: 30,
      });
      const race = races[0];

      const forkId = Math.random().toString(36).substr(2, 9);
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${forkId}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childUserId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      return { parentRuleset, childRuleset, race };
    }

    test("should create a character with an inherited parent race", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { childRuleset, race } = await createCowFork(parentUser.id, user.id);

      const character = await CharactersMethods.createCharacter(session, {
        rulesetId: childRuleset.id,
        raceId: race.id,
        name: "COW Character",
        xp: 0,
        alignment: "Neutral Good",
        abilities: {},
        age: 25,
        gender: "Male",
        height: "6'0\"",
        weight: "180 lbs",
      });

      expect(character).toBeDefined();
      expect(character.rulesetId).toBe(childRuleset.id);
      expect(character.raceId).toBe(race.id);
    });

    test("should reject a race from an unrelated ruleset", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { childRuleset } = await createCowFork(parentUser.id, user.id);

      // Create race in an unrelated ruleset
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const unrelatedRulesets = await Rulesets.create(db, {
        name: `Unrelated Ruleset ${uniqueId}`,
        description: "Unrelated ruleset",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
      });
      const unrelatedRaces = await Races.create(db, {
        rulesetId: unrelatedRulesets[0].id,
        name: `Unrelated Race ${uniqueId}`,
        description: "Unrelated race",
        size: "Medium",
        baseSpeed: 30,
      });
      const unrelatedRace = unrelatedRaces[0];

      await expect(
        CharactersMethods.createCharacter(session, {
          rulesetId: childRuleset.id,
          raceId: unrelatedRace.id,
          name: "Bad Character",
          xp: 0,
          alignment: "Neutral Good",
          abilities: {},
          age: 25,
          gender: "Male",
          height: "6'0\"",
          weight: "180 lbs",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("createCharacter accepts a race inherited via a multi-level chain (built directly in DB)", async () => {
      // The API blocks fork-of-fork via canFork, but we still want the
      // character-side lineage check to walk the full ancestor array if a
      // chain ever exists in the DB (data backfill, future relaxation, etc.).
      // Build a 3-level chain directly via Rulesets.create and assert that
      // a race defined at the root is accepted on the leaf.
      const { user, session } = await createTestUser();
      const { user: grandparentUser } = await createTestUser();
      const uniqueId = Math.random().toString(36).substr(2, 9);

      const grandparentRulesets = await Rulesets.create(db, {
        name: `Grandparent Ruleset ${uniqueId}`,
        description: "Three-level fork chain root",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: grandparentUser.id,
      });
      const grandparent = grandparentRulesets[0];
      await Rulesets.update(db, { status: "Published" }, { id: grandparent.id });

      const races = await Races.create(db, {
        rulesetId: grandparent.id,
        name: `GP Race ${uniqueId}`,
        description: "Defined in grandparent, inherited transitively",
        size: "Medium",
        baseSpeed: 30,
      });
      const race = races[0];

      const parentRulesets = await Rulesets.create(db, {
        name: `Parent Ruleset ${uniqueId}`,
        description: "Direct fork of grandparent",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: grandparentUser.id,
        rulesetId: grandparent.id,
        ancestorRulesetIds: [grandparent.id],
      });
      const parent = parentRulesets[0];
      await Rulesets.update(db, { status: "Published" }, { id: parent.id });

      const grandchildRulesets = await Rulesets.create(db, {
        name: `Grandchild Fork ${uniqueId}`,
        description: "Fork of fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        rulesetId: parent.id,
        ancestorRulesetIds: [parent.id, grandparent.id],
      });
      const grandchild = grandchildRulesets[0];

      const character = await CharactersMethods.createCharacter(session, {
        rulesetId: grandchild.id,
        raceId: race.id,
        name: "Grandchild Character",
        xp: 0,
        alignment: "Neutral Good",
        abilities: {},
        age: 25,
        gender: "Male",
        height: "6'0\"",
        weight: "180 lbs",
      });

      expect(character.rulesetId).toBe(grandchild.id);
      expect(character.raceId).toBe(race.id);
    });
  });

  describe("updateAbilities — COW fork", () => {
    test("accepts the post-COW ability id the client sees after an ability is COW'd on the fork", async () => {
      // Regression: updateAbilities previously validated client-submitted
      // ability ids against stored character_abilities rows, which hold
      // pre-COW ids. After any ability COW on the fork, every update would
      // reject with "Ability not found".
      const ctx = await getCtx();
      const actualSession = createTestSession(SEED_USER_ID);

      const childRulesets = await Rulesets.create(db, {
        name: `COW Ability Fork ${Math.random().toString(36).slice(2, 9)}`,
        description: "COW fork for updateAbilities test",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: actualSession.userId,
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const childRuleset = childRulesets[0];

      const character = await CharactersMethods.createCharacter(actualSession, {
        rulesetId: childRuleset.id,
        raceId: ctx.raceMap.pc["Human"],
        name: "COW Ability Test",
        xp: 0,
        alignment: "Neutral Good",
        abilities: {},
        age: 25,
        gender: "Male",
        height: "6'0\"",
        weight: "180 lbs",
      });

      // COW the Strength ability into the fork. After this:
      //   - character_abilities.ability_id is still the base Strength id.
      //   - rulesetData.abilitiesById on childRuleset exposes the COW'd id
      //     (but auto-resolves pre-COW key, so the client sees the post-COW id).
      const strengthBaseId = ctx.abilityMap["Strength"];
      const cow = await cowEntity(db, "abilities", strengthBaseId, childRuleset.id);
      const strengthPostCowId = (cow as { id: string }).id;
      expect(strengthPostCowId).not.toBe(strengthBaseId);

      // cowEntity mutates DB but doesn't auto-invalidate the ruleset cache —
      // the higher-level services do this after cowEntity. Mirror that here.
      invalidateRuleset(childRuleset.id);

      // Simulate the client submitting the post-COW id — which is what it
      // sees through the composed cache.
      await CharactersMethods.updateAbilities(actualSession, character.id, {
        [strengthPostCowId]: 17,
      });

      // The existing character_abilities row (stored with pre-COW id) is
      // the one that got updated.
      const rows = await CharacterAbilities.findMany(db, { characterId: character.id });
      const strengthRow = rows.find((r) => r.abilityId === strengthBaseId);
      expect(strengthRow?.score).toBe(17);
    });
  });

  describe("getAvailableRaces", () => {
    test("should return all races for a ruleset with no requirements", async () => {
      const ctx = await getCtx();

      const result = await CharactersMethods.getAvailableRaces(ctx.rulesetId, {}, {}, { limit: 100, page: 1 });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      // Should include seed races like Human, Elf, Dwarf — all eligible
      const raceNames = result.items.map((r) => r.name);
      expect(raceNames).toContain("Human");
      expect(raceNames).toContain("Elf");
      expect(raceNames).toContain("Dwarf");
      // All seed races without requirements should be eligible
      for (const race of result.items) {
        expect(race.eligible).toBe(true);
      }
    });

    test("should mark races with unmet alignment requirement as ineligible", async () => {
      const ctx = await getCtx();

      // Create a test race with an alignment requirement
      const [testRace] = await Races.create(db, {
        rulesetId: ctx.rulesetId,
        name: `Evil-Only Race ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test race requiring evil alignment",
        size: "Medium",
        baseSpeed: 30,
      });

      await Requirements.create(db, {
        entityId: testRace.id,
        entityType: "races",
        level: "1",
        target: "identity.beliefs.alignment",
        operator: "equal",
        value: "Chaotic Evil",
        valueType: "string",
        chainingOperator: null,
      });
      invalidateRuleset(ctx.rulesetId);

      // With matching alignment: race should be eligible
      const resultEvil = await CharactersMethods.getAvailableRaces(ctx.rulesetId, {
        alignment: "Chaotic Evil",
      }, {}, { limit: 100, page: 1 });
      const evilRace = resultEvil.items.find((r) => r.id === testRace.id);
      expect(evilRace).toBeDefined();
      expect(evilRace!.eligible).toBe(true);

      // With non-matching alignment: race should be present but ineligible
      const resultGood = await CharactersMethods.getAvailableRaces(ctx.rulesetId, {
        alignment: "Lawful Good",
      }, {}, { limit: 100, page: 1 });
      const goodRace = resultGood.items.find((r) => r.id === testRace.id);
      expect(goodRace).toBeDefined();
      expect(goodRace!.eligible).toBe(false);
    });

    test("should mark races as eligible when form data is not yet provided (lenient)", async () => {
      const ctx = await getCtx();

      // Create a test race with an alignment requirement
      const [testRace] = await Races.create(db, {
        rulesetId: ctx.rulesetId,
        name: `Restricted Race ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test race with alignment requirement",
        size: "Medium",
        baseSpeed: 30,
      });

      await Requirements.create(db, {
        entityId: testRace.id,
        entityType: "races",
        level: "1",
        target: "identity.beliefs.alignment",
        operator: "equal",
        value: "Chaotic Evil",
        valueType: "string",
        chainingOperator: null,
      });
      invalidateRuleset(ctx.rulesetId);

      // With no form data: race should still appear and be eligible (can't evaluate yet → lenient)
      const result = await CharactersMethods.getAvailableRaces(ctx.rulesetId, {}, {}, { limit: 100, page: 1 });
      const race = result.items.find((r) => r.id === testRace.id);
      expect(race).toBeDefined();
      expect(race!.eligible).toBe(true);
    });

    test("should mark races with unmet gender requirement as ineligible", async () => {
      const ctx = await getCtx();

      const [testRace] = await Races.create(db, {
        rulesetId: ctx.rulesetId,
        name: `Female-Only Race ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test race requiring female gender",
        size: "Medium",
        baseSpeed: 30,
      });

      await Requirements.create(db, {
        entityId: testRace.id,
        entityType: "races",
        level: "1",
        target: "identity.physiology.gender",
        operator: "equal",
        value: "Female",
        valueType: "string",
        chainingOperator: null,
      });
      invalidateRuleset(ctx.rulesetId);

      // Matching gender: should be eligible
      const resultFemale = await CharactersMethods.getAvailableRaces(ctx.rulesetId, {
        gender: "Female",
      }, {}, { limit: 100, page: 1 });
      const femaleRace = resultFemale.items.find((r) => r.id === testRace.id);
      expect(femaleRace).toBeDefined();
      expect(femaleRace!.eligible).toBe(true);

      // Non-matching gender: should be present but ineligible
      const resultMale = await CharactersMethods.getAvailableRaces(ctx.rulesetId, {
        gender: "Male",
      }, {}, { limit: 100, page: 1 });
      const maleRace = resultMale.items.find((r) => r.id === testRace.id);
      expect(maleRace).toBeDefined();
      expect(maleRace!.eligible).toBe(false);
    });
  });

  describe("generateShareToken", () => {
    test("should generate a share token for own character", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      const updated = await CharactersMethods.generateShareToken(session, character.id);

      expect(updated.shareToken).toBeDefined();
      expect(typeof updated.shareToken).toBe("string");
      expect(updated.shareToken!.length).toBeGreaterThan(0);
    });

    test("should regenerate a new share token", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      const first = await CharactersMethods.generateShareToken(session, character.id);
      const second = await CharactersMethods.generateShareToken(session, character.id);

      expect(first.shareToken).toBeDefined();
      expect(second.shareToken).toBeDefined();
      expect(first.shareToken).not.toBe(second.shareToken);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();

      await expect(
        CharactersMethods.generateShareToken(session, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when generating for another user's character", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();
      const character = await createTestCharacter(session1);

      await expect(
        CharactersMethods.generateShareToken(session2, character.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("revokeShareToken", () => {
    test("should revoke an existing share token", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      const withToken = await CharactersMethods.generateShareToken(session, character.id);
      expect(withToken.shareToken).toBeDefined();

      const revoked = await CharactersMethods.revokeShareToken(session, character.id);
      expect(revoked.shareToken).toBeNull();
    });

    test("should succeed even when no token exists", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      const revoked = await CharactersMethods.revokeShareToken(session, character.id);
      expect(revoked.shareToken).toBeNull();
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();

      await expect(
        CharactersMethods.revokeShareToken(session, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when revoking another user's character", async () => {
      const { session: session1 } = await createTestUser();
      const { session: session2 } = await createTestUser();
      const character = await createTestCharacter(session1);

      await CharactersMethods.generateShareToken(session1, character.id);

      await expect(
        CharactersMethods.revokeShareToken(session2, character.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getSharedCharacter", () => {
    test("should return character data by share token", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      const updated = await CharactersMethods.generateShareToken(session, character.id);

      const result = await CharactersMethods.getSharedCharacter(updated.shareToken!);

      expect(result.character.id).toBe(character.id);
      expect(result.detailedCharacter).toBeDefined();
    });

    test("should throw NotFoundError for invalid share token", async () => {
      await expect(
        CharactersMethods.getSharedCharacter("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError after token is revoked", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      const updated = await CharactersMethods.generateShareToken(session, character.id);
      const shareToken = updated.shareToken!;

      await CharactersMethods.revokeShareToken(session, character.id);

      await expect(
        CharactersMethods.getSharedCharacter(shareToken),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("generateSharedPdf", () => {
    test("should generate PDF data by share token", async () => {
      const { session } = await createTestUser();
      const character = await createTestCharacter(session);

      const updated = await CharactersMethods.generateShareToken(session, character.id);

      const result = await CharactersMethods.generateSharedPdf(updated.shareToken!);

      expect(result.detailedCharacter).toBeDefined();
      expect(result.CharacterSheetComponent).toBeDefined();
    });

    test("should throw NotFoundError for invalid share token", async () => {
      await expect(
        CharactersMethods.generateSharedPdf("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
