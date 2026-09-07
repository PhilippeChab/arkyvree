import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  Abilities,
  Aptitudes,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  Feats,
  FeatsAptitudes,
  Klasses,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassSkills,
  Modifiers,
  Powers,
  PowersAptitudes,
  Races,
  Rulesets,
  Skills,
  Properties,
  Users,
} from "@/server/repositories/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { CharacterLevelsMethods } from "@/server/services/characters/CharacterLevelsService.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { DND35_DMG_NAME, DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";
import { addClassLevels, addFeats, addPowers, addSkills, createCharacter, getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { addOneLevel } from "@/tests/helpers.ts";
import { characterAbilitiesInCharacter, klassLevelsInRules, languagesInCharacter, levelsInCharacter } from "@/drizzle/schema.ts";
import { and, eq } from "drizzle-orm";

describe("LevelsService", () => {
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

  // Helper to create test ruleset
  async function createTestRuleset(userId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for levels testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId,
    });

    return rulesets[0];
  }

  // Helper to create test race
  async function createTestRace(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const races = await Races.create(db, {
      name: `Test Race ${uniqueId}`,
      description: "Test race",
      rulesetId,
      size: "Medium",
      baseSpeed: 30,
    });

    return races[0];
  }

  // Helper to create test klass with levels
  async function createTestKlass(rulesetId: string, maxLevel: number = 20) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const klasses = await Klasses.create(db, {
      name: `Test Class ${uniqueId}`,
      description: "Test class",
      rulesetId,
      hd: 8,
    });
    const klass = klasses[0];

    // Create klass levels
    const klassLevels = [];
    for (let level = 1; level <= maxLevel; level++) {
      const levels = await KlassLevels.create(db, {
        klassId: klass.id,
        level,
      });
      const klassLevel = levels[0];

      await Properties.createMany(db, [
        { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: String(level) },
        { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: String(2 + Math.floor(level / 2)) },
      ]);

      klassLevels.push(klassLevel);
    }

    return { klass, klassLevels };
  }

  // Helper to create test character
  async function createTestCharacter(userId: string, rulesetId: string, raceId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const characters = await Characters.create(db, {
      userId,
      rulesetId,
      raceId,
      name: `Test Character ${uniqueId}`,
      alignment: "Neutral Good",
      xp: 0,
      age: 25,
      gender: "Male",
      height: "6'0\"",
      weight: "180 lbs",
    });

    return characters[0];
  }

  // Helper to create test abilities
  async function createTestAbilities(rulesetId: string) {
    const abilities = await Abilities.createMany(db, [
      { name: "Charisma", description: "Force of personality", rulesetId },
      { name: "Dexterity", description: "Agility and reflexes", rulesetId },
      { name: "Intelligence", description: "Reasoning and memory", rulesetId },
    ]);
    return abilities;
  }

  // Helper to create test skills
  async function createTestSkills(rulesetId: string) {
    const abilities = await createTestAbilities(rulesetId);
    const charismaId = abilities.find(a => a.name === "Charisma")!.id;
    const dexterityId = abilities.find(a => a.name === "Dexterity")!.id;
    const intelligenceId = abilities.find(a => a.name === "Intelligence")!.id;

    const skills = await Skills.createMany(db, [
      {
        name: "Diplomacy",
        description: "Persuasion and negotiation",
        rulesetId,
        primaryAbilityId: charismaId,
      },
      {
        name: "Stealth",
        description: "Hiding and moving silently",
        rulesetId,
        primaryAbilityId: dexterityId,
      },
      {
        name: "Knowledge (Arcana)",
        description: "Knowledge of magic and arcane lore",
        rulesetId,
        primaryAbilityId: intelligenceId,
      },
    ]);

    return skills;
  }

  // Helper to create test aptitude
  async function createTestAptitude(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const aptitudes = await Aptitudes.create(db, {
      name: `Test Aptitude ${uniqueId}`,
      description: "Test aptitude for feats",
      rulesetId,
    });

    return aptitudes[0];
  }

  // Helper to create general aptitude (required by the system)
  async function createGeneralAptitude(rulesetId: string) {
    const aptitudes = await Aptitudes.create(db, {
      name: "general",
      description: "General feats aptitude",
      rulesetId,
    });

    return aptitudes[0];
  }

  // Helper to create test feats
  async function createTestFeats(rulesetId: string) {
    const feats = await Feats.createMany(db, [
      {
        name: "Power Attack",
        description: "Trade attack bonus for damage",
        rulesetId,
        stackable: false,
      },
      {
        name: "Weapon Focus",
        description: "Gain +1 to attack rolls with a weapon",
        rulesetId,
        stackable: true,
      },
      {
        name: "Dodge",
        description: "Gain +1 AC against one opponent",
        rulesetId,
        stackable: false,
      },
    ]);

    return feats;
  }

  // Helper to create test powers
  async function createTestPowers(rulesetId: string) {
    const powers = await Powers.createMany(db, [
      {
        name: "Sneak Attack",
        description: "Deal extra damage when flanking",
        rulesetId,
      },
      {
        name: "Rage",
        description: "Enter a battle fury",
        rulesetId,
      },
      {
        name: "Uncanny Dodge",
        description: "Cannot be caught flat-footed",
        rulesetId,
      },
    ]);

    return powers;
  }

  describe("getAvailableKlasses", () => {
    test("should return klasses for a new character with eligible flag", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const result = await CharacterLevelsMethods.getAvailableKlasses(session, characterId, {}, { limit: 100, page: 1 });

      expect(result).toBeDefined();
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const fighter = result.items.find((k) => k.id === ctx.klassMap.pc["Fighter"] && k.nextLevel === 1);
      const rogue = result.items.find((k) => k.id === ctx.klassMap.pc["Rogue"] && k.nextLevel === 1);
      expect(fighter).toBeDefined();
      expect(fighter!.eligible).toBe(true);
      expect(rogue).toBeDefined();
      expect(rogue!.eligible).toBe(true);
    });

    test("should return klasses with next available level and eligible flag", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Add Fighter level 1
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      const result = await CharacterLevelsMethods.getAvailableKlasses(session, characterId, {}, { limit: 100, page: 1 });

      const fighter = result.items.find((k) => k.id === ctx.klassMap.pc["Fighter"]);
      expect(fighter).toBeDefined();
      expect(fighter!.nextLevel).toBe(2);
      expect(fighter!.eligible).toBe(true);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharacterLevelsMethods.getAvailableKlasses(session, fakeCharacterId, {}, { limit: 100, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when character belongs to different user", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);

      await expect(
        CharacterLevelsMethods.getAvailableKlasses(otherSession, character.id, {}, { limit: 100, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    // Blackguard (DMG prestige class) requires:
    // BAB >= 6, Hide rank >= 5, Knowledge Religion rank >= 2,
    // Power Attack, Cleave, Improved Sunder, evil alignment.
    // Each test provides ALL requirements except one, then projects the missing piece.

    async function setupBlackguardTest() {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      const base = await Rulesets.findOne(db, { name: DND35_RULESET_NAME });
      const dmg = await Rulesets.findOne(db, { name: DND35_DMG_NAME });
      if (!base || !dmg) throw new Error("Seed rulesets not found");

      const fork = await RulesetsMethods.forkRuleset(session, base.id, {
        name: `TestFork ${Math.random().toString(36).substr(2, 5)}`,
        private: false,
      });
      await RulesetsMethods.subscribeExtension(session, fork.id, [dmg.id]);

      const blackguard = await Klasses.findOne(db, { name: "Blackguard", rulesetId: dmg.id });
      if (!blackguard) throw new Error("Blackguard not found");

      return { ctx, session, fork, blackguardId: blackguard.id };
    }

    // Helper: create a character on the fork with all Blackguard prereqs met
    async function createBlackguardCandidate(
      ctx: Awaited<ReturnType<typeof getSeedContext>>,
      forkId: string,
      overrides?: { skipBab?: boolean; skipFeats?: string[]; skipSkills?: string[] },
    ) {
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Blackguard Candidate", xp: 36000,
        alignment: "Chaotic Evil", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });
      await Characters.update(db, { rulesetId: forkId }, { id: characterId });

      const fighterLevels = overrides?.skipBab ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
      const hp = fighterLevels.map(() => 10);
      const levelIds = await addClassLevels(db, ctx, characterId, "Fighter", fighterLevels, hp);

      // Skills: Hide and Knowledge Religion are cross-class for Fighter (2 points = 1 rank)
      const skipSkills = new Set(overrides?.skipSkills ?? []);
      const skills: { levelIndex: number; skillName: string; rank: number }[] = [];
      if (!skipSkills.has("Hide")) skills.push({ levelIndex: 0, skillName: "Hide", rank: 10 }); // 10 points = 5 cross-class ranks
      if (!skipSkills.has("Knowledge (Religion)")) skills.push({ levelIndex: 0, skillName: "Knowledge (Religion)", rank: 4 }); // 4 points = 2 cross-class ranks
      if (skills.length > 0) await addSkills(db, ctx, levelIds, skills);

      // Feats
      const skipFeats = new Set(overrides?.skipFeats ?? []);
      const feats: { levelIndex: number; aptitude: string; featName: string }[] = [];
      if (!skipFeats.has("Power Attack")) feats.push({ levelIndex: 0, aptitude: "General", featName: "Power Attack" });
      if (!skipFeats.has("Improved Sunder")) feats.push({ levelIndex: 0, aptitude: "Fighter Bonus Feat", featName: "Improved Sunder" });
      if (!skipFeats.has("Cleave")) feats.push({ levelIndex: 1, aptitude: "Fighter Bonus Feat", featName: "Cleave" });
      if (feats.length > 0) await addFeats(db, ctx, levelIds, feats);

      return characterId;
    }

    test("should make Blackguard eligible when pending levels provide enough BAB", async () => {
      const { ctx, session, fork, blackguardId } = await setupBlackguardTest();
      // Fighter L5 = BAB 5 < 6: ineligible
      const characterId = await createBlackguardCandidate(ctx, fork.id, { skipBab: true });

      const without = await CharacterLevelsMethods.getAvailableKlasses(session, characterId, {}, { limit: 100, page: 1 });
      expect(without.items.find((k) => k.id === blackguardId)!.eligible).toBe(false);

      // Pending Fighter L6 → BAB 6: eligible
      const [fighterL6] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 6)));

      const withPending = await CharacterLevelsMethods.getAvailableKlasses(
        session, characterId, {}, { limit: 100, page: 1 },
        [fighterL6.id],
      );
      expect(withPending.items.find((k) => k.id === blackguardId)!.eligible).toBe(true);
    });

    test("should make Blackguard eligible when pending feats fulfill its requirements", async () => {
      const { ctx, session, fork, blackguardId } = await setupBlackguardTest();
      const characterId = await createBlackguardCandidate(ctx, fork.id, { skipFeats: ["Cleave"] });

      const without = await CharacterLevelsMethods.getAvailableKlasses(session, characterId, {}, { limit: 100, page: 1 });
      expect(without.items.find((k) => k.id === blackguardId)!.eligible).toBe(false);

      const withFeat = await CharacterLevelsMethods.getAvailableKlasses(
        session, characterId, {}, { limit: 100, page: 1 },
        undefined, undefined,
        [{ featId: ctx.featMap["Cleave"], aptitudeId: ctx.aptMap["General"] }],
      );
      expect(withFeat.items.find((k) => k.id === blackguardId)!.eligible).toBe(true);
    });

    test("should make Blackguard eligible when pending skill allocations fulfill its requirements", async () => {
      const { ctx, session, fork, blackguardId } = await setupBlackguardTest();
      const characterId = await createBlackguardCandidate(ctx, fork.id, { skipSkills: ["Hide"] });

      const without = await CharacterLevelsMethods.getAvailableKlasses(session, characterId, {}, { limit: 100, page: 1 });
      expect(without.items.find((k) => k.id === blackguardId)!.eligible).toBe(false);

      // Pending Fighter L7 + Hide rank 10 (cross-class: 10 points = 5 ranks)
      const [fighterL7] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, ctx.klassMap.pc["Fighter"]), eq(klassLevelsInRules.level, 7)));

      const withSkills = await CharacterLevelsMethods.getAvailableKlasses(
        session, characterId, {}, { limit: 100, page: 1 },
        [fighterL7.id], undefined, undefined,
        [{ skillId: ctx.skillMap["Hide"], rank: 10 }],
      );
      expect(withSkills.items.find((k) => k.id === blackguardId)!.eligible).toBe(true);
    });
  });

  describe("getAttributeSlots", () => {
    test("should return unavailable when not at level divisible by 4", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klassLevels } = await createTestKlass(ruleset.id, 5);

      // Add 2 levels (next would be level 3, not divisible by 4)
      await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[0].id,
        hp: 8,
        abilityId: null,
      });
      await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[1].id,
        hp: 8,
        abilityId: null,
      });

      const result = await CharacterLevelsMethods.getAttributeSlots(session, character.id);

      expect(result.isAvailable).toBe(false);
      expect(result.attributes).toEqual({});
    });

    test("should return available attributes when at level divisible by 4", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      await createGeneralAptitude(ruleset.id);
      const { klassLevels } = await createTestKlass(ruleset.id, 5);

      // Add 3 levels (next would be level 4, divisible by 4)
      for (let i = 0; i < 3; i++) {
        await CharacterLevels.create(db, {
          characterId: character.id,
          klassLevelId: klassLevels[i].id,
          hp: 8,
          abilityId: null,
        });
      }

      const result = await CharacterLevelsMethods.getAttributeSlots(session, character.id);

      expect(result.isAvailable).toBe(true);
      expect(result.attributes).toBeDefined();
      expect(typeof result.attributes).toBe("object");
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharacterLevelsMethods.getAttributeSlots(session, fakeCharacterId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getSkillSlots", () => {
    test("should return skills data for leveling up", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const skills = await createTestSkills(ruleset.id);

      // Set up class skills
      await KlassSkills.create(db, {
        klassId: klass.id,
        skillId: skills[0].id, // Diplomacy is a class skill
      });

      const result = await CharacterLevelsMethods.getSkillSlots(
        session,
        character.id,
        klass.id,
        1
      );

      expect(result).toBeDefined();
      expect(result.skillPointsToSpend).toBeGreaterThan(0);
      expect(result.totalCharacterLevel).toBe(1);
      expect(result.skills).toBeDefined();
      expect(Array.isArray(result.skills)).toBe(true);
      expect(result.skills.length).toBe(3);

      // Check class skill is marked correctly
      const diplomacy = result.skills.find((s) => s.name === "Diplomacy");
      expect(diplomacy).toBeDefined();
      expect(diplomacy?.isClassSkill).toBe(true);

      const stealth = result.skills.find((s) => s.name === "Stealth");
      expect(stealth).toBeDefined();
      expect(stealth?.isClassSkill).toBe(false);
    });

    test("should include current skill ranks", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const skills = await createTestSkills(ruleset.id);

      // Add first level with a skill rank
      const characterLevels = await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[0].id,
        hp: 8,
        abilityId: null,
      });
      const characterLevel = characterLevels[0];

      await CharacterLevelSkills.create(db, {
        characterLevelId: characterLevel.id,
        skillId: skills[0].id,
        rank: 1,
      });

      const result = await CharacterLevelsMethods.getSkillSlots(
        session,
        character.id,
        klass.id,
        2
      );

      const diplomacy = result.skills.find((s) => s.name === "Diplomacy");
      expect(diplomacy?.currentRank).toBeGreaterThan(0);

      const stealth = result.skills.find((s) => s.name === "Stealth");
      expect(stealth?.currentRank).toBe(0);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharacterLevelsMethods.getSkillSlots(session, fakeCharacterId, klass.id, 1)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent klass level", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);

      await expect(
        CharacterLevelsMethods.getSkillSlots(session, character.id, klass.id, 999)
      ).rejects.toThrow(NotFoundError);
    });

    test("should include retroactive skill points when abilityId increases Intelligence", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      // Human Fighter with INT 13 (+1 mod). Skill points per level = (2 base + 1 INT + 1 Human) = 4.
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "INT Increase Test", xp: 6000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 13, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // L1: 16 SP (4 × 4), L2-L3: 4 SP each. Total spent = 24.
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
        { [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Handle Animal"]]: 1 },
        { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Dodge"]] },
        {},
      );
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 3, 8, null,
        { [ctx.skillMap["Jump"]]: 1, [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Handle Animal"]]: 1, [ctx.skillMap["Spot"]]: 1 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"]] },
        {},
      );

      // Without abilityId: INT stays at 13 (+1 mod).
      // Total budget = 16 + 4 + 4 + 4 (projected L4) = 28, spent = 24, available = 4.
      const withoutAbility = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, ctx.klassMap.pc["Fighter"], 4,
      );
      expect(withoutAbility.skillPointsToSpend).toBe(4);

      // With abilityId = Intelligence: INT becomes 14 (+2 mod).
      // Retroactive recalc: per level = (2 + 2 + 1) = 5. Total = 20 + 5 + 5 + 5 = 35.
      // Spent = 24, available = 11 (5 for this level + 6 retroactive from L1-L3).
      const withAbility = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, ctx.klassMap.pc["Fighter"], 4,
        undefined, // excludeCharacterLevelId
        ctx.abilityMap["Intelligence"],
      );
      expect(withAbility.skillPointsToSpend).toBe(11);
    });

    test("should not count misc INT bonus toward skill point budget", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      // Same setup as the retroactive INT test: Human Fighter INT 13, SP/level = 4.
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Misc INT Skill Test", xp: 6000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 13, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
        { [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Handle Animal"]]: 1 },
        { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Dodge"]] },
        {},
      );
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 3, 8, null,
        { [ctx.skillMap["Jump"]]: 1, [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Handle Animal"]]: 1, [ctx.skillMap["Spot"]]: 1 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"]] },
        {},
      );

      // Attach a misc INT bonus to Power Attack (already taken at L1). With the bug
      // this would inflate INT mod from +1 to +2, raising SP/level from 4 to 5.
      await Modifiers.create(db, {
        sourceId: ctx.featMap["Power Attack"],
        sourceType: "feats",
        target: "abilities.intelligence.misc",
        value: "2",
        valueType: "number",
        operator: "add",
      });
      invalidateRuleset(ctx.rulesetId);

      // Budget must still be (2+1+1)*4 + 4*3 = 28, spent = 24, available = 4.
      const result = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, ctx.klassMap.pc["Fighter"], 4,
      );
      expect(result.skillPointsToSpend).toBe(4);
    });
  });

  describe("getFeatSlots", () => {
    test("should return feats data for leveling up", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);

      const result = await CharacterLevelsMethods.getFeatSlots(
        session,
        character.id,
        klass.id,
        1
      );

      expect(result).toBeDefined();
      expect(result.featsToSelect).toBeGreaterThanOrEqual(0);
      expect(result.autoGrantedFeats).toBeDefined();
      expect(Array.isArray(result.autoGrantedFeats)).toBe(true);
      expect(result.aptitudePools).toBeDefined();
      expect(typeof result.aptitudePools).toBe("object");
    });

    test("should include auto-granted feats from klass level", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const feats = await createTestFeats(ruleset.id);

      // Add an auto-granted feat to level 1
      await KlassLevelFeats.create(db, {
        klassLevelId: klassLevels[0].id,
        featId: feats[0].id,
        aptitudeId: aptitude.id,
      });

      const result = await CharacterLevelsMethods.getFeatSlots(
        session,
        character.id,
        klass.id,
        1
      );

      expect(result.autoGrantedFeats.length).toBe(1);
      expect(result.autoGrantedFeats[0].id).toBe(feats[0].id);
    });

    test("should exclude non-stackable feats already taken from results", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const feats = await createTestFeats(ruleset.id);

      // Link feats to the aptitude
      await FeatsAptitudes.createMany(db, feats.map((f) => ({
        featId: f.id,
        aptitudeId: aptitude.id,
      })));

      // Add level 1 with a non-stackable feat (Power Attack)
      const characterLevels = await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[0].id,
        hp: 8,
        abilityId: null,
      });
      const characterLevel = characterLevels[0];

      await CharacterLevelFeats.create(db, {
        characterLevelId: characterLevel.id,
        featId: feats[0].id, // Power Attack (stackable: false)
        aptitudeId: aptitude.id,
      });

      const result = await CharacterLevelsMethods.getAvailableFeats(
        session,
        character.id,
        aptitude.id,
        klass.id,
        2,
        {},
        { limit: 100, page: 1 },
      );

      // Power Attack should not be in results (excluded by non-stackable filter)
      const powerAttack = result.items.find((f) => f.name === "Power Attack");
      expect(powerAttack).toBeUndefined();

      // Weapon Focus (stackable) should be available and eligible
      const weaponFocus = result.items.find((f) => f.name === "Weapon Focus");
      expect(weaponFocus).toBeDefined();
      expect(weaponFocus!.eligible).toBe(true);
    });

    test("should allow stackable feats to be taken multiple times", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const feats = await createTestFeats(ruleset.id);

      // Link feats to the aptitude
      await FeatsAptitudes.createMany(db, feats.map((f) => ({
        featId: f.id,
        aptitudeId: aptitude.id,
      })));

      // Add level 1 with a stackable feat (Weapon Focus)
      const characterLevels = await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[0].id,
        hp: 8,
        abilityId: null,
      });
      const characterLevel = characterLevels[0];

      await CharacterLevelFeats.create(db, {
        characterLevelId: characterLevel.id,
        featId: feats[1].id, // Weapon Focus (stackable: true)
        aptitudeId: aptitude.id,
      });

      const result = await CharacterLevelsMethods.getAvailableFeats(
        session,
        character.id,
        aptitude.id,
        klass.id,
        2,
        {},
        { limit: 100, page: 1 },
      );

      // Weapon Focus should still be available and eligible
      const weaponFocus = result.items.find((f) => f.name === "Weapon Focus");
      expect(weaponFocus).toBeDefined();
      expect(weaponFocus!.eligible).toBe(true);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharacterLevelsMethods.getFeatSlots(session, fakeCharacterId, klass.id, 1)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent klass level", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);

      await expect(
        CharacterLevelsMethods.getFeatSlots(session, character.id, klass.id, 999)
      ).rejects.toThrow(NotFoundError);
    });

    test("should flag aptitude pools shared with powers", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);

      // Create an aptitude with only feats (not shared)
      const featOnlyAptitude = await createTestAptitude(ruleset.id);
      const feats = await createTestFeats(ruleset.id);
      await FeatsAptitudes.createMany(db, feats.map((f) => ({
        featId: f.id,
        aptitudeId: featOnlyAptitude.id,
      })));

      // Create an aptitude with both feats and powers (shared)
      const sharedAptitude = (await Aptitudes.create(db, {
        name: `Shared Aptitude`,
        description: "Aptitude with both feats and powers",
        rulesetId: ruleset.id,
      }))[0];
      await FeatsAptitudes.createMany(db, feats.map((f) => ({
        featId: f.id,
        aptitudeId: sharedAptitude.id,
      })));
      const powers = await createTestPowers(ruleset.id);
      await PowersAptitudes.createMany(db, powers.map((p) => ({
        powerId: p.id,
        aptitudeId: sharedAptitude.id,
      })));

      const result = await CharacterLevelsMethods.getFeatSlots(
        session,
        character.id,
        klass.id,
        1,
      );

      // The feat-only aptitude should not be shared
      expect(result.aptitudePools[featOnlyAptitude.id].shared).toBe(false);
      // The aptitude with powers should be shared
      expect(result.aptitudePools[sharedAptitude.id].shared).toBe(true);
      // featsToSelect should only count non-shared pools
      const nonSharedAvailable = Object.values(result.aptitudePools)
        .filter((p) => !p.shared)
        .reduce((sum, p) => sum + p.available, 0);
      expect(result.featsToSelect).toBe(nonSharedAvailable);
    });

    test("should mark feat as ineligible when ability requirement is not met", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Low Dex Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 8, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const dodgeResult = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Dodge" }, { limit: 100, page: 1 },
      );

      // Dodge requires Dex >= 13, this character has Dex 8
      const dodge = dodgeResult.items.find((f) => f.name === "Dodge");
      expect(dodge).toBeDefined();
      expect(dodge!.eligible).toBe(false);

      // Improved Initiative has no ability requirement
      const initResult = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Improved Initiative" }, { limit: 100, page: 1 },
      );
      const improvedInit = initResult.items.find((f) => f.name === "Improved Initiative");
      expect(improvedInit).toBeDefined();
      expect(improvedInit!.eligible).toBe(true);
    });

    test("should mark feat as eligible when ability requirement is met", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "High Dex Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Dodge" }, { limit: 100, page: 1 },
      );

      // Dodge requires Dex >= 13, this character has Dex 14
      const dodge = result.items.find((f) => f.name === "Dodge");
      expect(dodge).toBeDefined();
      expect(dodge!.eligible).toBe(true);
    });

    test("should exclude auto-granted feats from available feats", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const feats = await createTestFeats(ruleset.id);

      // Link all feats to the aptitude so they appear in the available pool
      await FeatsAptitudes.createMany(db, feats.map((f) => ({
        featId: f.id,
        aptitudeId: aptitude.id,
      })));

      // Auto-grant Power Attack (non-stackable, free) at klass level 1
      await KlassLevelFeats.create(db, {
        klassLevelId: klassLevels[0].id,
        featId: feats[0].id,
        aptitudeId: aptitude.id,
        free: true,
      });

      const result = await CharacterLevelsMethods.getAvailableFeats(
        session,
        character.id,
        aptitude.id,
        klass.id,
        1,
        {},
        { limit: 100, page: 1 },
      );

      // Power Attack should not be in results (auto-granted and non-stackable)
      const powerAttack = result.items.find((f) => f.name === "Power Attack");
      expect(powerAttack).toBeUndefined();

      // Weapon Focus (stackable) and Dodge should still be available
      const weaponFocus = result.items.find((f) => f.name === "Weapon Focus");
      expect(weaponFocus).toBeDefined();
      const dodge = result.items.find((f) => f.name === "Dodge");
      expect(dodge).toBeDefined();
    });

    test("should exclude non-selectable feats from available feats", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);

      // Create a mix of selectable and non-selectable feats
      const feats = await Feats.createMany(db, [
        { name: "Selectable Feat", description: "Can be picked", rulesetId: ruleset.id, selectable: true },
        { name: "Class Feature", description: "Auto-granted only", rulesetId: ruleset.id, selectable: false },
      ]);

      // Link both feats to the aptitude
      await FeatsAptitudes.createMany(db, feats.map((f) => ({
        featId: f.id,
        aptitudeId: aptitude.id,
      })));

      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, character.id, aptitude.id, klass.id, 1,
        {}, { limit: 100, page: 1 },
      );

      // Non-selectable feat should be excluded
      const classFeature = result.items.find((f) => f.name === "Class Feature");
      expect(classFeature).toBeUndefined();

      // Selectable feat should be present
      const selectableFeat = result.items.find((f) => f.name === "Selectable Feat");
      expect(selectableFeat).toBeDefined();
    });

    test("should exclude non-selectable class features from seed data aptitude pools", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Barbarian", xp: 0,
        alignment: "Chaotic Neutral", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 12, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Query the Barbarian Class Feature aptitude — all feats there are selectable: false
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["Barbarian Class Feature"], ctx.klassMap.pc["Barbarian"], 1,
        {}, { limit: 100, page: 1 },
      );

      // No barbarian class features should appear (all are selectable: false)
      expect(result.items.length).toBe(0);
    });
  });

  describe("getPowerSlots", () => {
    test("should return powers data for leveling up", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);

      const result = await CharacterLevelsMethods.getPowerSlots(
        session,
        character.id,
        klass.id,
        1
      );

      expect(result).toBeDefined();
      expect(result.powersToSelect).toBeGreaterThanOrEqual(0);
      expect(result.autoGrantedPowers).toBeDefined();
      expect(Array.isArray(result.autoGrantedPowers)).toBe(true);
      expect(result.aptitudePools).toBeDefined();
      expect(typeof result.aptitudePools).toBe("object");
    });

    test("should include auto-granted powers from klass level", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const powers = await createTestPowers(ruleset.id);

      // Add an auto-granted power to level 1
      await KlassLevelPowers.create(db, {
        klassLevelId: klassLevels[0].id,
        powerId: powers[0].id,
        aptitudeId: aptitude.id,
      });

      const result = await CharacterLevelsMethods.getPowerSlots(
        session,
        character.id,
        klass.id,
        1
      );

      expect(result.autoGrantedPowers.length).toBe(1);
      expect(result.autoGrantedPowers[0].id).toBe(powers[0].id);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const { klass } = await createTestKlass(ruleset.id, 5);

      await expect(
        CharacterLevelsMethods.getPowerSlots(session, "00000000-0000-0000-0000-000000000000", klass.id, 1)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent klass level", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);

      await expect(
        CharacterLevelsMethods.getPowerSlots(session, character.id, klass.id, 999)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getAvailablePowers", () => {
    test("should return available powers for an aptitude with eligible flag", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const powers = await createTestPowers(ruleset.id);

      // Link powers to the aptitude
      await PowersAptitudes.createMany(db, powers.map((p) => ({
        powerId: p.id,
        aptitudeId: aptitude.id,
      })));

      const result = await CharacterLevelsMethods.getAvailablePowers(
        session,
        character.id,
        aptitude.id,
        klass.id,
        1,
        {},
        { limit: 100, page: 1 },
      );

      expect(result.items.length).toBe(3);
      for (const power of result.items) {
        expect(power.eligible).toBe(true);
      }
    });

    test("should filter out powers already taken", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const powers = await createTestPowers(ruleset.id);

      // Link powers to the aptitude
      await PowersAptitudes.createMany(db, powers.map((p) => ({
        powerId: p.id,
        aptitudeId: aptitude.id,
      })));

      // Add level 1 with Sneak Attack
      const characterLevels = await CharacterLevels.create(db, {
        characterId: character.id,
        klassLevelId: klassLevels[0].id,
        hp: 8,
        abilityId: null,
      });
      const characterLevel = characterLevels[0];

      await CharacterLevelPowers.create(db, {
        characterLevelId: characterLevel.id,
        powerId: powers[0].id,
        aptitudeId: aptitude.id,
      });

      const result = await CharacterLevelsMethods.getAvailablePowers(
        session,
        character.id,
        aptitude.id,
        klass.id,
        2,
        {},
        { limit: 100, page: 1 },
      );

      // Sneak Attack should not be in results (excluded by already-taken filter)
      const sneakAttack = result.items.find((p) => p.name === "Sneak Attack");
      expect(sneakAttack).toBeUndefined();

      // Rage should still be available and eligible
      const rage = result.items.find((p) => p.name === "Rage");
      expect(rage).toBeDefined();
      expect(rage!.eligible).toBe(true);
    });

    test("should exclude auto-granted powers from available powers", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const powers = await createTestPowers(ruleset.id);

      // Link all powers to the aptitude
      await PowersAptitudes.createMany(db, powers.map((p) => ({
        powerId: p.id,
        aptitudeId: aptitude.id,
      })));

      // Auto-grant Sneak Attack at klass level 1
      await KlassLevelPowers.create(db, {
        klassLevelId: klassLevels[0].id,
        powerId: powers[0].id,
        aptitudeId: aptitude.id,
      });

      const result = await CharacterLevelsMethods.getAvailablePowers(
        session,
        character.id,
        aptitude.id,
        klass.id,
        1,
        {},
        { limit: 100, page: 1 },
      );

      // Sneak Attack should not be in results (auto-granted)
      const sneakAttack = result.items.find((p) => p.name === "Sneak Attack");
      expect(sneakAttack).toBeUndefined();

      // Rage and Uncanny Dodge should still be available
      const rage = result.items.find((p) => p.name === "Rage");
      expect(rage).toBeDefined();
      const uncannyDodge = result.items.find((p) => p.name === "Uncanny Dodge");
      expect(uncannyDodge).toBeDefined();
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const { klass } = await createTestKlass(ruleset.id, 5);

      await expect(
        CharacterLevelsMethods.getAvailablePowers(
          session,
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000001",
          klass.id,
          1,
          {},
          { limit: 100, page: 1 },
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("finalizeLevelUp (single-level)", () => {
    test("should create a new character level", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      expect(newLevel).toBeDefined();
      expect(newLevel.characterId).toBe(characterId);
      expect(newLevel.hp).toBe(10);
      expect(newLevel.abilityId).toBeNull();
    });

    test("should create character level with ability increase", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 6000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Fighter L1: 16 SP (2 base + 1 INT + 1 Human) × 4, 1 General + 1 FBF
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      // Fighter L2: 4 SP (2 base + 1 INT + 1 Human), 1 FBF
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
        { [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Handle Animal"]]: 1 },
        { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Dodge"]] },
        {},
      );

      // Fighter L3: 4 SP (2 base + 1 INT + 1 Human), 1 General
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 3, 8, null,
        { [ctx.skillMap["Jump"]]: 1, [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Handle Animal"]]: 1, [ctx.skillMap["Spot"]]: 1 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"]] },
        {},
      );

      // Fighter L4: 4 SP (2 base + 1 INT + 1 Human), 1 FBF + ability increase
      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 4, 8,
        ctx.abilityMap["Strength"],
        { [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Handle Animal"]]: 1, [ctx.skillMap["Spot"]]: 1 },
        { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Combat Reflexes"]] },
        {},
      );

      expect(newLevel.abilityId).toBe(ctx.abilityMap["Strength"]);
    });

    test("should create character level with skills", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Swim"]]: 4, [ctx.skillMap["Jump"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      const characterSkills = await CharacterLevelSkills.findMany(db, {
        characterLevelIds: [newLevel.id],
      });

      expect(characterSkills.length).toBe(4);
      expect(characterSkills.some((cs) => cs.skillId === ctx.skillMap["Climb"] && cs.rank === 4)).toBe(true);
      expect(characterSkills.some((cs) => cs.skillId === ctx.skillMap["Intimidate"] && cs.rank === 4)).toBe(true);
      expect(characterSkills.some((cs) => cs.skillId === ctx.skillMap["Swim"] && cs.rank === 4)).toBe(true);
      expect(characterSkills.some((cs) => cs.skillId === ctx.skillMap["Jump"] && cs.rank === 4)).toBe(true);
    });

    test("should create character level with feats", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      const characterFeats = await CharacterLevelFeats.findMany(db, {
        characterLevelIds: [newLevel.id],
      });

      expect(characterFeats.length).toBe(3);
      expect(characterFeats.some((cf) => cf.featId === ctx.featMap["Power Attack"] && cf.aptitudeId === ctx.aptMap["General"])).toBe(true);
      expect(characterFeats.some((cf) => cf.featId === ctx.featMap["Great Fortitude"] && cf.aptitudeId === ctx.aptMap["General"])).toBe(true);
      expect(characterFeats.some((cf) => cf.featId === ctx.featMap["Improved Initiative"] && cf.aptitudeId === ctx.aptMap["Fighter Bonus Feat"])).toBe(true);
    });

    test("should create character level with powers", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Sorcerer", xp: 0,
        alignment: "Chaotic Good", age: 25, gender: "Male",
        height: "170", weight: "70", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 16 },
        languages: ["Common"],
      });

      // Sorcerer L1: 16 SP (2 base + 1 INT + 1 Human) × 4, 1 General feat, 4 cantrips + 2 L1 spells
      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Sorcerer"], 1, 4, null,
        { [ctx.skillMap["Bluff"]]: 4, [ctx.skillMap["Concentration"]]: 4, [ctx.skillMap["Spellcraft"]]: 4, [ctx.skillMap["Use Magic Device"]]: 4 },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Sorcerer Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Light"],
            ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"],
          ],
        },
      );

      const characterPowers = await CharacterLevelPowers.findMany(db, {
        characterLevelIds: [newLevel.id],
      });

      expect(characterPowers.length).toBe(6);
      expect(characterPowers.some((cp) => cp.powerId === ctx.powerMap["Magic Missile"])).toBe(true);
      expect(characterPowers.some((cp) => cp.powerId === ctx.powerMap["Detect Magic"])).toBe(true);
    });

    test("should create character level with skills, feats, and powers together", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Sorcerer", xp: 0,
        alignment: "Chaotic Good", age: 25, gender: "Male",
        height: "170", weight: "70", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 16 },
        languages: ["Common"],
      });

      // Sorcerer L1: 16 SP (2 base + 1 INT + 1 Human) × 4, 1 General feat, 4 cantrips + 2 L1 spells
      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Sorcerer"], 1, 4, null,
        { [ctx.skillMap["Bluff"]]: 4, [ctx.skillMap["Concentration"]]: 4, [ctx.skillMap["Spellcraft"]]: 4, [ctx.skillMap["Use Magic Device"]]: 4 },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Sorcerer Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Light"],
            ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"],
          ],
        },
      );

      const characterSkills = await CharacterLevelSkills.findMany(db, { characterLevelIds: [newLevel.id] });
      const characterFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: [newLevel.id] });
      const characterPowers = await CharacterLevelPowers.findMany(db, { characterLevelIds: [newLevel.id] });

      expect(characterSkills.length).toBe(4);
      expect(characterFeats.length).toBe(3);
      expect(characterPowers.length).toBe(6);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const { klass } = await createTestKlass(ruleset.id, 5);
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        addOneLevel(session, fakeCharacterId, klass.id, 1, 8, null, {}, {}, {})
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent klass level", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass } = await createTestKlass(ruleset.id, 5);

      await expect(
        addOneLevel(session, character.id, klass.id, 999, 8, null, {}, {}, {})
      ).rejects.toThrow(NotFoundError);
    });

    test("should reject abilityId at a non-increase level", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Level 1 is not an ability increase level — submitting abilityId should fail
      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 1, 10,
          ctx.abilityMap["Strength"],
          { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 1 },
          { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
          {},
        ),
      ).rejects.toThrow("Ability increase is not available at this level");
    });

    test("should reject missing abilityId at an increase level", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 6000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Add levels 1-3
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
        { [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Handle Animal"]]: 1 },
        { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Dodge"]] },
        {},
      );
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 3, 8, null,
        { [ctx.skillMap["Jump"]]: 1, [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Handle Animal"]]: 1, [ctx.skillMap["Spot"]]: 1 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"]] },
        {},
      );

      // Level 4 IS an ability increase level — submitting null abilityId should fail
      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 4, 8, null,
          { [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Handle Animal"]]: 1 },
          { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Combat Reflexes"]] },
          {},
        ),
      ).rejects.toThrow("Ability increase is required at this level");
    });

    test("should reject HP exceeding class hit die", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Fighter has d10 HD — submitting hp: 11 should fail
      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 1, 11, null,
          { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 1 },
          { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
          {},
        ),
      ).rejects.toThrow("HP must be between 1 and 10");
    });

    test("should reject feat not linked to submitted aptitude", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Great Fortitude is linked to General only — submitting it under Fighter Bonus Feat should fail
      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
          { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 1 },
          { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Great Fortitude"]], [ctx.aptMap["General"]]: [ctx.featMap["Improved Initiative"]] },
          {},
        ),
      ).rejects.toThrow("Feat is not linked to the specified aptitude");
    });

    test("should reject non-stackable feat already on character", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Level 1: take Power Attack (non-stackable) as General feat
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      // Level 2: try to take Power Attack again — should fail
      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
          { [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1 },
          { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Power Attack"]] },
          {},
        ),
      ).rejects.toThrow('Non-stackable feat "Power Attack" is already on this character');
    });

    test("should reject power not linked to submitted aptitude", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Sorcerer", xp: 0,
        alignment: "Chaotic Good", age: 25, gender: "Male",
        height: "170", weight: "70", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 16 },
        languages: ["Common"],
      });

      // Magic Missile is linked to Sorcerer Spells — submitting it under General should fail
      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Sorcerer"], 1, 4, null,
          { [ctx.skillMap["Bluff"]]: 4, [ctx.skillMap["Concentration"]]: 4, [ctx.skillMap["Spellcraft"]]: 1 },
          { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"]] },
          { [ctx.aptMap["General"]]: [ctx.powerMap["Magic Missile"]] },
        ),
      ).rejects.toThrow("Power is not linked to the specified aptitude");
    });

    test("should reject re-finalizing an already-existing level", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 1, 6, null,
          { [ctx.skillMap["Swim"]]: 4, [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Handle Animal"]]: 1 },
          { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Blind-Fight"]] },
          {},
        ),
      ).rejects.toThrow("This level has already been finalized");
    });

    test("should reject picking a non-stackable auto-granted feat", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);
      const { klass, klassLevels } = await createTestKlass(ruleset.id, 5);
      await createGeneralAptitude(ruleset.id);
      const aptitude = await createTestAptitude(ruleset.id);
      const feats = await createTestFeats(ruleset.id);

      // Link Power Attack to the aptitude
      await FeatsAptitudes.createMany(db, [
        { featId: feats[0].id, aptitudeId: aptitude.id },
      ]);

      // Auto-grant Power Attack (non-stackable, free) at klass level 1
      await KlassLevelFeats.create(db, {
        klassLevelId: klassLevels[0].id,
        featId: feats[0].id,
        aptitudeId: aptitude.id,
        free: true,
      });

      // Trying to also pick Power Attack during finalize should fail
      await expect(
        addOneLevel(
          session, character.id, klass.id, 1, 8, null,
          {},
          { [aptitude.id]: [feats[0].id] },
          {},
        ),
      ).rejects.toThrow('Non-stackable feat "Power Attack" is already on this character');
    });

    test("should reject HP below 1", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 1, 0, null,
          { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 1 },
          { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
          {},
        ),
      ).rejects.toThrow("HP must be between 1 and 10");
    });

    test("should reject HP above hit die", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 1, 11, null,
          { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 1 },
          { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
          {},
        ),
      ).rejects.toThrow("HP must be between 1 and 10");
    });

    test("should reject finalize when validation fails and force is false", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Low Dex Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 8, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Dodge requires Dex >= 13, character has Dex 8 — should fail validation
      await expect(
        addOneLevel(
          session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
          { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
          { [ctx.aptMap["General"]]: [ctx.featMap["Dodge"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
          {},
          false,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    test("should succeed with force when validation would otherwise fail", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Low Dex Fighter Force", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 8, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Same scenario — Dodge requires Dex >= 13, but force: true should bypass
      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Dodge"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
        true,
      );

      expect(newLevel).toBeDefined();
      expect(newLevel.id).toBeTruthy();

      // Verify the level and feats were actually saved
      const levels = await CharacterLevels.findMany(db, { characterId });
      expect(levels.length).toBe(1);

      const characterFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: [newLevel.id] });
      const dodgeFeat = characterFeats.find((f) => f.featId === ctx.featMap["Dodge"]);
      expect(dodgeFeat).toBeDefined();
    });
  });

  describe("removeLevel", () => {
    test("should remove the last level from character", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Add two levels
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
        { [ctx.skillMap["Swim"]]: 1, [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Handle Animal"]]: 1 },
        { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Dodge"]] },
        {},
      );

      // Verify we have 2 levels
      let levels = await CharacterLevels.findMany(db, { characterId });
      expect(levels.length).toBe(2);

      // Remove last level
      const result = await CharacterLevelsMethods.removeLevel(session, characterId);
      expect(result.success).toBe(true);

      // Verify we now have 1 level
      levels = await CharacterLevels.findMany(db, { characterId });
      expect(levels.length).toBe(1);
    });

    test("should remove level with associated skills and feats", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const newLevel = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      // Verify skills and feats exist
      let characterSkills = await CharacterLevelSkills.findMany(db, { characterLevelIds: [newLevel.id] });
      let characterFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: [newLevel.id] });
      expect(characterSkills.length).toBe(4);
      expect(characterFeats.length).toBe(3);

      // Remove the level
      await CharacterLevelsMethods.removeLevel(session, characterId);

      // Verify skills and feats were deleted
      characterSkills = await CharacterLevelSkills.findMany(db, { characterLevelIds: [newLevel.id] });
      characterFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: [newLevel.id] });
      expect(characterSkills.length).toBe(0);
      expect(characterFeats.length).toBe(0);
    });

    test("should remove the most recently added level in multiclass scenario", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Multiclass", xp: 3000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Fighter L2 (klass level = 2, higher) — added first
      const fighterKlassLevel = await KlassLevels.findOneByKlassAndLevel(db, {
        klassId: ctx.klassMap.pc["Fighter"], level: 2,
      });
      const [fighterLevel] = await CharacterLevels.create(db, {
        characterId,
        klassLevelId: fighterKlassLevel!.id,
        hp: 10,
        abilityId: null,
        createdAt: "2020-01-01T00:00:00.000Z",
      });

      // Rogue L1 (klass level = 1, lower, but added LAST)
      const rogueKlassLevel = await KlassLevels.findOneByKlassAndLevel(db, {
        klassId: ctx.klassMap.pc["Rogue"], level: 1,
      });
      await CharacterLevels.create(db, {
        characterId,
        klassLevelId: rogueKlassLevel!.id,
        hp: 6,
        abilityId: null,
        createdAt: "2020-01-02T00:00:00.000Z",
      });

      // Remove should take Rogue L1 (last added by createdAt), not Fighter L2 (higher klass level)
      await CharacterLevelsMethods.removeLevel(session, characterId);

      const remaining = await CharacterLevels.findMany(db, { characterId });
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(fighterLevel.id);
    });

    test("should throw NotFoundError when character has no levels", async () => {
      const { user, session } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);

      await expect(
        CharacterLevelsMethods.removeLevel(session, character.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();
      const fakeCharacterId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CharacterLevelsMethods.removeLevel(session, fakeCharacterId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when character belongs to different user", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const ruleset = await createTestRuleset(user.id);
      const race = await createTestRace(ruleset.id);
      const character = await createTestCharacter(user.id, ruleset.id, race.id);

      await expect(
        CharacterLevelsMethods.removeLevel(otherSession, character.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("COW fork", () => {
    async function createCowFork(parentUserId: string, childUserId: string) {
      const parentRuleset = await createTestRuleset(parentUserId);
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      const uniqueId = Math.random().toString(36).substr(2, 9);
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${uniqueId}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childUserId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      return { parentRuleset, childRuleset };
    }

    test("getAvailableKlasses should return inherited parent klasses", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      // Fork the real D&D 3.5 ruleset
      const childRulesets = await Rulesets.create(db, {
        name: "COW Fork Available Klasses Test",
        description: "COW fork of D&D 3.5",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: SEED_USER_ID,
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const childRuleset = childRulesets[0];

      const characters = await Characters.create(db, {
        userId: SEED_USER_ID,
        rulesetId: childRuleset.id,
        raceId: ctx.raceMap.pc["Human"],
        name: "COW Test Fighter",
        alignment: "Neutral Good",
        xp: 0, age: 25, gender: "Male", height: "180", weight: "80",
      });
      const character = characters[0];

      await db.insert(characterAbilitiesInCharacter).values(
        Object.entries({ Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 })
          .map(([name, score]) => ({
            characterId: character.id,
            abilityId: ctx.abilityMap[name],
            score,
          })),
      );
      await db.insert(languagesInCharacter).values({
        characterId: character.id,
        languageId: ctx.langMap["Common"],
      });

      const result = await CharacterLevelsMethods.getAvailableKlasses(session, character.id, {}, { limit: 100, page: 1 });

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.some((k) => k.id === ctx.klassMap.pc["Fighter"])).toBe(true);
    });

    test("getSkillSlots should mark Cleric class skills as isCurrentClassSkill on SRD fork", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      // Fork the real D&D 3.5 ruleset
      const childRulesets = await Rulesets.create(db, {
        name: "COW Fork Cleric Skills Test",
        description: "COW fork of D&D 3.5",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: SEED_USER_ID,
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const childRuleset = childRulesets[0];

      const characters = await Characters.create(db, {
        userId: SEED_USER_ID,
        rulesetId: childRuleset.id,
        raceId: ctx.raceMap.pc["Human"],
        name: "COW Test Cleric",
        alignment: "Neutral Good",
        xp: 0, age: 25, gender: "Male", height: "180", weight: "80",
      });
      const character = characters[0];

      await db.insert(characterAbilitiesInCharacter).values(
        Object.entries({ Strength: 10, Dexterity: 10, Constitution: 12, Intelligence: 10, Wisdom: 16, Charisma: 14 })
          .map(([name, score]) => ({
            characterId: character.id,
            abilityId: ctx.abilityMap[name],
            score,
          })),
      );
      await db.insert(languagesInCharacter).values({
        characterId: character.id,
        languageId: ctx.langMap["Common"],
      });

      const clericId = ctx.klassMap.pc["Cleric"];
      const result = await CharacterLevelsMethods.getSkillSlots(session, character.id, clericId, 1);

      const heal = result.skills.find((s) => s.name === "Heal");
      const diplomacy = result.skills.find((s) => s.name === "Diplomacy");
      const hide = result.skills.find((s) => s.name === "Hide");

      // Heal and Diplomacy are Cleric class skills — must show as current class skill
      expect(heal?.isClassSkill).toBe(true);
      expect(heal?.isCurrentClassSkill).toBe(true);
      expect(diplomacy?.isClassSkill).toBe(true);
      expect(diplomacy?.isCurrentClassSkill).toBe(true);

      // Hide is NOT a Cleric class skill
      expect(hide?.isClassSkill).toBe(false);
      expect(hide?.isCurrentClassSkill).toBe(false);
    });

    test("getSkillSlots should return inherited parent skills", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { parentRuleset, childRuleset } = await createCowFork(parentUser.id, user.id);

      const parentRace = await createTestRace(parentRuleset.id);
      const { klass } = await createTestKlass(parentRuleset.id, 5);
      await createGeneralAptitude(parentRuleset.id);
      await createTestSkills(parentRuleset.id);
      const character = await createTestCharacter(user.id, childRuleset.id, parentRace.id);

      const result = await CharacterLevelsMethods.getSkillSlots(session, character.id, klass.id, 1);

      expect(result.skills.length).toBe(3);
      expect(result.skills.some((s) => s.name === "Diplomacy")).toBe(true);
    });

    test("getSkillSlots should mark subtypes as isCurrentClassSkill when parent is a class skill", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { parentRuleset, childRuleset } = await createCowFork(parentUser.id, user.id);

      const parentRace = await createTestRace(parentRuleset.id);
      const { klass } = await createTestKlass(parentRuleset.id, 5);
      await createGeneralAptitude(parentRuleset.id);
      await createTestSkills(parentRuleset.id);

      // Add a parent "Craft" skill and a subtype "Craft (Alchemy)"
      const abilities = await Abilities.findAll((pagination) =>
        Abilities.findManyByRulesetId(db, { rulesetId: parentRuleset.id }, pagination),
      );
      const intAbility = abilities.find((a) => a.name === "Intelligence")!;
      const [craftParent] = await Skills.createMany(db, [{
        name: "Craft", description: "Parent craft skill", rulesetId: parentRuleset.id, primaryAbilityId: intAbility.id,
      }]);
      await Skills.createMany(db, [{
        name: "Craft (Alchemy)", description: "Craft alchemy subtype", rulesetId: parentRuleset.id, primaryAbilityId: intAbility.id,
      }]);

      // Link only the parent "Craft" as a class skill
      await KlassSkills.create(db, { klassId: klass.id, skillId: craftParent.id });

      const character = await createTestCharacter(user.id, childRuleset.id, parentRace.id);

      const result = await CharacterLevelsMethods.getSkillSlots(session, character.id, klass.id, 1);

      const craftParentSkill = result.skills.find((s) => s.name === "Craft")!;
      const craftAlchemySkill = result.skills.find((s) => s.name === "Craft (Alchemy)")!;
      const stealthSkill = result.skills.find((s) => s.name === "Stealth")!;

      // Parent "Craft" is directly a class skill
      expect(craftParentSkill.isClassSkill).toBe(true);
      expect(craftParentSkill.isCurrentClassSkill).toBe(true);

      // Subtype "Craft (Alchemy)" should also be treated as a class skill
      expect(craftAlchemySkill.isClassSkill).toBe(true);
      expect(craftAlchemySkill.isCurrentClassSkill).toBe(true);

      // Stealth should NOT be a class skill
      expect(stealthSkill.isClassSkill).toBe(false);
      expect(stealthSkill.isCurrentClassSkill).toBe(false);
    });

    test("getAvailableFeats should return inherited parent feats with eligible flag", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { parentRuleset, childRuleset } = await createCowFork(parentUser.id, user.id);

      const parentRace = await createTestRace(parentRuleset.id);
      const { klass } = await createTestKlass(parentRuleset.id, 5);
      await createGeneralAptitude(parentRuleset.id);
      const aptitude = await createTestAptitude(parentRuleset.id);
      const feats = await createTestFeats(parentRuleset.id);
      await FeatsAptitudes.createMany(db, feats.map((f) => ({
        featId: f.id,
        aptitudeId: aptitude.id,
      })));
      const character = await createTestCharacter(user.id, childRuleset.id, parentRace.id);

      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, character.id, aptitude.id, klass.id, 1,
        {}, { limit: 100, page: 1 },
      );

      expect(result.items.length).toBe(3);
      for (const feat of result.items) {
        expect(feat.eligible).toBe(true);
      }
    });

    test("getAvailablePowers should return inherited parent powers with eligible flag", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { parentRuleset, childRuleset } = await createCowFork(parentUser.id, user.id);

      const parentRace = await createTestRace(parentRuleset.id);
      const { klass } = await createTestKlass(parentRuleset.id, 5);
      await createGeneralAptitude(parentRuleset.id);
      const aptitude = await createTestAptitude(parentRuleset.id);
      const powers = await createTestPowers(parentRuleset.id);
      await PowersAptitudes.createMany(db, powers.map((p) => ({
        powerId: p.id,
        aptitudeId: aptitude.id,
      })));
      const character = await createTestCharacter(user.id, childRuleset.id, parentRace.id);

      const result = await CharacterLevelsMethods.getAvailablePowers(
        session, character.id, aptitude.id, klass.id, 1, {},
        { limit: 100, page: 1 },
      );

      expect(result.items.length).toBe(3);
      for (const power of result.items) {
        expect(power.eligible).toBe(true);
      }
    });

    test("addOneLevel should work with inherited parent entities", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      // Fork the real D&D 3.5 ruleset
      const childRulesets = await Rulesets.create(db, {
        name: "COW Fork Test",
        description: "COW fork of D&D 3.5",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: SEED_USER_ID,
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const childRuleset = childRulesets[0];

      // Create character in the forked ruleset using inherited parent entities
      const characters = await Characters.create(db, {
        userId: SEED_USER_ID,
        rulesetId: childRuleset.id,
        raceId: ctx.raceMap.pc["Human"],
        name: "COW Test Fighter",
        alignment: "Neutral Good",
        xp: 0,
        age: 25,
        gender: "Male",
        height: "180",
        weight: "80",
      });
      const character = characters[0];

      await db.insert(characterAbilitiesInCharacter).values(
        Object.entries({ Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 })
          .map(([name, score]) => ({
            characterId: character.id,
            abilityId: ctx.abilityMap[name],
            score,
          })),
      );
      await db.insert(languagesInCharacter).values({
        characterId: character.id,
        languageId: ctx.langMap["Common"],
      });

      // Skill point ability (INT) is inherited from the parent ruleset via the source
      // chain, so INT bonus applies: (2+1+1)*4 = 16 — Fighter base 2 + INT mod +1 + Human racial +1, ×4 at level 1
      const newLevel = await addOneLevel(
        session, character.id, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Cleave"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      expect(newLevel).toBeDefined();
      expect(newLevel.characterId).toBe(character.id);
    });

    test("getAvailablePowers still excludes prohibited school after the feat is COW'd", async () => {
      // Regression for getExcludedPowerIds reading pre-COW character_level_feats
      // IDs and hitting the post-COW composed cache without override resolution.
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      const childRulesets = await Rulesets.create(db, {
        name: "COW Fork Wizard Prohibit Test",
        description: "COW fork of D&D 3.5",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: SEED_USER_ID,
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const childRuleset = childRulesets[0];

      const characters = await Characters.create(db, {
        userId: SEED_USER_ID,
        rulesetId: childRuleset.id,
        raceId: ctx.raceMap.pc["Elf"],
        name: "COW Prohibit Wizard",
        alignment: "Neutral Good",
        xp: 3000, age: 130, gender: "Female", height: "170", weight: "48",
      });
      const character = characters[0];

      await db.insert(characterAbilitiesInCharacter).values(
        Object.entries({ Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 })
          .map(([name, score]) => ({
            characterId: character.id,
            abilityId: ctx.abilityMap[name],
            score,
          })),
      );
      await db.insert(languagesInCharacter).values([
        { characterId: character.id, languageId: ctx.langMap["Common"] },
        { characterId: character.id, languageId: ctx.langMap["Elven"] },
      ]);

      // Finalize L1 with Evocation Specialist + Prohibit Illusion + Prohibit Necromancy.
      // The level rows store the base ruleset's (pre-COW) feat IDs.
      const skillData = await CharacterLevelsMethods.getSkillSlots(session, character.id, ctx.klassMap.pc["Wizard"], 1);
      const skillAlloc: Record<string, number> = {};
      let remaining = skillData.skillPointsToSpend;
      for (const skillName of ["Spellcraft", "Concentration", "Knowledge (Arcana)", "Knowledge (Religion)", "Knowledge (The Planes)", "Decipher Script"]) {
        const alloc = Math.min(remaining, 4);
        if (alloc > 0) skillAlloc[ctx.skillMap[skillName]] = alloc;
        remaining -= alloc;
        if (remaining <= 0) break;
      }
      await addOneLevel(
        session, character.id, ctx.klassMap.pc["Wizard"], 1, 4, null,
        skillAlloc,
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Combat Casting"]],
          [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Evocation Specialist"]],
          [ctx.aptMap["Prohibited School"]]: [ctx.featMap["Prohibit Illusion"], ctx.featMap["Prohibit Necromancy"]],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Wizard Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Light"], ctx.powerMap["Read Magic"],
            ctx.powerMap["Mage Hand"], ctx.powerMap["Prestidigitation"], ctx.powerMap["Resistance"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Mage Armor"], ctx.powerMap["Shield"],
          ],
        },
      );

      // Now COW the Prohibit Illusion feat on the fork. After this call the
      // composed cache for the fork is keyed by the new (post-COW) feat id,
      // but character_level_feats.feat_id still holds the pre-COW id.
      await FeatsMethods.updateRulesetFeat(
        session, childRuleset.id, ctx.featMap["Prohibit Illusion"],
        { name: "Prohibit Illusion", description: "COW'd during regression test" },
      );

      // Fetch available L2 spells. The wizard should still be blocked from
      // Illusion and Necromancy — if getExcludedPowerIds doesn't resolve the
      // stored feat id through overrideMap, the prohibited-school property
      // lookup misses and Illusion spells leak through.
      const result = await CharacterLevelsMethods.getAvailablePowers(
        session, character.id, ctx.aptMap["Wizard Spells"], ctx.klassMap.pc["Wizard"], 2,
        {}, { limit: 500, page: 1 },
      );
      const spellNames = result.items.map((p) => p.name);

      expect(spellNames).not.toContain("Silent Image");      // Illusion — blocked by COW'd feat
      expect(spellNames).not.toContain("Ray of Enfeeblement"); // Necromancy — still blocked by non-COW'd feat
      expect(spellNames).toContain("Burning Hands");          // Evocation — allowed (specialist school)
    });

    test("addOneLevel should reject klass from unrelated ruleset", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { parentRuleset, childRuleset } = await createCowFork(parentUser.id, user.id);

      const parentRace = await createTestRace(parentRuleset.id);
      const character = await createTestCharacter(user.id, childRuleset.id, parentRace.id);

      // Create klass in an unrelated ruleset
      const unrelatedRuleset = await createTestRuleset(user.id);
      const { klass: unrelatedKlass } = await createTestKlass(unrelatedRuleset.id, 5);

      await expect(
        addOneLevel(
          session, character.id, unrelatedKlass.id, 1, 8, null, {}, {}, {},
        ),
      ).rejects.toThrow(BadRequestError);
    });

    test("addOneLevel should reject feats from unrelated ruleset", async () => {
      const { user, session } = await createTestUser();
      const { user: parentUser } = await createTestUser();
      const { parentRuleset, childRuleset } = await createCowFork(parentUser.id, user.id);

      const parentRace = await createTestRace(parentRuleset.id);
      const { klass } = await createTestKlass(parentRuleset.id, 5);
      const aptitude = await createTestAptitude(parentRuleset.id);
      const character = await createTestCharacter(user.id, childRuleset.id, parentRace.id);

      // Create feat in unrelated ruleset
      const unrelatedRuleset = await createTestRuleset(user.id);
      const unrelatedFeats = await createTestFeats(unrelatedRuleset.id);

      await expect(
        addOneLevel(
          session, character.id, klass.id, 1, 8, null, {},
          { [aptitude.id]: [unrelatedFeats[0].id] }, {},
        ),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("wizard specialization", () => {
    test("getFeatSlots should include Wizard Specialization pool at wizard level 1", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Test Wizard", xp: 0,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      const result = await CharacterLevelsMethods.getFeatSlots(
        session, characterId, ctx.klassMap.pc["Wizard"], 1,
      );

      const specPool = Object.values(result.aptitudePools).find((p) => p.name === "Wizard Specialization");
      expect(specPool).toBeDefined();
      expect(specPool!.available).toBe(1);

      // Prohibited School should NOT have available slots yet (no specialist chosen)
      const prohibPool = Object.values(result.aptitudePools).find((p) => p.name === "Prohibited School");
      expect(!prohibPool || prohibPool.available === 0).toBe(true);
    });

    test("getAvailableFeats should return specialist feats with aptitudeModifiers for Wizard Specialization", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Test Wizard", xp: 0,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      const specAptId = ctx.aptMap["Wizard Specialization"];
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, specAptId, ctx.klassMap.pc["Wizard"], 1,
        {}, { limit: 100, page: 1 },
      );

      // Should include specialist feats and Generalist
      const evocation = result.items.find((f) => f.name === "Evocation Specialist");
      const generalist = result.items.find((f) => f.name === "Generalist");
      const divination = result.items.find((f) => f.name === "Divination Specialist");
      expect(evocation).toBeDefined();
      expect(generalist).toBeDefined();
      expect(divination).toBeDefined();

      // Evocation Specialist should have aptitudeModifier adding 2 to Prohibited School
      const prohibAptId = ctx.aptMap["Prohibited School"];
      const evocMods = evocation!.aptitudeModifiers;
      expect(evocMods.length).toBeGreaterThanOrEqual(1);
      const prohibMod = evocMods.find((m) => m.aptitudeId === prohibAptId);
      expect(prohibMod).toBeDefined();
      expect(prohibMod!.value).toBe(2);
      expect(prohibMod!.operator).toBe("add");

      // Divination Specialist should add 1 (not 2)
      const divMods = divination!.aptitudeModifiers;
      const divProhibMod = divMods.find((m) => m.aptitudeId === prohibAptId);
      expect(divProhibMod).toBeDefined();
      expect(divProhibMod!.value).toBe(1);

      // Generalist should have no aptitudeModifiers for Prohibited School
      const genMods = generalist!.aptitudeModifiers;
      const genProhibMod = genMods.find((m) => m.aptitudeId === prohibAptId);
      expect(genProhibMod).toBeUndefined();
    });

    test("getAvailablePowers should exclude powers from prohibited schools", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Test Wizard", xp: 0,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      const wizardSpellsAptId = ctx.aptMap["Wizard Spells"];

      // Without excludeSchools: should include Illusion spells
      const resultAll = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 1,
        {}, { limit: 500, page: 1 },
      );
      const allSpellNames = resultAll.items.map((p) => p.name);

      // With excludeSchools: Illusion spells should be filtered out
      const resultFiltered = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 1,
        { excludeSchools: ["Illusion"] }, { limit: 500, page: 1 },
      );
      const filteredSpellNames = resultFiltered.items.map((p) => p.name);

      // Should have fewer spells when filtering
      expect(filteredSpellNames.length).toBeLessThan(allSpellNames.length);

      // Verify a known Illusion spell is excluded (Silent Image is Illusion)
      expect(allSpellNames).toContain("Silent Image");
      expect(filteredSpellNames).not.toContain("Silent Image");

      // Verify a non-Illusion spell is still present (Magic Missile is Evocation)
      expect(filteredSpellNames).toContain("Magic Missile");
    });

    test("getAvailablePowers should exclude prohibited schools from committed feats", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Test Wizard", xp: 3000,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      // First check available skill points to size our allocation correctly
      const skillData = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, ctx.klassMap.pc["Wizard"], 1,
      );
      const skillPoints = skillData.skillPointsToSpend;
      // Max rank at level 1 is 4 (1+3), spread across enough skills to use all points
      const maxRank = 4;
      const skillIds = [
        ctx.skillMap["Spellcraft"], ctx.skillMap["Concentration"],
        ctx.skillMap["Knowledge (Arcana)"], ctx.skillMap["Knowledge (Religion)"],
        ctx.skillMap["Knowledge (The Planes)"], ctx.skillMap["Decipher Script"],
      ];
      const skillAlloc: Record<string, number> = {};
      let remaining = skillPoints;
      for (const id of skillIds) {
        const alloc = Math.min(remaining, maxRank);
        if (alloc > 0) skillAlloc[id] = alloc;
        remaining -= alloc;
        if (remaining <= 0) break;
      }

      // Finalize Wizard level 1 with Evocation Specialist + Prohibit Illusion + Prohibit Necromancy
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
        skillAlloc,
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Combat Casting"]],
          [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Evocation Specialist"]],
          [ctx.aptMap["Prohibited School"]]: [ctx.featMap["Prohibit Illusion"], ctx.featMap["Prohibit Necromancy"]],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Wizard Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Light"], ctx.powerMap["Read Magic"],
            ctx.powerMap["Mage Hand"], ctx.powerMap["Prestidigitation"], ctx.powerMap["Resistance"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Mage Armor"], ctx.powerMap["Shield"],
          ],
        },
      );

      // Now at level 2, Illusion and Necromancy spells should be auto-excluded
      const wizardSpellsAptId = ctx.aptMap["Wizard Spells"];
      const result = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 2,
        {}, { limit: 500, page: 1 },
      );
      const spellNames = result.items.map((p) => p.name);

      // Illusion and Necromancy spells should be excluded
      expect(spellNames).not.toContain("Silent Image");     // Illusion
      expect(spellNames).not.toContain("Ray of Enfeeblement"); // Necromancy

      // Evocation and other school spells should be present
      expect(spellNames).toContain("Burning Hands");  // Evocation
      expect(spellNames).toContain("Charm Person");    // Enchantment
    });

    test("addOneLevel should work with wizard specialization feats", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Test Wizard Finalize", xp: 0,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      // Check available skill points to size allocation
      const skillData = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, ctx.klassMap.pc["Wizard"], 1,
      );
      const skillPoints = skillData.skillPointsToSpend;
      // Max rank at level 1 is 4 (1+3), spread across enough skills
      const maxRank = 4;
      const skillIds = [
        ctx.skillMap["Spellcraft"], ctx.skillMap["Concentration"],
        ctx.skillMap["Knowledge (Arcana)"], ctx.skillMap["Knowledge (Religion)"],
        ctx.skillMap["Knowledge (The Planes)"], ctx.skillMap["Decipher Script"],
      ];
      const skillAlloc: Record<string, number> = {};
      let remaining = skillPoints;
      for (const id of skillIds) {
        const alloc = Math.min(remaining, maxRank);
        if (alloc > 0) skillAlloc[id] = alloc;
        remaining -= alloc;
        if (remaining <= 0) break;
      }

      // Should succeed with specialist + prohibited schools + general feat
      const result = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
        skillAlloc,
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Combat Casting"]],
          [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Evocation Specialist"]],
          [ctx.aptMap["Prohibited School"]]: [ctx.featMap["Prohibit Illusion"], ctx.featMap["Prohibit Necromancy"]],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Wizard Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Light"], ctx.powerMap["Read Magic"],
            ctx.powerMap["Mage Hand"], ctx.powerMap["Prestidigitation"], ctx.powerMap["Resistance"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Mage Armor"], ctx.powerMap["Shield"],
          ],
        },
      );

      expect(result).toBeDefined();

      // Verify the feats were committed
      const characterLevels = await CharacterLevels.findMany(db, { characterId });
      expect(characterLevels.length).toBe(1);
      const levelFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: [characterLevels[0].id] });

      const committedFeatIds = levelFeats.map((f) => f.featId);
      expect(committedFeatIds).toContain(ctx.featMap["Combat Casting"]);
      expect(committedFeatIds).toContain(ctx.featMap["Evocation Specialist"]);
      expect(committedFeatIds).toContain(ctx.featMap["Prohibit Illusion"]);
      expect(committedFeatIds).toContain(ctx.featMap["Prohibit Necromancy"]);
    });
  });

  describe("spell eligibility without stored requirements", () => {
    test("all spells in a class spell pool should be eligible (aptitude gating is sufficient)", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Sorcerer", xp: 0,
        alignment: "Chaotic Good", age: 25, gender: "Male",
        height: "170", weight: "70", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 16 },
        languages: ["Common"],
      });

      const result = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, ctx.aptMap["Sorcerer Spells"], ctx.klassMap.pc["Sorcerer"], 1,
        { powerLevel: 0 }, { limit: 500, page: 1 },
      );

      expect(result.items.length).toBeGreaterThan(0);
      for (const spell of result.items) {
        expect(spell.eligible).toBe(true);
      }
    });

    test("cross-extension spells should be eligible when accessed through class aptitude", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);

      // Wizard Spells aptitude includes spells from SRD + extensions (COW'd).
      // Before this fix, COW'd spells had incomplete class-level requirements
      // (e.g. only "Cleric >= 1" but not "Wizard >= 1") causing eligible: false.
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Test Wizard", xp: 0,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      // Level 1 spells — these include COW'd spells from extensions
      const result = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, ctx.aptMap["Wizard Spells"], ctx.klassMap.pc["Wizard"], 1,
        { powerLevel: 1 }, { limit: 500, page: 1 },
      );

      expect(result.items.length).toBeGreaterThan(0);
      const ineligible = result.items.filter((s) => !s.eligible);
      expect(ineligible).toEqual([]);
    });
  });

  describe("war domain weapon", () => {
    test("War Domain feat should have aptitudeModifier for War Domain Weapon pool", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Cleric", xp: 0,
        alignment: "Neutral Good", age: 30, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 16, Charisma: 12 },
        languages: ["Common"],
      });

      const domainAptId = ctx.aptMap["Cleric Domain"];
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, domainAptId, ctx.klassMap.pc["Cleric"], 1,
        {}, { limit: 100, page: 1 },
      );

      const warDomain = result.items.find((f) => f.name === "War Domain");
      expect(warDomain).toBeDefined();

      const warWeaponAptId = ctx.aptMap["War Domain Weapon"];
      expect(warWeaponAptId).toBeDefined();

      const aptMod = warDomain!.aptitudeModifiers.find((m) => m.aptitudeId === warWeaponAptId);
      expect(aptMod).toBeDefined();
      expect(aptMod!.value).toBe(1);
      expect(aptMod!.operator).toBe("add");
    });

    test("War Domain Weapon feats should be available with no requirements (all eligible)", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Cleric", xp: 0,
        alignment: "Neutral Good", age: 30, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 16, Charisma: 12 },
        languages: ["Common"],
      });

      const warWeaponAptId = ctx.aptMap["War Domain Weapon"];
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, warWeaponAptId, ctx.klassMap.pc["Cleric"], 1,
        {}, { limit: 100, page: 1 },
      );

      // Should have 30 War Domain Weapon feats (one per martial weapon)
      expect(result.items.length).toBe(30);

      // All should be eligible (no requirements)
      for (const feat of result.items) {
        expect(feat.name).toMatch(/^War Domain Weapon: /);
        expect(feat.eligible).toBe(true);
      }

      // Verify specific weapons are present
      const longsword = result.items.find((f) => f.name === "War Domain Weapon: Longsword");
      const greataxe = result.items.find((f) => f.name === "War Domain Weapon: Greataxe");
      expect(longsword).toBeDefined();
      expect(greataxe).toBeDefined();
    });

    test("Weapon Focus: X should be excluded when War Domain Weapon: X virtually grants it", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test War Cleric", xp: 1000,
        alignment: "Neutral Good", age: 30, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
        languages: ["Common"],
      });

      // Fighter L1: BAB 1 + Martial Weapon Proficiency (auto-granted)
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      // Cleric L1 (character level 2, ×1): 4 SP (2 base + 1 INT + 1 Human). War Domain + Good Domain, pick War Domain Weapon: Longsword
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Cleric"], 1, 8, null,
        { [ctx.skillMap["Concentration"]]: 1, [ctx.skillMap["Heal"]]: 1, [ctx.skillMap["Spellcraft"]]: 1, [ctx.skillMap["Diplomacy"]]: 1 },
        {
          [ctx.aptMap["Cleric Domain"]]: [ctx.featMap["War Domain"], ctx.featMap["Good Domain"]],
          [ctx.aptMap["War Domain Weapon"]]: [ctx.featMap["War Domain Weapon: Longsword"]],
        },
        {},
      );

      // War Domain Weapon: Longsword virtually grants Weapon Focus: Longsword via
      // "set feats.weaponfocuslongsword.possessed = true". Non-stackable virtually
      // possessed feats should be excluded from the available feat list.
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 2,
        { search: "Weapon Focus: Longsword" }, { limit: 100, page: 1 },
      );

      const wfLongsword = result.items.find((f) => f.name === "Weapon Focus: Longsword");
      expect(wfLongsword).toBeUndefined();
    });

    test("auto-granted free feats from pending batch levels should be excluded from available feats", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Batch Ranger", xp: 3000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 14, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 14, Charisma: 8 },
        languages: ["Common"],
      });

      // Ranger L1 auto-grants Track as a free feat. In a batch with Ranger L1 + Fighter L1,
      // Track should not appear when selecting feats for Fighter L1.
      const rangerKlassLevel1 = await KlassLevels.findOneByKlassAndLevel(db, { klassId: ctx.klassMap.pc["Ranger"], level: 1 });
      const fighterKlassLevel1 = await KlassLevels.findOneByKlassAndLevel(db, { klassId: ctx.klassMap.pc["Fighter"], level: 1 });
      expect(rangerKlassLevel1).toBeDefined();
      expect(fighterKlassLevel1).toBeDefined();

      const pendingKlassLevelIds = [rangerKlassLevel1!.id, fighterKlassLevel1!.id];

      // Without pending levels: Track appears in the General aptitude available list
      const withoutPending = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Track" }, { limit: 100, page: 1 },
      );
      const trackWithout = withoutPending.items.find((f) => f.name === "Track");
      expect(trackWithout).toBeDefined();

      // With pending levels (Ranger L1 included): Track should be excluded
      const withPending = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Track" }, { limit: 100, page: 1 },
        undefined, pendingKlassLevelIds,
      );
      const trackWith = withPending.items.find((f) => f.name === "Track");
      expect(trackWith).toBeUndefined();

      // Same for grouped endpoint
      const groupedWithPending = await CharacterLevelsMethods.getAvailableFeatsGrouped(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Track" }, { limit: 100, page: 1 },
        undefined, pendingKlassLevelIds,
      );
      const trackGrouped = groupedWithPending.items.find((f) => f.displayName === "Track");
      expect(trackGrouped).toBeUndefined();
    });

    test("War Domain Weapon: X should be eligible even when Weapon Focus: X is possessed (no anti-stacking)", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter WF", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Fighter L1: Pick Weapon Focus: Longsword (BAB 1 + Martial Proficiency met)
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Weapon Focus: Longsword"]] },
        {},
      );

      // War Domain Weapon: Longsword should still be eligible (no anti-stacking after v29)
      const warWeaponAptId = ctx.aptMap["War Domain Weapon"];
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, warWeaponAptId, ctx.klassMap.pc["Cleric"], 1,
        {}, { limit: 100, page: 1 },
      );

      const wdwLongsword = result.items.find((f) => f.name === "War Domain Weapon: Longsword");
      expect(wdwLongsword).toBeDefined();
      expect(wdwLongsword!.eligible).toBe(true);

      // Other War Domain Weapon feats should also be eligible
      const wdwGreataxe = result.items.find((f) => f.name === "War Domain Weapon: Greataxe");
      expect(wdwGreataxe).toBeDefined();
      expect(wdwGreataxe!.eligible).toBe(true);
    });

    test("War Domain Weapon feats should have possessed modifiers and FEAT_FAMILY properties", async () => {
      const ctx = await getSeedContext(db);
      const featId = ctx.featMap["War Domain Weapon: Longsword"];
      expect(featId).toBeDefined();

      // Verify possessed modifiers (grants Weapon Focus + Martial Weapon Proficiency)
      const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [featId], sourceType: "feats" });
      const wfMod = modifiers.find((m) => m.target === "feats.weaponfocuslongsword.possessed");
      expect(wfMod).toBeDefined();
      expect(wfMod!.value).toBe("true");
      expect(wfMod!.operator).toBe("set");

      const mwpMod = modifiers.find((m) => m.target === "feats.martialweaponproficiencylongsword.possessed");
      expect(mwpMod).toBeDefined();

      // Verify FEAT_FAMILY properties
      const properties = await Properties.findManyByEntity(db, { entityIds: [featId], entityType: "feats", type: "FEAT_FAMILY" });
      const values = properties.map((p) => p.value).sort();
      expect(values).toEqual(["Martial Weapon Proficiency", "Weapon Focus"]);
    });

    test("Weapon Focus for non-martial weapons should not be affected by anti-stacking", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test War Cleric 2", xp: 1000,
        alignment: "Neutral Good", age: 30, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
        languages: ["Common"],
      });

      // Fighter L1: BAB 1 + Simple/Martial Weapon Proficiency
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      );

      // Cleric L1 (character level 2, ×1): 4 SP (2 base + 1 INT + 1 Human). War Domain + Good Domain, pick War Domain Weapon: Longsword
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Cleric"], 1, 8, null,
        { [ctx.skillMap["Concentration"]]: 1, [ctx.skillMap["Heal"]]: 1, [ctx.skillMap["Spellcraft"]]: 1, [ctx.skillMap["Diplomacy"]]: 1 },
        {
          [ctx.aptMap["Cleric Domain"]]: [ctx.featMap["War Domain"], ctx.featMap["Good Domain"]],
          [ctx.aptMap["War Domain Weapon"]]: [ctx.featMap["War Domain Weapon: Longsword"]],
        },
        {},
      );

      // Weapon Focus: Dagger (simple) should still be eligible — no anti-stacking with War Domain Weapon
      const daggerResult = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 2,
        { search: "Weapon Focus: Dagger" }, { limit: 100, page: 1 },
      );
      const wfDagger = daggerResult.items.find((f) => f.name === "Weapon Focus: Dagger");
      expect(wfDagger).toBeDefined();
      expect(wfDagger!.eligible).toBe(true);

      // Weapon Focus: Greataxe (martial, but different weapon) should also still be eligible
      const greataxeResult = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 2,
        { search: "Weapon Focus: Greataxe" }, { limit: 100, page: 1 },
      );
      const wfGreataxe = greataxeResult.items.find((f) => f.name === "Weapon Focus: Greataxe");
      expect(wfGreataxe).toBeDefined();
      expect(wfGreataxe!.eligible).toBe(true);
    });

    test("getAvailableFeatsGrouped should collapse families, respect excludeFeatIds, and annotate singles", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test Fighter Grouped", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Fighter L1: take Power Attack + Great Fortitude (Human gets 2 General), Weapon Focus: Longsword as Fighter Bonus
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Weapon Focus: Longsword"]] },
        {},
      );

      // Grouped query for General aptitude at Fighter L2
      const generalAptId = ctx.aptMap["General"];
      const grouped = await CharacterLevelsMethods.getAvailableFeatsGrouped(
        session, characterId, generalAptId, ctx.klassMap.pc["Fighter"], 2,
        {}, { limit: 200, page: 1 },
      );

      // --- Families are collapsed ---
      const weaponFocusRow = grouped.items.find((r) => r.family === "Weapon Focus");
      expect(weaponFocusRow).toBeDefined();
      expect(weaponFocusRow!.displayName).toBe("Weapon Focus");
      // Weapon Focus: Longsword was taken (non-stackable) so count is total - 1
      const flatGeneral = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, generalAptId, ctx.klassMap.pc["Fighter"], 2,
        { family: "Weapon Focus" }, { limit: 200, page: 1 },
      );
      expect(weaponFocusRow!.variantCount).toBe(flatGeneral.items.length);

      // --- Power Attack was taken (non-stackable), should not appear ---
      const powerAttackRow = grouped.items.find(
        (r) => r.family === null && r.displayName === "Power Attack",
      );
      expect(powerAttackRow).toBeUndefined();

      // --- Single feats carry eligibility ---
      // Cleave requires Power Attack (met) + BAB 1 (met) → eligible
      const cleaveRow = grouped.items.find(
        (r) => r.family === null && r.displayName === "Cleave",
      );
      expect(cleaveRow).toBeDefined();
      expect(cleaveRow!.eligible).toBe(true);

      // Weapon Specialization requires Fighter L4 → ineligible at L2
      const weaponSpecRow = grouped.items.find((r) => r.family === "Weapon Specialization");
      expect(weaponSpecRow).toBeDefined();
      // Single feats inside a family are still families (variantCount > 1), eligibility is on variants
      // Check that the family row itself is flagged eligible:true (families always are)
      expect(weaponSpecRow!.eligible).toBe(true);

      // --- family filter on flat query returns variants with eligibility ---
      // Weapon Focus variants via family filter should all have eligible field
      for (const feat of flatGeneral.items) {
        expect(feat.name).toMatch(/^Weapon Focus: /);
        expect(typeof feat.eligible).toBe("boolean");
      }
      // Weapon Focus: Longsword should be excluded (already taken)
      expect(flatGeneral.items.find((f) => f.name === "Weapon Focus: Longsword")).toBeUndefined();

      // --- Grouped count < flat count due to collapsing ---
      const flatAll = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, generalAptId, ctx.klassMap.pc["Fighter"], 2,
        {}, { limit: 500, page: 1 },
      );
      expect(grouped.items.length).toBeLessThan(flatAll.items.length);
    });

    test("should allow picking both Weapon Focus: X and War Domain Weapon: Y for different weapons", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Test WF + WDW", xp: 1000,
        alignment: "Neutral Good", age: 30, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
        languages: ["Common"],
      });

      // Fighter L1: Pick Weapon Focus: Greataxe (BAB 1 + Martial Proficiency met)
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Weapon Focus: Greataxe"]] },
        {},
      );

      // Cleric L1 (character level 2, ×1): 4 SP (2 base + 1 INT + 1 Human). War Domain + Good Domain, pick War Domain Weapon: Longsword (different weapon)
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Cleric"], 1, 8, null,
        { [ctx.skillMap["Concentration"]]: 1, [ctx.skillMap["Heal"]]: 1, [ctx.skillMap["Spellcraft"]]: 1, [ctx.skillMap["Diplomacy"]]: 1 },
        {
          [ctx.aptMap["Cleric Domain"]]: [ctx.featMap["War Domain"], ctx.featMap["Good Domain"]],
          [ctx.aptMap["War Domain Weapon"]]: [ctx.featMap["War Domain Weapon: Longsword"]],
        },
        {},
      );

      // Verify both feats are on the character
      const characterLevels = await CharacterLevels.findMany(db, { characterId });
      const characterLevelIds = characterLevels.map((lvl) => lvl.id);
      const characterFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds });

      expect(characterFeats.some((cf) => cf.featId === ctx.featMap["Weapon Focus: Greataxe"])).toBe(true);
      expect(characterFeats.some((cf) => cf.featId === ctx.featMap["War Domain Weapon: Longsword"])).toBe(true);
    });
  });

  describe("getEditFeatSlots", () => {
    test("should include human bonus general feat when editing level 1", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Human Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Add level 1 Fighter
      const fighterKlassId = ctx.klassMap.pc["Fighter"];
      const [klassLevel] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, fighterKlassId), eq(klassLevelsInRules.level, 1)));

      const [charLevel] = await db
        .insert(levelsInCharacter)
        .values({ characterId, klassLevelId: klassLevel.id, hp: 10 })
        .returning({ id: levelsInCharacter.id });

      const editResult = await CharacterLevelsMethods.getEditFeatSlots(
        session, characterId, fighterKlassId, 1, charLevel.id,
      );

      // Human gets: 1 general feat (from progression) + 1 general feat (from human race modifier)
      // Fighter level 1 also grants bonus fighter feats
      // The general pool should include the human bonus feat in both cases
      const editGeneral = Object.values(editResult.aptitudePools).find((p) => p.name === "General");

      expect(editGeneral).toBeDefined();
      // Human gets 2 general feat slots at level 1: 1 from progression + 1 from human race modifier
      expect(editGeneral!.allowed).toBe(2);
    });

    test("should include Fighter Bonus Feat pool when editing fighter level 1", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Edit Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const fighterKlassId = ctx.klassMap.pc["Fighter"];
      const [klassLevel] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, fighterKlassId), eq(klassLevelsInRules.level, 1)));

      const [charLevel] = await db
        .insert(levelsInCharacter)
        .values({ characterId, klassLevelId: klassLevel.id, hp: 10 })
        .returning({ id: levelsInCharacter.id });

      const editResult = await CharacterLevelsMethods.getEditFeatSlots(
        session, characterId, fighterKlassId, 1, charLevel.id,
      );

      const bonusPool = Object.values(editResult.aptitudePools).find((p) => p.name === "Fighter Bonus Feat");
      expect(bonusPool).toBeDefined();
      expect(bonusPool!.allowed).toBe(1);
    });

    test("multiclass: editing a non-first class level with a General feat saved there preserves it", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Dwarf", name: "Multiclass Edit", xp: 6000,
        alignment: "Neutral Good", age: 60, gender: "Male",
        height: "140", weight: "85", description: "Test",
        abilities: { Strength: 16, Dexterity: 13, Constitution: 16, Intelligence: 10, Wisdom: 12, Charisma: 8 },
        languages: ["Common", "Dwarven"],
      });

      const fighterId = ctx.klassMap.pc["Fighter"];
      // Three character levels so the character has 2 General slots granted
      // (one at character L1, one at character L3 — matches Kael Ironhand's
      // Barbarian 1 / Fighter 1-3 multiclass shape).
      const barbLevelId = (await addClassLevels(db, ctx, characterId, "Barbarian", [1], [12]))[0];
      const fighterLevelId = (await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]))[0];
      await addClassLevels(db, ctx, characterId, "Fighter", [2], [8]);

      // Acrobatic at Barb 1 (= character L1, grants 1 General) and Power Attack
      // mis-attributed to Fighter 1 (= character L2, no General grant). The
      // 2nd general slot is granted at character L3 (= Fighter 2) but
      // Power Attack lives on Fighter 1 instead.
      await addFeats(db, ctx, [barbLevelId, fighterLevelId], [
        { levelIndex: 0, featName: "Acrobatic", aptitude: "General" },
        { levelIndex: 1, featName: "Power Attack", aptitude: "General" },
        { levelIndex: 1, featName: "Weapon Focus: Battleaxe", aptitude: "Fighter Bonus Feat" },
      ]);

      const editResult = await CharacterLevelsMethods.getEditFeatSlots(
        session, characterId, fighterId, 1, fighterLevelId,
      );

      // The General pool must still accommodate Power Attack: pool's
      // available must be at least 1 so the wizard's pre-population doesn't
      // get trimmed. Before the fix this returned available=0 and the
      // wizard silently dropped Power Attack on save.
      const generalPool = Object.values(editResult.aptitudePools).find((p) => p.name === "General");
      expect(generalPool).toBeDefined();
      expect(generalPool!.available).toBeGreaterThanOrEqual(1);

      // Round-trip: updateLevel with the pre-populated feats should preserve
      // every existing feat in the DB.
      await CharacterLevelsMethods.updateLevel(
        session, characterId, fighterLevelId, 10, null,
        {},
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"]],
          [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Weapon Focus: Battleaxe"]],
        },
        {},
        true,
      );

      const remaining = await CharacterLevelFeats.findMany(db, { characterLevelIds: [fighterLevelId] });
      const remainingFeatIds = new Set(remaining.map((r) => r.featId));
      expect(remainingFeatIds.has(ctx.featMap["Power Attack"])).toBe(true);
      expect(remainingFeatIds.has(ctx.featMap["Weapon Focus: Battleaxe"])).toBe(true);
    });

    test("multiclass: editing skill slots reports the same budget that updateLevel validates", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Dwarf", name: "Multiclass Skill Edit", xp: 6000,
        alignment: "Neutral Good", age: 60, gender: "Male",
        height: "140", weight: "85", description: "Test",
        abilities: { Strength: 16, Dexterity: 13, Constitution: 16, Intelligence: 10, Wisdom: 12, Charisma: 8 },
        languages: ["Common", "Dwarven"],
      });

      const fighterId = ctx.klassMap.pc["Fighter"];
      const barbLevelId = (await addClassLevels(db, ctx, characterId, "Barbarian", [1], [12]))[0];
      const fighterLevelId = (await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]))[0];

      // Barb 1 grants 16 skill points (first level, ×4), spent: 4 ranks.
      // Fighter 1 grants 2 skill points, but stuff 8 ranks here to mimic the
      // drift Kael had — globally balanced (20 spent / 18 budget...) hmm
      // adjust to balance: Barb=12 ranks, Fighter=8 ranks → 20 spent vs 18
      // budget → overspent. Instead: balance via overflow at non-first level.
      // Use: Barb saves 4, Fighter saves 14 → 18 total. Budget=18 ✓.
      await addSkills(db, ctx, [barbLevelId, fighterLevelId], [
        { levelIndex: 0, skillName: "Climb", rank: 1 },
        { levelIndex: 0, skillName: "Intimidate", rank: 1 },
        { levelIndex: 0, skillName: "Jump", rank: 1 },
        { levelIndex: 0, skillName: "Listen", rank: 1 },
        { levelIndex: 1, skillName: "Climb", rank: 4 },
        { levelIndex: 1, skillName: "Intimidate", rank: 4 },
        { levelIndex: 1, skillName: "Jump", rank: 4 },
        { levelIndex: 1, skillName: "Swim", rank: 2 },
      ]);

      // Edit-slot's projection must mirror updateLevel's projection so the
      // dialog's budget agrees with what the save will validate.
      const editSkills = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, fighterId, 1, fighterLevelId,
      );
      // Total budget = 16 (Barb L1 ×4) + 2 (Fighter L1) = 18.
      // Spent everywhere except Fighter L1 = Barb's 4 ranks.
      // Available for the projected Fighter L1 = 18 − 4 = 14.
      expect(editSkills.skillPointsToSpend).toBe(14);

      // Round-trip: send the saved Fighter-L1 ranks back unchanged.
      await CharacterLevelsMethods.updateLevel(
        session, characterId, fighterLevelId, 10, null,
        {
          [ctx.skillMap["Climb"]]: 4,
          [ctx.skillMap["Intimidate"]]: 4,
          [ctx.skillMap["Jump"]]: 4,
          [ctx.skillMap["Swim"]]: 2,
        },
        {}, {},
        true,
      );

      // All four skill ranks must still exist after the round-trip.
      const remaining = await CharacterLevelSkills.findMany(db, { characterLevelIds: [fighterLevelId] });
      expect(remaining.length).toBe(4);
      const totalRanks = remaining.reduce((acc, r) => acc + r.rank, 0);
      expect(totalRanks).toBe(14);
    });

    test("multiclass: editing the FIRST character level preserves its x4 SP multiplier (Kael Barb-first shape)", async () => {
      // Kael in prod has Barbarian as the earliest createdAt (character L1)
      // and Fighter L1-L3 after it. Editing Barb L1 must keep Barb as the
      // "first character level" — otherwise the x4 SP multiplier migrates
      // to Fighter L1 (with Fighter's smaller base SP), the total budget
      // drops, and the dialog reports a negative available clamped to 1.
      // Repro: dialog showed "Skill Points to Spend: 1, Points Spent: 4 / 1"
      // on the saved-valid prod Kael despite no global validation issues.
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Dwarf", name: "Kael Barb-First", xp: 9000,
        alignment: "Neutral Good", age: 60, gender: "Male",
        height: "140", weight: "85", description: "Test",
        abilities: { Strength: 16, Dexterity: 13, Constitution: 16, Intelligence: 10, Wisdom: 12, Charisma: 8 },
        languages: ["Common", "Dwarven"],
      });

      const barbId = ctx.klassMap.pc["Barbarian"];
      const barbLevelId = (await addClassLevels(db, ctx, characterId, "Barbarian", [1], [12]))[0];
      const fighterL1Id = (await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]))[0];
      const fighterL2Id = (await addClassLevels(db, ctx, characterId, "Fighter", [2], [8]))[0];
      const fighterL3Id = (await addClassLevels(db, ctx, characterId, "Fighter", [3], [8]))[0];

      // Stagger createdAt so Barb is clearly earliest (the seed inserts within
      // one txn share now()). finalizeLevelUp stamps levels with a row-staggered
      // createdAt in prod — mirror that here so the "first character level"
      // determination is deterministic.
      const base = Date.now();
      for (const [id, offset] of [[barbLevelId, 0], [fighterL1Id, 1], [fighterL2Id, 2], [fighterL3Id, 3]] as const) {
        await db.update(levelsInCharacter)
          .set({ createdAt: new Date(base + offset).toISOString() })
          .where(eq(levelsInCharacter.id, id));
      }

      // Distribute ranks lopsided like prod Kael: under-fill Barb L1, over-fill Fighter
      // levels. Total raw ranks = 22 = total budget (Barb L1 x4 = 16; Fighter x1 each = 2+2+2 = 6).
      await addSkills(db, ctx, [barbLevelId, fighterL1Id, fighterL2Id, fighterL3Id], [
        { levelIndex: 0, skillName: "Climb", rank: 1 },
        { levelIndex: 0, skillName: "Intimidate", rank: 1 },
        { levelIndex: 0, skillName: "Jump", rank: 1 },
        { levelIndex: 0, skillName: "Survival", rank: 1 },
        { levelIndex: 1, skillName: "Climb", rank: 4 },
        { levelIndex: 1, skillName: "Intimidate", rank: 4 },
        { levelIndex: 2, skillName: "Climb", rank: 1 },
        { levelIndex: 2, skillName: "Intimidate", rank: 1 },
        { levelIndex: 3, skillName: "Climb", rank: 4 },
        { levelIndex: 3, skillName: "Intimidate", rank: 4 },
      ]);

      // Editing the FIRST character level (Barb L1). With the createdAt fix,
      // Barb must still be treated as the first level → x4 multiplier intact
      // → total budget = 22 (16 Barb + 2 + 2 + 2 Fighter).
      // Pre-fix: projected level got createdAt = now, sorted last, first-level
      // status migrated to Fighter L1 → total budget = 8 (Fighter L1 x4) + 2 +
      // 2 + Barb L1 x1 (4) = 16. Other-level spent = 18 → available -2 → max(1, -2) = 1.
      const editSkills = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, barbId, 1, barbLevelId,
      );
      // Budget = 22. Other levels (Fighter L1/L2/L3) spent = 8 + 2 + 8 = 18.
      // Available for Barb L1 = 22 - 18 = 4 (matches the 4 ranks currently saved).
      expect(editSkills.skillPointsToSpend).toBe(4);
      expect(editSkills.totalCharacterLevel).toBe(4);

      // Round-trip the dialog's budget through updateLevel — must succeed.
      await CharacterLevelsMethods.updateLevel(
        session, characterId, barbLevelId, 12, null,
        {
          [ctx.skillMap["Climb"]]: 1,
          [ctx.skillMap["Intimidate"]]: 1,
          [ctx.skillMap["Jump"]]: 1,
          [ctx.skillMap["Survival"]]: 1,
        },
        {}, {},
        true,
      );

      const remaining = await CharacterLevelSkills.findMany(db, { characterLevelIds: [barbLevelId] });
      expect(remaining.length).toBe(4);
    });

    test("multiclass: editing a non-last level reports total character level and budget that match the save (Kael shape)", async () => {
      // Mirrors Kael's drift: 4 levels, edit a level that is NOT the last.
      // With the old getLevelIdsFromOnward exclusion, this case happened to
      // hide the bug at the last level (onward == [self]) but exposed it
      // here. Pin both fields so a regression on either surface is caught:
      //   - totalCharacterLevel = total character level (used for the
      //     character-wide 3.5 rank cap, totalCharacterLevel + 3)
      //   - skillPointsToSpend = total budget minus other-level spent
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Dwarf", name: "Kael Shape", xp: 9000,
        alignment: "Neutral Good", age: 60, gender: "Male",
        height: "140", weight: "85", description: "Test",
        abilities: { Strength: 16, Dexterity: 13, Constitution: 16, Intelligence: 10, Wisdom: 12, Charisma: 8 },
        languages: ["Common", "Dwarven"],
      });

      const fighterId = ctx.klassMap.pc["Fighter"];
      const barbLevelId = (await addClassLevels(db, ctx, characterId, "Barbarian", [1], [12]))[0];
      const fighterL1Id = (await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]))[0];
      const fighterL2Id = (await addClassLevels(db, ctx, characterId, "Fighter", [2], [8]))[0];
      const fighterL3Id = (await addClassLevels(db, ctx, characterId, "Fighter", [3], [8]))[0];

      // Total budget = Barb L1 ×4 (16) + 3 × Fighter ×1 (2 each) = 22.
      // Other levels (excluding the level being edited, Fighter L1) spend:
      //   Barb L1 = 16 ranks, Fighter L2 = 2 ranks, Fighter L3 = 2 ranks → 20.
      // Available for the projected Fighter L1 edit = 22 − 20 = 2.
      await addSkills(db, ctx, [barbLevelId, fighterL1Id, fighterL2Id, fighterL3Id], [
        { levelIndex: 0, skillName: "Climb", rank: 4 },
        { levelIndex: 0, skillName: "Intimidate", rank: 4 },
        { levelIndex: 0, skillName: "Jump", rank: 4 },
        { levelIndex: 0, skillName: "Swim", rank: 4 },
        { levelIndex: 1, skillName: "Climb", rank: 1 },
        { levelIndex: 1, skillName: "Intimidate", rank: 1 },
        { levelIndex: 2, skillName: "Climb", rank: 1 },
        { levelIndex: 2, skillName: "Intimidate", rank: 1 },
        { levelIndex: 3, skillName: "Climb", rank: 1 },
        { levelIndex: 3, skillName: "Intimidate", rank: 1 },
      ]);

      const editSkills = await CharacterLevelsMethods.getSkillSlots(
        session, characterId, fighterId, 1, fighterL1Id,
      );
      // Pre-fix returned 6 (only Barb L1's 16 subtracted because onward
      // excluded Fighter L1+L2+L3). Post-fix subtracts only Fighter L1.
      expect(editSkills.skillPointsToSpend).toBe(2);
      // Pre-fix returned 2 (edited level's ordinal position). Post-fix
      // returns the total character level, which is what the client needs
      // for the rule-accurate rank cap (total + 3).
      expect(editSkills.totalCharacterLevel).toBe(4);

      // Round-trip the budget the dialog reported: save 2 ranks at L1.
      await CharacterLevelsMethods.updateLevel(
        session, characterId, fighterL1Id, 10, null,
        {
          [ctx.skillMap["Climb"]]: 1,
          [ctx.skillMap["Intimidate"]]: 1,
        },
        {}, {},
        true,
      );

      const remaining = await CharacterLevelSkills.findMany(db, { characterLevelIds: [fighterL1Id] });
      expect(remaining.length).toBe(2);
      expect(remaining.reduce((acc, r) => acc + r.rank, 0)).toBe(2);
    });

    test("multiclass: editing a spellcaster level preserves powers at other levels on round-trip", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Multiclass Power Edit", xp: 3000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 10, Dexterity: 12, Constitution: 12, Intelligence: 16, Wisdom: 10, Charisma: 14 },
        languages: ["Common"],
      });

      const sorcLevelId = (await addClassLevels(db, ctx, characterId, "Sorcerer", [1], [4]))[0];
      const fighterLevelId = (await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]))[0];
      const sorc2LevelId = (await addClassLevels(db, ctx, characterId, "Sorcerer", [2], [4]))[0];

      await addPowers(db, ctx, [sorcLevelId, fighterLevelId, sorc2LevelId], [
        { levelIndex: 0, powerName: "Light", aptitude: "Sorcerer Spells" },
        { levelIndex: 0, powerName: "Detect Magic", aptitude: "Sorcerer Spells" },
        { levelIndex: 2, powerName: "Magic Missile", aptitude: "Sorcerer Spells" },
      ]);

      // Round-trip the sorcerer L2 edit. Before the projection fix, the edit
      // pool was computed against onward-excluded state, which could drift
      // from what updateLevel actually validates against and leak data loss.
      await CharacterLevelsMethods.updateLevel(
        session, characterId, sorc2LevelId, 4, null,
        {}, {},
        { [ctx.aptMap["Sorcerer Spells"]]: [ctx.powerMap["Magic Missile"]] },
        true,
      );

      const remaining = await CharacterLevelPowers.findMany(db, { characterLevelIds: [sorc2LevelId] });
      expect(remaining.length).toBe(1);
      expect(remaining[0].powerId).toBe(ctx.powerMap["Magic Missile"]);

      const sorcL1Remaining = await CharacterLevelPowers.findMany(db, { characterLevelIds: [sorcLevelId] });
      expect(sorcL1Remaining.length).toBe(2);
    });

    test("updateLevel flags an orphaned requirement when removing a prerequisite feat", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Orphan Cleave", xp: 3000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 13, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const fL1 = (await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]))[0];
      await addClassLevels(db, ctx, characterId, "Fighter", [2], [8]);
      const fL3 = (await addClassLevels(db, ctx, characterId, "Fighter", [3], [7]))[0];

      // Power Attack at L1, Cleave at L3 (Cleave requires Power Attack).
      await addFeats(db, ctx, [fL1, fL3], [
        { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
        { levelIndex: 1, featName: "Cleave", aptitude: "General" },
      ]);

      // Editing L1 to drop Power Attack should fail because Cleave at L3
      // still requires it. The surfaced issue must mention Cleave so the
      // user can resolve the orphaned dependency.
      let caught: unknown = undefined;
      try {
        await CharacterLevelsMethods.updateLevel(
          session, characterId, fL1, 10, null,
          {},
          { [ctx.aptMap["General"]]: [] },
          {},
          false,
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(BadRequestError);
      const message = (caught as BadRequestError).message;
      expect(message.toLowerCase()).toContain("cleave");
    });

    test("editing the level that hosts a bonded-grant feat preserves the bonded child", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Bonded Edit Round-Trip", xp: 0,
        alignment: "Chaotic Good", age: 25, gender: "Male",
        height: "170", weight: "70", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 16 },
        languages: ["Common"],
      });

      const sorcLevelId = await addOneLevel(
        session, characterId, ctx.klassMap.pc["Sorcerer"], 1, 4, null,
        {
          [ctx.skillMap["Bluff"]]: 4,
          [ctx.skillMap["Concentration"]]: 4,
          [ctx.skillMap["Spellcraft"]]: 4,
          [ctx.skillMap["Use Magic Device"]]: 4,
        },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Sorcerer Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Light"],
            ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"],
          ],
        },
      ).then((l) => l.id);

      const bondedBefore = await Characters.findOne(db, {
        parentCharacterId: characterId, kind: "familiar",
      });
      expect(bondedBefore).toBeDefined();
      const bondedIdBefore = bondedBefore!.id;

      // Round-trip the sorcerer L1 edit without touching the bonded-grant
      // feat. Reconcile inside updateLevel must keep the same familiar row.
      await CharacterLevelsMethods.updateLevel(
        session, characterId, sorcLevelId, 4, null,
        {
          [ctx.skillMap["Bluff"]]: 4,
          [ctx.skillMap["Concentration"]]: 4,
          [ctx.skillMap["Spellcraft"]]: 4,
          [ctx.skillMap["Use Magic Device"]]: 4,
        },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Sorcerer Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Light"],
            ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"],
          ],
        },
      );

      const bondedAfter = await Characters.findOne(db, {
        parentCharacterId: characterId, kind: "familiar",
      });
      expect(bondedAfter).toBeDefined();
      expect(bondedAfter!.id).toBe(bondedIdBefore);
    });

    test("global skill budget treats cross-class ranks as raw rank, not point cost (documented semantic)", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Cross-Class Drift", xp: 3000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 13, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Fighter (2 base + 0 Int + 1 Human = 3 SP/level): L1=12, L2=3, L3=3. Total = 18.
      const fL1 = (await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]))[0];
      const fL2 = (await addClassLevels(db, ctx, characterId, "Fighter", [2], [8]))[0];
      const fL3 = (await addClassLevels(db, ctx, characterId, "Fighter", [3], [7]))[0];

      // Spot is cross-class for Fighter (1 raw rank = 2 points). Raw-rank total
      // matches 18-point budget, but per-level POINT cost is imbalanced — L3
      // overspends by 3 points. Global validate stays clean because
      // skillBudget.spent sums raw ranks, not point cost.
      await addSkills(db, ctx, [fL1, fL2, fL3], [
        // L1 (12 pt budget): 12 class ranks = 12 pts, 12 raw (exact)
        { levelIndex: 0, skillName: "Climb", rank: 4 },
        { levelIndex: 0, skillName: "Intimidate", rank: 4 },
        { levelIndex: 0, skillName: "Jump", rank: 4 },
        // L2 (3 pt budget): 1 class + 1 cross-class = 2 raw, 3 pts (exact)
        { levelIndex: 1, skillName: "Swim", rank: 1 },
        { levelIndex: 1, skillName: "Spot", rank: 1 },
        // L3 (3 pt budget): 2 class + 2 cross-class = 4 raw, 6 pts (OVER by 3)
        { levelIndex: 2, skillName: "Climb", rank: 2 },
        { levelIndex: 2, skillName: "Spot", rank: 2 },
      ]);

      // Raw-rank total = 12 + 2 + 4 = 18 = total budget. The skill-budget
      // issue list is empty even though L3's per-level point cost overshoots.
      const { detailedCharacter } = await CharactersMethods.getCharacter(session, characterId);
      const dc = detailedCharacter as unknown as {
        getDetailedCharacterSkills(): { getSkillBudget(): { total: number; spent: number; available: number } };
        validate(): { valid: boolean; issues: { category: string; message: string }[] };
      };
      const budget = dc.getDetailedCharacterSkills().getSkillBudget();
      expect(budget.spent).toBe(18);
      expect(budget.total).toBe(18);
      expect(budget.available).toBe(0);
      const skillBudgetIssues = dc.validate().issues.filter(
        (i) => i.category === "skills" && /skill point/.test(i.message),
      );
      expect(skillBudgetIssues).toHaveLength(0);
      // Documented semantic: per-level cross-class point-cost overspending is
      // not enforced by skillBudget.spent (raw rank sum). If this formula
      // changes, this test has to change with it.
    });
  });

  describe("auto-granted feat aptitude modifiers in projected builds", () => {
    test("getFeatSlots includes Fighter Bonus Feat pool for fighter level 1", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "New Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const result = await CharacterLevelsMethods.getFeatSlots(
        session, characterId, ctx.klassMap.pc["Fighter"], 1,
      );

      const bonusPool = Object.values(result.aptitudePools).find((p) => p.name === "Fighter Bonus Feat");
      expect(bonusPool).toBeDefined();
      expect(bonusPool!.available).toBe(1);
    });

    test("getFeatSlots includes Ranger combat style pool for ranger level 2", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "New Ranger", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 14, Dexterity: 16, Constitution: 14, Intelligence: 12, Wisdom: 14, Charisma: 8 },
        languages: ["Common"],
      });

      // Add ranger level 1 first
      const charLevelIds = await addClassLevels(db, ctx, characterId, "Ranger", [1], [10]);
      await addFeats(db, ctx, charLevelIds, [
        { levelIndex: 0, featName: "Track", aptitude: "Ranger Class Feature" },
        { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
      ]);

      // Now check what pools are available for ranger level 2
      const result = await CharacterLevelsMethods.getFeatSlots(
        session, characterId, ctx.klassMap.pc["Ranger"], 2,
      );

      const combatStylePool = Object.values(result.aptitudePools).find(
        (p) => p.name === "Ranger Combat Style (2nd)",
      );
      expect(combatStylePool).toBeDefined();
      expect(combatStylePool!.available).toBe(1);
    });

    test("getFeatSlots includes Monk Bonus Feat pool for monk level 1", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "New Monk", xp: 0,
        alignment: "Lawful Neutral", age: 25, gender: "Male",
        height: "170", weight: "65", description: "Test",
        abilities: { Strength: 14, Dexterity: 16, Constitution: 12, Intelligence: 10, Wisdom: 16, Charisma: 8 },
        languages: ["Common"],
      });

      const result = await CharacterLevelsMethods.getFeatSlots(
        session, characterId, ctx.klassMap.pc["Monk"], 1,
      );

      const monkBonusPool = Object.values(result.aptitudePools).find(
        (p) => p.name === "Monk Bonus Feat (1st)",
      );
      expect(monkBonusPool).toBeDefined();
      expect(monkBonusPool!.available).toBe(1);
    });

    test("getFeatSlots includes Rogue Special Ability pool for rogue level 10", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "New Rogue", xp: 45000,
        alignment: "Chaotic Neutral", age: 25, gender: "Female",
        height: "165", weight: "55", description: "Test",
        abilities: { Strength: 10, Dexterity: 18, Constitution: 12, Intelligence: 14, Wisdom: 10, Charisma: 14 },
        languages: ["Common"],
      });

      // Add rogue levels 1-9
      const charLevelIds = await addClassLevels(db, ctx, characterId, "Rogue",
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [6, 4, 5, 4, 5, 4, 5, 4, 5],
      );
      await addFeats(db, ctx, charLevelIds, [
        { levelIndex: 0, featName: "Dodge", aptitude: "General" },
        { levelIndex: 0, featName: "Improved Initiative", aptitude: "General" },
        { levelIndex: 2, featName: "Weapon Finesse", aptitude: "General" },
        { levelIndex: 5, featName: "Mobility", aptitude: "General" },
        { levelIndex: 8, featName: "Spring Attack", aptitude: "General" },
      ]);

      const result = await CharacterLevelsMethods.getFeatSlots(
        session, characterId, ctx.klassMap.pc["Rogue"], 10,
      );

      const specialPool = Object.values(result.aptitudePools).find(
        (p) => p.name === "Rogue Special Ability",
      );
      expect(specialPool).toBeDefined();
      expect(specialPool!.available).toBe(1);
    });
  });

  describe("editing level requirements evaluation", () => {
    test("getAvailableFeats should evaluate requirements at the edited level, not including subsequent levels", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      // Wizard has poor BAB: L1 = +0, L2 = +1
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Edit Test Wizard", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "170", weight: "65", description: "Test",
        abilities: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 },
        languages: ["Common"],
      });

      // Add two Wizard levels
      const charLevelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1, 2], [4, 3]);

      // When editing level 1, only the projected L1 should be considered (BAB +0).
      // Weapon Focus requires BAB +1, so it should be ineligible.
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Wizard"], 1,
        { search: "Weapon Focus" }, { limit: 100, page: 1 },
        charLevelIds[0],
      );

      const weaponFocusVariants = result.items.filter((f) => f.name.startsWith("Weapon Focus"));
      expect(weaponFocusVariants.length).toBeGreaterThan(0);
      for (const feat of weaponFocusVariants) {
        expect(feat.eligible).toBe(false);
      }
    });

    test("getAvailableFeatsGrouped should evaluate requirements at the edited level, not including subsequent levels", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Edit Test Wizard Grouped", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "170", weight: "65", description: "Test",
        abilities: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 },
        languages: ["Common"],
      });

      const charLevelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1, 2], [4, 3]);

      // When editing level 1, Cleave (requires BAB +1 + Power Attack) should be ineligible
      const grouped = await CharacterLevelsMethods.getAvailableFeatsGrouped(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Wizard"], 1,
        {}, { limit: 200, page: 1 },
        charLevelIds[0],
      );

      const cleaveRow = grouped.items.find(
        (r) => r.family === null && r.displayName === "Cleave",
      );
      expect(cleaveRow).toBeDefined();
      expect(cleaveRow!.eligible).toBe(false);
    });

    test("getAvailableFeats should mark BAB-dependent feats eligible when editing a level with sufficient BAB", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      // Fighter has full BAB: L1 = +1, L2 = +2
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Edit Test Fighter", xp: 1000,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      const charLevelIds = await addClassLevels(db, ctx, characterId, "Fighter", [1, 2], [10, 8]);

      // When editing level 1, Fighter L1 has BAB +1 so Weapon Focus: Longsword
      // (a martial weapon a Fighter is proficient with) should be eligible
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Weapon Focus: Longsword" }, { limit: 100, page: 1 },
        charLevelIds[0],
      );

      const wfLongsword = result.items.find((f) => f.name === "Weapon Focus: Longsword");
      expect(wfLongsword).toBeDefined();
      expect(wfLongsword!.eligible).toBe(true);
    });
  });

  describe("selectedFeatPicks projection", () => {
    test("getAvailableFeats should make Cleave eligible when Power Attack is in selectedFeatPicks", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Feat Projection Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Without picks: Cleave requires Power Attack + BAB +1.
      // Fighter L1 has BAB +1 but Power Attack is not taken, so Cleave should be ineligible.
      const withoutResult = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Cleave" }, { limit: 100, page: 1 },
      );
      const cleaveWithout = withoutResult.items.find((f) => f.name === "Cleave");
      expect(cleaveWithout).toBeDefined();
      expect(cleaveWithout!.eligible).toBe(false);

      // With Power Attack picked: Cleave should become eligible.
      const withResult = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Cleave", selectedFeatPicks: [{ featId: ctx.featMap["Power Attack"], aptitudeId: ctx.aptMap["General"] }] }, { limit: 100, page: 1 },
      );
      const cleaveWith = withResult.items.find((f) => f.name === "Cleave");
      expect(cleaveWith).toBeDefined();
      expect(cleaveWith!.eligible).toBe(true);
    });

    test("getAvailableFeats should exclude non-stackable selected feats from results", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Feat Exclusion Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Power Attack (non-stackable) should not appear when included in selectedFeatPicks
      const result = await CharacterLevelsMethods.getAvailableFeats(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { search: "Power Attack", selectedFeatPicks: [{ featId: ctx.featMap["Power Attack"], aptitudeId: ctx.aptMap["General"] }] }, { limit: 100, page: 1 },
      );
      const powerAttack = result.items.find((f) => f.name === "Power Attack");
      expect(powerAttack).toBeUndefined();
    });

    test("getAvailableFeatsGrouped should make Cleave eligible when Power Attack is in selectedFeatPicks", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Human", name: "Grouped Projection Fighter", xp: 0,
        alignment: "Neutral Good", age: 25, gender: "Male",
        height: "180", weight: "80", description: "Test",
        abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
        languages: ["Common"],
      });

      // Without Power Attack selected, Cleave should be ineligible
      const withoutResult = await CharacterLevelsMethods.getAvailableFeatsGrouped(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        {}, { limit: 200, page: 1 },
      );
      const cleaveWithout = withoutResult.items.find(
        (r) => r.family === null && r.displayName === "Cleave",
      );
      expect(cleaveWithout).toBeDefined();
      expect(cleaveWithout!.eligible).toBe(false);

      // With Power Attack selected, Cleave should be eligible
      const withResult = await CharacterLevelsMethods.getAvailableFeatsGrouped(
        session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
        { selectedFeatPicks: [{ featId: ctx.featMap["Power Attack"], aptitudeId: ctx.aptMap["General"] }] }, { limit: 200, page: 1 },
      );
      const cleaveWith = withResult.items.find(
        (r) => r.family === null && r.displayName === "Cleave",
      );
      expect(cleaveWith).toBeDefined();
      expect(cleaveWith!.eligible).toBe(true);
    });

    test("getAvailablePowers should exclude spells from schools prohibited by selected feats", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Wizard Prohibit Test", xp: 0,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      const wizardSpellsAptId = ctx.aptMap["Wizard Spells"];

      // Without picks: Illusion spells should be present
      const resultAll = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 1,
        {}, { limit: 500, page: 1 },
      );
      expect(resultAll.items.some((p) => p.name === "Silent Image")).toBe(true);

      // With Prohibit Illusion picked: Illusion spells should be filtered
      const resultFiltered = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 1,
        { selectedFeatPicks: [{ featId: ctx.featMap["Prohibit Illusion"], aptitudeId: ctx.aptMap["Prohibited School"] }] }, { limit: 500, page: 1 },
      );
      expect(resultFiltered.items.some((p) => p.name === "Silent Image")).toBe(false);
      // Non-Illusion spells should still be present
      expect(resultFiltered.items.some((p) => p.name === "Magic Missile")).toBe(true);
    });

    test("getAvailablePowers should exclude spells from multiple prohibited schools selected simultaneously", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Wizard Multi Prohibit", xp: 0,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      const wizardSpellsAptId = ctx.aptMap["Wizard Spells"];

      // Baseline: both Illusion and Necromancy spells should be available
      const resultAll = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 1,
        {}, { limit: 500, page: 1 },
      );
      expect(resultAll.items.some((p) => p.name === "Silent Image")).toBe(true);
      expect(resultAll.items.some((p) => p.name === "Disrupt Undead")).toBe(true);
      expect(resultAll.items.some((p) => p.name === "Touch of Fatigue")).toBe(true);

      // With both Prohibit Illusion and Prohibit Necromancy: both schools filtered
      const resultFiltered = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 1,
        { selectedFeatPicks: [
          { featId: ctx.featMap["Prohibit Illusion"], aptitudeId: ctx.aptMap["Prohibited School"] },
          { featId: ctx.featMap["Prohibit Necromancy"], aptitudeId: ctx.aptMap["Prohibited School"] },
        ] },
        { limit: 500, page: 1 },
      );
      expect(resultFiltered.items.some((p) => p.name === "Silent Image")).toBe(false);
      expect(resultFiltered.items.some((p) => p.name === "Disrupt Undead")).toBe(false);
      expect(resultFiltered.items.some((p) => p.name === "Touch of Fatigue")).toBe(false);
      // Evocation spell should still be present
      expect(resultFiltered.items.some((p) => p.name === "Magic Missile")).toBe(true);
    });

    test("getAvailablePowers should exclude spells from committed prohibited school feats", async () => {
      const ctx = await getSeedContext(db);
      const session = createTestSession(SEED_USER_ID);
      const characterId = await createCharacter(db, ctx, {
        raceName: "Elf", name: "Wizard Committed Prohibit", xp: 1000,
        alignment: "Neutral Good", age: 130, gender: "Female",
        height: "170", weight: "48", description: "Test",
        abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
        languages: ["Common", "Elven"],
      });

      // Commit a wizard level 1 with Prohibit Illusion and Prohibit Necromancy
      const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
      await addFeats(db, ctx, levelIds, [
        { levelIndex: 0, featName: "Evocation Specialist", aptitude: "Wizard Specialization" },
        { levelIndex: 0, featName: "Prohibit Illusion", aptitude: "Prohibited School" },
        { levelIndex: 0, featName: "Prohibit Necromancy", aptitude: "Prohibited School" },
      ]);
      await addPowers(db, ctx, levelIds, [
        { levelIndex: 0, powerName: "Detect Magic", aptitude: "Wizard Spells" },
        { levelIndex: 0, powerName: "Read Magic", aptitude: "Wizard Spells" },
        { levelIndex: 0, powerName: "Mage Hand", aptitude: "Wizard Spells" },
      ]);

      const wizardSpellsAptId = ctx.aptMap["Wizard Spells"];

      // Query available spells for wizard level 2 — committed prohibited schools should filter
      const result = await CharacterLevelsMethods.getAvailablePowers(
        session, characterId, wizardSpellsAptId, ctx.klassMap.pc["Wizard"], 2,
        {}, { limit: 500, page: 1 },
      );

      // Illusion and Necromancy spells must be excluded
      expect(result.items.some((p) => p.name === "Silent Image")).toBe(false);
      expect(result.items.some((p) => p.name === "Disrupt Undead")).toBe(false);
      expect(result.items.some((p) => p.name === "Touch of Fatigue")).toBe(false);
      // Evocation spell should still be present
      expect(result.items.some((p) => p.name === "Magic Missile")).toBe(true);
      // Already-picked spells should be excluded
      expect(result.items.some((p) => p.name === "Detect Magic")).toBe(false);
    });
  });
});
