import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";
import { CharacterLevelsMethods } from "@/server/services/characters/CharacterLevelsService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";
import { createCharacter, getSeedContext, SEED_USER_ID, type SeedContext } from "@/database/seeds/helpers.ts";
import { addOneLevel } from "@/tests/helpers.ts";
import { levelsInCharacter } from "@/drizzle/schema.ts";
import { eq } from "drizzle-orm";

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

const FIGHTER_ABILITIES = { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 };
const SORCERER_ABILITIES = { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 16 };

async function createFighter(ctx: SeedContext, xp = 0) {
  return createCharacter(db, ctx, {
    raceName: "Human", name: "Batch Fighter", xp,
    alignment: "Neutral Good", age: 25, gender: "Male",
    height: "180", weight: "80", description: "Test",
    abilities: FIGHTER_ABILITIES, languages: ["Common"],
  });
}

async function createSorcerer(ctx: SeedContext, xp = 0) {
  return createCharacter(db, ctx, {
    raceName: "Human", name: "Batch Sorcerer", xp,
    alignment: "Chaotic Good", age: 25, gender: "Male",
    height: "170", weight: "70", description: "Test",
    abilities: SORCERER_ABILITIES, languages: ["Common"],
  });
}

describe("finalizeLevelUp", () => {
  const session = createTestSession(SEED_USER_ID);
  let ctx: SeedContext;
  async function getCtx() {
    if (!ctx) ctx = await getSeedContext(db);
    return ctx;
  }

  test("should batch create Fighter levels 1-4 with ability increase at L4", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 6000);

    // Pool-level selections — backend distributes to per-level payloads
    // Human Fighter INT 12: 16 SP at L1, 4 at L2-L4 = 28 total
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 8, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 3, hp: 8, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 4, hp: 8, abilityId: ctx.abilityMap["Strength"] },
      ],
      // Skills pool: total points per skill
      { [ctx.skillMap["Climb"]]: 7, [ctx.skillMap["Intimidate"]]: 7, [ctx.skillMap["Jump"]]: 7, [ctx.skillMap["Swim"]]: 7 },
      // Feats pool: 2 General at L1, 1 General at L3, FBF at L1/L2/L4
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"], ctx.featMap["Toughness"]],
        [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"], ctx.featMap["Combat Reflexes"]],
      },
      {},
      true,
    );

    expect(result).toHaveLength(4);

    const levels = await CharacterLevels.findMany(db, { characterId });
    expect(levels).toHaveLength(4);

    expect(result[3].abilityId).toBe(ctx.abilityMap["Strength"]);

    const allFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: result.map((l) => l.id) });
    expect(allFeats.some((f) => f.featId === ctx.featMap["Power Attack"])).toBe(true);
    expect(allFeats.some((f) => f.featId === ctx.featMap["Combat Reflexes"])).toBe(true);
  });

  test("should batch create levels with spells (Sorcerer)", async () => {
    const ctx = await getCtx();
    const characterId = await createSorcerer(ctx, 1000);

    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Sorcerer"], level: 1, hp: 4, abilityId: null },
        { klassId: ctx.klassMap.pc["Sorcerer"], level: 2, hp: 4, abilityId: null },
      ],
      { [ctx.skillMap["Bluff"]]: 5, [ctx.skillMap["Concentration"]]: 5, [ctx.skillMap["Spellcraft"]]: 5, [ctx.skillMap["Use Magic Device"]]: 5 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]] },
      {
        // Sorcerer L1: 4 cantrips + 2 L1 spells, L2: +1 cantrip = 5 cantrips + 2 L1 total
        [ctx.aptMap["Sorcerer Spells"]]: [
          ctx.powerMap["Detect Magic"], ctx.powerMap["Light"],
          ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
          ctx.powerMap["Resistance"],
          ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"],
        ],
      },
      true,
    );

    expect(result).toHaveLength(2);

    const allPowers = await CharacterLevelPowers.findMany(db, { characterLevelIds: result.map((l) => l.id) });
    expect(allPowers.length).toBe(7); // 5 cantrips + 2 L1 spells
    expect(allPowers.some((p) => p.powerId === ctx.powerMap["Magic Missile"])).toBe(true);
  });

  test("should reject ability increase at a non-increase level in batch", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);

    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: ctx.abilityMap["Strength"] }],
        { [ctx.skillMap["Climb"]]: 16 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      ),
    ).rejects.toThrow("Level 1: Ability increase is not available at this level");
  });

  test("should reject missing ability increase at batch level that requires it", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 6000);

    // Pre-level to L3
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

    // Batch L4 without ability increase — should fail
    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 4, hp: 8, abilityId: null }],
        { [ctx.skillMap["Climb"]]: 4 },
        { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Combat Reflexes"]] },
        {},
      ),
    ).rejects.toThrow("Level 1: Ability increase is required at this level");
  });

  test("should reject HP exceeding hit die in batch", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);

    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 11, abilityId: null }],
        { [ctx.skillMap["Climb"]]: 16 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      ),
    ).rejects.toThrow("HP must be between 1 and 10");
  });

  test("should reject already-finalized level in batch", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
    );

    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 8, abilityId: null }],
        {}, {}, {},
      ),
    ).rejects.toThrow("Level 1: This level has already been finalized");
  });

  test("should reject non-stackable feat picked twice in pool", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    // Power Attack appears in both General and FBF pools
    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [
          { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
          { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 8, abilityId: null },
        ],
        { [ctx.skillMap["Climb"]]: 20 },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Power Attack"]],
        },
        {},
      ),
    ).rejects.toThrow(BadRequestError);
  });

  test("should reject non-existent character", async () => {
    const ctx = await getCtx();
    const fakeId = "00000000-0000-0000-0000-000000000000";

    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, fakeId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null }],
        {}, {}, {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  test("should bypass validation with force=true", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Low Dex Fighter Batch", xp: 0,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: { Strength: 16, Dexterity: 8, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
      languages: ["Common"],
    });

    // Dodge requires Dex >= 13 but character has Dex 8 — force should bypass
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null }],
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Dodge"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
      true,
    );

    expect(result).toHaveLength(1);
    const feats = await CharacterLevelFeats.findMany(db, { characterLevelIds: [result[0].id] });
    expect(feats.some((f) => f.featId === ctx.featMap["Dodge"])).toBe(true);
  });

  test("should reject validation failure without force", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Low Dex Fighter Batch NoForce", xp: 0,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: { Strength: 16, Dexterity: 8, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
      languages: ["Common"],
    });

    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null }],
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Dodge"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
        false,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  test("should reject second level in batch when HP is invalid", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    // L1 valid (hp=10), L2 invalid (hp=999). Provide enough skills/feats to pass L1.
    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [
          { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
          { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 999, abilityId: null },
        ],
        { [ctx.skillMap["Climb"]]: 5, [ctx.skillMap["Intimidate"]]: 5, [ctx.skillMap["Jump"]]: 5, [ctx.skillMap["Swim"]]: 5 },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"]],
        },
        {},
      ),
    ).rejects.toThrow("HP must be between 1 and 10");
  });

  test("should validate per-level aptitudes and skills strictly on each batch level", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Strict Validation Fighter", xp: 6000,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: FIGHTER_ABILITIES, languages: ["Common"],
    });

    // Human Fighter: 2 General at L1, 1 at L3. All correctly filled.
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 8, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 3, hp: 8, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 4, hp: 8, abilityId: ctx.abilityMap["Strength"] },
      ],
      { [ctx.skillMap["Climb"]]: 7, [ctx.skillMap["Intimidate"]]: 7, [ctx.skillMap["Jump"]]: 7, [ctx.skillMap["Swim"]]: 7 },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
        [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"], ctx.featMap["Combat Reflexes"]],
      },
      {},
      false,
    );

    expect(result).toHaveLength(4);
  });

  test("should reject when fewer feats than required slots are provided", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Deferred Feat Fighter", xp: 1000,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: FIGHTER_ABILITIES, languages: ["Common"],
    });

    // Human L1 has 2 General slots — providing only 1 feat should fail
    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [
          { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
          { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 8, abilityId: null },
        ],
        { [ctx.skillMap["Climb"]]: 20 },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"]],
          [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"]],
        },
        {},
      ),
    ).rejects.toThrow("unspent");
  });

  test("should batch create Elf Fighter levels with correct per-level validation", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Elf", name: "Elf Batch", xp: 3000,
      alignment: "Chaotic Good", age: 120, gender: "Female",
      height: "165", weight: "55", description: "Test",
      abilities: { Strength: 10, Dexterity: 16, Constitution: 12, Intelligence: 14, Wisdom: 12, Charisma: 8 },
      languages: ["Common", "Elven"],
    });

    // Elf Fighter: (2+2 INT)=4/level, ×4 at L1. 1 General + 1 FBF at L1, 1 FBF at L2.
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 8, abilityId: null },
      ],
      { [ctx.skillMap["Climb"]]: 5, [ctx.skillMap["Intimidate"]]: 5, [ctx.skillMap["Jump"]]: 5, [ctx.skillMap["Swim"]]: 5 },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Dodge"]],
        [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Combat Reflexes"]],
      },
      {},
      false,
    );

    expect(result).toHaveLength(2);
  });

  test("should still reject overspent aptitudes", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);

    // 3 General feats but only 2 slots at L1 (1 base + 1 Human)
    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null }],
        { [ctx.skillMap["Climb"]]: 16 },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"], ctx.featMap["Toughness"]],
          [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]],
        },
        {},
        false,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  test("should batch create Cleric L1-L2 with domain feats", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Batch Cleric", xp: 1000,
      alignment: "Neutral Good", age: 30, gender: "Male",
      height: "175", weight: "75", description: "Test",
      abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 10 },
      languages: ["Common"],
    });

    // Human Cleric INT 12: SP [16, 4] = 20. Feats: General [2,0], Cleric Domain [2,0].
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Cleric"], level: 1, hp: 8, abilityId: null },
        { klassId: ctx.klassMap.pc["Cleric"], level: 2, hp: 6, abilityId: null },
      ],
      { [ctx.skillMap["Concentration"]]: 5, [ctx.skillMap["Heal"]]: 5, [ctx.skillMap["Spellcraft"]]: 5, [ctx.skillMap["Knowledge (Religion)"]]: 5 },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
        [ctx.aptMap["Cleric Domain"]]: [ctx.featMap["Healing Domain"], ctx.featMap["Sun Domain"]],
      },
      {},
      false,
    );

    expect(result).toHaveLength(2);

    const allFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: result.map((l) => l.id) });
    expect(allFeats.some((f) => f.featId === ctx.featMap["Healing Domain"])).toBe(true);
    expect(allFeats.some((f) => f.featId === ctx.featMap["Sun Domain"])).toBe(true);
  });

  test("should batch create Wizard L1 with specialization and prohibited schools", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Batch Wizard", xp: 0,
      alignment: "Neutral Good", age: 30, gender: "Female",
      height: "165", weight: "55", description: "Test",
      abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 16, Wisdom: 12, Charisma: 10 },
      languages: ["Common"],
    });

    // Human Wizard INT 16: SP=24. Feats: General [2], Wizard Specialization [1], NO Wizard Bonus Feat at L1.
    // Wizard Spells: 6 cantrips + 3 L1 spells = 9. Prohibited School is deferred (modifier-created).
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Wizard"], level: 1, hp: 4, abilityId: null }],
      {
        [ctx.skillMap["Spellcraft"]]: 4, [ctx.skillMap["Concentration"]]: 4,
        [ctx.skillMap["Knowledge (Arcana)"]]: 4, [ctx.skillMap["Decipher Script"]]: 4,
        [ctx.skillMap["Knowledge (Religion)"]]: 4, [ctx.skillMap["Knowledge (Nature)"]]: 4,
      },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
        [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Evocation Specialist"]],
        [ctx.aptMap["Prohibited School"]]: [ctx.featMap["Prohibit Illusion"], ctx.featMap["Prohibit Necromancy"]],
        [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
      },
      {
        [ctx.aptMap["Wizard Spells"]]: [
          ctx.powerMap["Detect Magic"], ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
          ctx.powerMap["Light"], ctx.powerMap["Ray of Frost"], ctx.powerMap["Resistance"],
          ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"], ctx.powerMap["Mage Armor"],
        ],
      },
      false,
    );

    expect(result).toHaveLength(1);

    const allFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: [result[0].id] });
    expect(allFeats.some((f) => f.featId === ctx.featMap["Evocation Specialist"])).toBe(true);
    expect(allFeats.some((f) => f.featId === ctx.featMap["Prohibit Illusion"])).toBe(true);
    expect(allFeats.some((f) => f.featId === ctx.featMap["Prohibit Necromancy"])).toBe(true);

    const allPowers = await CharacterLevelPowers.findMany(db, { characterLevelIds: [result[0].id] });
    expect(allPowers.some((p) => p.powerId === ctx.powerMap["Magic Missile"])).toBe(true);
  });

  test("should batch create multiclass Fighter/Wizard with prohibited schools", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Multiclass Wizard", xp: 3000,
      alignment: "Neutral Good", age: 30, gender: "Female",
      height: "165", weight: "55", description: "Test",
      abilities: { Strength: 10, Dexterity: 14, Constitution: 14, Intelligence: 16, Wisdom: 12, Charisma: 8 },
      languages: ["Common"],
    });

    // Fighter L1 first, then Wizard L1 — Prohibited School must still work
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
        { klassId: ctx.klassMap.pc["Wizard"], level: 1, hp: 4, abilityId: null },
      ],
      // Fighter L1: (2+3+1)×4=24, Wizard L1: 2+3+1=6. Total=30.
      {
        [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4,
        [ctx.skillMap["Swim"]]: 4, [ctx.skillMap["Spellcraft"]]: 4, [ctx.skillMap["Concentration"]]: 4,
        [ctx.skillMap["Knowledge (Arcana)"]]: 3, [ctx.skillMap["Handle Animal"]]: 3,
      },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
        [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]],
        [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Evocation Specialist"]],
        [ctx.aptMap["Prohibited School"]]: [ctx.featMap["Prohibit Illusion"], ctx.featMap["Prohibit Necromancy"]],
        [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
      },
      {
        [ctx.aptMap["Wizard Spells"]]: [
          ctx.powerMap["Detect Magic"], ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
          ctx.powerMap["Light"], ctx.powerMap["Ray of Frost"], ctx.powerMap["Resistance"],
          ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"], ctx.powerMap["Mage Armor"],
        ],
      },
      false,
    );

    expect(result).toHaveLength(2);

    const allFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: result.map((l) => l.id) });
    expect(allFeats.some((f) => f.featId === ctx.featMap["Evocation Specialist"])).toBe(true);
    expect(allFeats.some((f) => f.featId === ctx.featMap["Prohibit Illusion"])).toBe(true);
    expect(allFeats.some((f) => f.featId === ctx.featMap["Prohibit Necromancy"])).toBe(true);
  });

  test("should batch create Ranger L1-L2 with combat style feat", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Batch Ranger", xp: 1000,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "175", weight: "70", description: "Test",
      abilities: { Strength: 14, Dexterity: 16, Constitution: 12, Intelligence: 12, Wisdom: 14, Charisma: 8 },
      languages: ["Common"],
    });

    // Human Ranger INT 12: SP [32, 8] = 40. Feats: General [2,0], Ranger Combat Style [0,1].
    // 10 skills × 4 points = 40 to fill the budget.
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Ranger"], level: 1, hp: 8, abilityId: null },
        { klassId: ctx.klassMap.pc["Ranger"], level: 2, hp: 6, abilityId: null },
      ],
      {
        [ctx.skillMap["Hide"]]: 4, [ctx.skillMap["Move Silently"]]: 4, [ctx.skillMap["Spot"]]: 4,
        [ctx.skillMap["Listen"]]: 4, [ctx.skillMap["Survival"]]: 4, [ctx.skillMap["Climb"]]: 4,
        [ctx.skillMap["Swim"]]: 4, [ctx.skillMap["Search"]]: 4, [ctx.skillMap["Jump"]]: 4,
        [ctx.skillMap["Handle Animal"]]: 4,
      },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Point Blank Shot"], ctx.featMap["Precise Shot"]],
        [ctx.aptMap["Ranger Combat Style (2nd)"]]: [ctx.featMap["Rapid Shot"]],
        [ctx.aptMap["Favored Enemy"]]: [ctx.featMap["Favored Enemy: Humanoid (Goblinoid)"]],
      },
      {},
      false,
    );

    expect(result).toHaveLength(2);

    const allFeats = await CharacterLevelFeats.findMany(db, { characterLevelIds: result.map((l) => l.id) });
    expect(allFeats.some((f) => f.featId === ctx.featMap["Rapid Shot"])).toBe(true);
    expect(allFeats.some((f) => f.featId === ctx.featMap["Point Blank Shot"])).toBe(true);
  });

  test("should distribute skill points across levels respecting class-skill priority", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    // Human Fighter INT 12: L1=16 SP, L2=4 SP = 20 total
    // All class skills, 5 points each (rank 4 at L1, rank 1 at L2 = rank 5 total, within cap)
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 8, abilityId: null },
      ],
      {
        [ctx.skillMap["Climb"]]: 5,
        [ctx.skillMap["Intimidate"]]: 5,
        [ctx.skillMap["Jump"]]: 5,
        [ctx.skillMap["Swim"]]: 5,
      },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]],
        [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"]],
      },
      {},
      true,
    );

    expect(result).toHaveLength(2);

    const l1Skills = await CharacterLevelSkills.findMany(db, { characterLevelIds: [result[0].id] });
    const l2Skills = await CharacterLevelSkills.findMany(db, { characterLevelIds: [result[1].id] });

    // L1 should have skills allocated (class skills get priority, 16 SP budget)
    expect(l1Skills.length).toBeGreaterThan(0);
    // L2 should have overflow (rank caps push excess to L2)
    expect(l2Skills.length).toBeGreaterThan(0);

    // Total skill points across both levels should match the pool
    const totalPoints = [...l1Skills, ...l2Skills].reduce((sum, s) => sum + s.rank, 0);
    expect(totalPoints).toBe(20); // 5+5+5+5
  });

  test("should enforce intermediate rank caps during skill distribution", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    // Allocate 7 points to Climb across L1-L2.
    // Max rank at L1 = 4 (level 1 + 3), max rank at L2 = 5 (level 2 + 3).
    // So L1 gets at most 4 points (rank 4), L2 gets remaining 3 (rank 7 total → capped at 5).
    const result = await CharacterLevelsMethods.finalizeLevelUp(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: null },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2, hp: 8, abilityId: null },
      ],
      {
        [ctx.skillMap["Climb"]]: 5,
        [ctx.skillMap["Intimidate"]]: 5,
        [ctx.skillMap["Jump"]]: 5,
        [ctx.skillMap["Swim"]]: 5,
      },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]],
        [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"]],
      },
      {},
      false,
    );

    expect(result).toHaveLength(2);

    // Check L1 skill ranks don't exceed rank cap (level+3 = 4 for class skills)
    const l1Skills = await CharacterLevelSkills.findMany(db, { characterLevelIds: [result[0].id] });
    for (const skill of l1Skills) {
      expect(skill.rank).toBeLessThanOrEqual(4); // class skill max at character level 1
    }
  });
});

describe("getLevelUpPreview", () => {
  const session = createTestSession(SEED_USER_ID);
  let ctx: SeedContext;
  async function getCtx() {
    if (!ctx) ctx = await getSeedContext(db);
    return ctx;
  }

  test("should return preview data for a single Fighter level", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Fighter"], level: 1 }],
      [null],
    );

    expect(preview.skills.skillPointsToSpend).toBeGreaterThan(0);
    expect(preview.skills.skills.length).toBeGreaterThan(0);
    expect(preview.skills.totalCharacterLevel).toBe(1);
    expect(Object.keys(preview.feats.aptitudePools).length).toBeGreaterThan(0);
    expect(preview.levelDetails).toHaveLength(1);
    expect(preview.levelDetails[0].klassId).toBe(ctx.klassMap.pc["Fighter"]);
    expect(preview.levelDetails[0].level).toBe(1);
    expect(preview.levelDetails[0].hd).toBe(10);
  });

  test("should return correct ability increase levels for a 4-level batch", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 3 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 4 },
      ],
      [null, null, null, null],
    );

    expect(preview.attributes.abilityIncreaseLevels).toContain(3);
    expect(preview.attributes.abilityIncreaseLevels).not.toContain(0);
    expect(preview.levelDetails).toHaveLength(4);
    expect(preview.perLevelSkillPoints).toHaveLength(4);
    expect(preview.perLevelSkillPoints[0]).toBeGreaterThan(preview.perLevelSkillPoints[1]);
  });

  test("should return per-level skill points with first level multiplier", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2 },
      ],
      [null, null],
    );

    expect(preview.perLevelSkillPoints[0]).toBe(16);
    expect(preview.perLevelSkillPoints[1]).toBe(4);
  });

  test("should skip first-level multiplier when character has existing levels", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
    );

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Fighter"], level: 2 }],
      [null],
    );

    expect(preview.perLevelSkillPoints[0]).toBe(4);
  });

  test("should reject non-existent character", async () => {
    const ctx = await getCtx();
    const fakeId = "00000000-0000-0000-0000-000000000000";

    await expect(
      CharacterLevelsMethods.getLevelUpPreview(session, fakeId, [{ klassId: ctx.klassMap.pc["Fighter"], level: 1 }], [null]),
    ).rejects.toThrow(NotFoundError);
  });

  // The add-level wizard applies user-selected ability increases client-side
  // (attributeData / perLevelSkillPoints memos in useAddLevelWizard.ts). It
  // relies on the preview returning base attributes when no ability is
  // selected for a slot. If this invariant breaks, the wizard double-counts
  // the bump whenever the preview refetches (e.g., after adding a level
  // while an ability is already picked) and displays wrong totals.
  test("returns base attributes when all abilityIds are null, bumps only when specified", async () => {
    const ctx = await getCtx();
    // Fighter is built with INT 12. L4 grants an ability increase.
    const characterId = await createFighter(ctx);
    const levels = [
      { klassId: ctx.klassMap.pc["Fighter"], level: 1 },
      { klassId: ctx.klassMap.pc["Fighter"], level: 2 },
      { klassId: ctx.klassMap.pc["Fighter"], level: 3 },
      { klassId: ctx.klassMap.pc["Fighter"], level: 4 },
    ];

    const baselinePreview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId, levels, [null, null, null, null],
    );
    expect(baselinePreview.attributes.attributes["intelligence"].total).toBe(12);

    const bumpedPreview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId, levels,
      [null, null, null, ctx.abilityMap["Intelligence"]],
    );
    expect(bumpedPreview.attributes.attributes["intelligence"].total).toBe(13);
  });

  test("should return Sorcerer spell pools in preview", async () => {
    const ctx = await getCtx();
    const characterId = await createSorcerer(ctx);

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Sorcerer"], level: 1 }],
      [null],
    );

    const sorcererSpellPool = Object.values(preview.powers.aptitudePools).find(
      (p) => p.name === "Sorcerer Spells",
    );
    expect(sorcererSpellPool).toBeDefined();
    expect(sorcererSpellPool!.available).toBeGreaterThan(0);
    expect(sorcererSpellPool!.leveled).toBe(true);
  });

  test("should include Human racial bonus feat slot in perLevelFeatSlots", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 3 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 4 },
      ],
      [null, null, null, null],
    );

    // Human Fighter L1-L4: General feats = 2 at L1 (1 base + 1 Human), 0 at L2, 1 at L3, 0 at L4
    const generalPool = Object.entries(preview.feats.aptitudePools).find(([, p]) => p.name === "General");
    expect(generalPool).toBeDefined();
    const generalSlots = preview.perLevelFeatSlots[generalPool![0]];
    expect(generalSlots).toBeDefined();
    expect(generalSlots[0]).toBe(2); // L1: 1 base + 1 Human racial bonus
    expect(generalSlots[1]).toBe(0); // L2: no General feat
    expect(generalSlots[2]).toBe(1); // L3: 1 General feat
    expect(generalSlots[3]).toBe(0); // L4: no General feat
  });

  test("should show 1 General slot at L1 for non-Human", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Elf", name: "Elf Preview", xp: 0,
      alignment: "Chaotic Good", age: 120, gender: "Female",
      height: "165", weight: "55", description: "Test",
      abilities: { Strength: 10, Dexterity: 16, Constitution: 12, Intelligence: 14, Wisdom: 12, Charisma: 8 },
      languages: ["Common", "Elven"],
    });

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Fighter"], level: 1 }, { klassId: ctx.klassMap.pc["Fighter"], level: 2 }],
      [null, null],
    );

    const generalPool = Object.entries(preview.feats.aptitudePools).find(([, p]) => p.name === "General");
    expect(generalPool).toBeDefined();
    const generalSlots = preview.perLevelFeatSlots[generalPool![0]];
    expect(generalSlots[0]).toBe(1); // Elf: no racial bonus feat
    expect(generalSlots[1]).toBe(0);
  });

  test("should return correct Sorcerer spell slots per level", async () => {
    const ctx = await getCtx();
    const characterId = await createSorcerer(ctx);

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Sorcerer"], level: 1 }, { klassId: ctx.klassMap.pc["Sorcerer"], level: 2 }],
      [null, null],
    );

    const sorcSpells = Object.entries(preview.powers.aptitudePools).find(([, p]) => p.name === "Sorcerer Spells");
    expect(sorcSpells).toBeDefined();
    const slotsPerLevel = preview.perLevelPowerSlots[sorcSpells![1].id];
    expect(slotsPerLevel).toHaveLength(2);
    // L1: should have cantrip and 1st-level spell slots
    expect(slotsPerLevel[0]["0"]).toBeGreaterThan(0); // cantrips
    expect(slotsPerLevel[0]["1"]).toBeGreaterThan(0); // 1st-level spells
  });
});

describe("getAvailableFeatsGrouped — per-level prerequisite filtering", () => {
  const session = createTestSession(SEED_USER_ID);
  let ctx: SeedContext;
  async function getCtx() {
    if (!ctx) ctx = await getSeedContext(db);
    return ctx;
  }

  test("should filter feats by prerequisites at the specific batch level", async () => {
    const ctx = await getCtx();
    // Human character with high stats to meet ability prereqs
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Prereq Test", xp: 6000,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: { Strength: 14, Dexterity: 14, Constitution: 14, Intelligence: 14, Wisdom: 14, Charisma: 14 },
      languages: ["Common"],
    });

    // Get klassLevelIds from preview for pending level context
    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [{ klassId: ctx.klassMap.pc["Fighter"], level: 1 }],
      [null],
    );
    const klassLevelIds = preview.levelDetails.map((d) => d.klassLevelId);

    // Cleave requires: STR >= 13, Power Attack possessed
    // Query at Fighter L1 without Power Attack picked — Cleave should be ineligible
    const withoutPowerAttack = await CharacterLevelsMethods.getAvailableFeatsGrouped(
      session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
      { search: "Cleave", selectedFeatPicks: [], pendingLevelFeatPicks: [] },
      { limit: 20, page: 1 },
      undefined,
      klassLevelIds,
    );

    const cleaveWithout = withoutPowerAttack.items.find((g) => g.displayName === "Cleave");
    expect(cleaveWithout).toBeDefined();
    expect(cleaveWithout!.eligible).toBe(false);

    // Now query with Power Attack as a pending feat — Cleave should be eligible
    const withPowerAttack = await CharacterLevelsMethods.getAvailableFeatsGrouped(
      session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
      { search: "Cleave", selectedFeatPicks: [], pendingLevelFeatPicks: [{ featId: ctx.featMap["Power Attack"], aptitudeId: ctx.aptMap["General"] }] },
      { limit: 20, page: 1 },
      undefined,
      klassLevelIds,
    );

    const cleaveWith = withPowerAttack.items.find((g) => g.displayName === "Cleave");
    expect(cleaveWith).toBeDefined();
    expect(cleaveWith!.eligible).toBe(true);
  });

  test("should show different prerequisites met based on pending level count", async () => {
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "BAB Test", xp: 6000,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: { Strength: 14, Dexterity: 14, Constitution: 14, Intelligence: 14, Wisdom: 14, Charisma: 14 },
      languages: ["Common"],
    });

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 3 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 4 },
      ],
      [null, null, null, null],
    );

    const klassLevelIds = preview.levelDetails.map((d) => d.klassLevelId);

    // At Fighter L1 (only 1 pending level, BAB=1): Cleave needs Power Attack + STR 13
    const atL1 = await CharacterLevelsMethods.getAvailableFeatsGrouped(
      session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 1,
      { search: "Cleave", selectedFeatPicks: [], pendingLevelFeatPicks: [{ featId: ctx.featMap["Power Attack"], aptitudeId: ctx.aptMap["General"] }] },
      { limit: 20, page: 1 },
      undefined,
      [klassLevelIds[0]], // only Fighter L1 pending
    );

    // At Fighter L4 (4 pending levels, BAB=4): same query but with more context
    const atL4 = await CharacterLevelsMethods.getAvailableFeatsGrouped(
      session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 4,
      { search: "Cleave", selectedFeatPicks: [], pendingLevelFeatPicks: [{ featId: ctx.featMap["Power Attack"], aptitudeId: ctx.aptMap["General"] }] },
      { limit: 20, page: 1 },
      undefined,
      klassLevelIds, // all 4 Fighter levels pending
    );

    // Cleave should be available in both cases (BAB >= 1 met even at L1)
    const cleaveL1 = atL1.items.find((g) => g.displayName === "Cleave");
    const cleaveL4 = atL4.items.find((g) => g.displayName === "Cleave");
    expect(cleaveL1).toBeDefined();
    expect(cleaveL4).toBeDefined();
    expect(cleaveL1!.eligible).toBe(true);
    expect(cleaveL4!.eligible).toBe(true);
  });

  test("should respect ability increases when evaluating feat prerequisites", async () => {
    const ctx = await getCtx();
    // STR 12 character — Power Attack requires STR >= 13
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Ability Increase Test", xp: 6000,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: { Strength: 12, Dexterity: 14, Constitution: 14, Intelligence: 14, Wisdom: 14, Charisma: 14 },
      languages: ["Common"],
    });

    const preview = await CharacterLevelsMethods.getLevelUpPreview(
      session, characterId,
      [
        { klassId: ctx.klassMap.pc["Fighter"], level: 1 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 2 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 3 },
        { klassId: ctx.klassMap.pc["Fighter"], level: 4 },
      ],
      [null, null, null, null],
    );
    const klassLevelIds = preview.levelDetails.map((d) => d.klassLevelId);

    // Without ability increase: STR 12 → Power Attack ineligible
    const withoutIncrease = await CharacterLevelsMethods.getAvailableFeatsGrouped(
      session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 4,
      { search: "Power Attack", selectedFeatPicks: [], pendingLevelFeatPicks: [] },
      { limit: 20, page: 1 },
      undefined,
      klassLevelIds,
    );
    const paWithout = withoutIncrease.items.find((g) => g.displayName === "Power Attack");
    expect(paWithout).toBeDefined();
    expect(paWithout!.eligible).toBe(false);

    // With STR +1 at level 4: STR 13 → Power Attack eligible
    const withIncrease = await CharacterLevelsMethods.getAvailableFeatsGrouped(
      session, characterId, ctx.aptMap["General"], ctx.klassMap.pc["Fighter"], 4,
      { search: "Power Attack", selectedFeatPicks: [], pendingLevelFeatPicks: [] },
      { limit: 20, page: 1 },
      undefined,
      klassLevelIds,
      [undefined, undefined, undefined, ctx.abilityMap["Strength"]],
    );
    const paWith = withIncrease.items.find((g) => g.displayName === "Power Attack");
    expect(paWith).toBeDefined();
    expect(paWith!.eligible).toBe(true);
  });
});

describe("updateLevel — downstream dependency protection", () => {
  const session = createTestSession(SEED_USER_ID);
  let ctx: SeedContext;
  async function getCtx() {
    if (!ctx) ctx = await getSeedContext(db);
    return ctx;
  }

  test("should reject removing a feat that a later level depends on", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 3000);

    // L1: Power Attack + Great Fortitude (General), Improved Initiative (FBF)
    await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
    );

    // L2: Cleave (FBF) — requires Power Attack
    await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
      { [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Jump"]]: 1, [ctx.skillMap["Swim"]]: 1 },
      { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Cleave"]] },
      {},
    );

    // Get L1's character level ID
    const levels = await CharacterLevels.findMany(db, { characterId });
    const l1 = levels.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    // Edit L1: replace Power Attack with Toughness — should fail because Cleave requires Power Attack
    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1.id, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      ),
    ).rejects.toThrow("Unmet prerequisite");
  });

  test("should reject editing skills beyond rank cap for that level", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    // L1: 4 ranks in Climb (max rank at L1 = 4)
    await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
    );

    const levels = await CharacterLevels.findMany(db, { characterId });
    const l1 = levels[0];

    // Edit L1: try to put 8 ranks in Climb (max is 4 at character level 1)
    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1.id, 10, null,
        { [ctx.skillMap["Climb"]]: 8, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      ),
    ).rejects.toThrow("rank");
  });

  test("should reject edit that breaks a prestige class requirement", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 10000);

    // L1-L4: Fighter with feats
    for (let i = 1; i <= 4; i++) {
      const isFirst = i === 1;
      const skillPoints = isFirst
        ? { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 }
        : { [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Jump"]]: 1, [ctx.skillMap["Swim"]]: 1 };
      const feats: Record<string, string[]> = {};
      if (i === 1) {
        feats[ctx.aptMap["General"]] = [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]];
        feats[ctx.aptMap["Fighter Bonus Feat"]] = [ctx.featMap["Improved Initiative"]];
      } else if (i === 2) {
        feats[ctx.aptMap["Fighter Bonus Feat"]] = [ctx.featMap["Cleave"]];
      } else if (i === 3) {
        feats[ctx.aptMap["General"]] = [ctx.featMap["Toughness"]];
      } else {
        feats[ctx.aptMap["Fighter Bonus Feat"]] = [ctx.featMap["Dodge"]];
      }
      await addOneLevel(
        session, characterId, ctx.klassMap.pc["Fighter"], i, isFirst ? 10 : 8,
        i === 4 ? ctx.abilityMap["Strength"] : null,
        skillPoints, feats, {},
      );
    }

    // Verify L2 has Cleave
    const levels = await CharacterLevels.findMany(db, { characterId });
    const sorted = levels.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const l1 = sorted[0];

    // Edit L1: remove Power Attack → Cleave at L2 should fail (requires Power Attack)
    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1.id, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Iron Will"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      ),
    ).rejects.toThrow("Unmet prerequisite");
  });

  test("rejects re-saving Fighter L1 with the Fighter Bonus Feat slot left empty", async () => {
    // Regression: the filter's withLevel projection used to skip `givenFeats`,
    // so feat-modifier-granted pools (Fighter Bonus Feat, Wizard Bonus Feat, …)
    // came out with allowed=0 — same as baseline — and were never added to
    // ownedPoolNames. updateLevel then silently dropped real under-pick issues
    // on those pools and committed an unbalanced level.
    const ctx = await getCtx();
    const characterId = await createFighter(ctx, 1000);

    await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
    );

    const [l1] = await CharacterLevels.findMany(db, { characterId });

    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1.id, 10, null,
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Fighter Bonus Feat"]]: [],
        },
        {},
      ),
    ).rejects.toThrow(/Fighter Bonus Feat.*unspent/);
  });

  test("rejects re-saving Wizard L1 with the Prohibited School slots left empty (modifier from a user-picked feat)", async () => {
    // Regression: the filter's withLevel projection knows about givenFeats
    // (auto-grants) but not the user's submitted feats. Selectable feats
    // carrying aptitudes.<x>.allowed modifiers — Wizard specializations
    // (+2 Prohibited School), Feat (Rogue Special Ability) (+1 General),
    // War Domain (+1 War Domain Weapon) — won't push their pool into
    // ownedPoolNames if only givenFeats is loaded. Under-pick issues on
    // those pools then get filtered out and the save silently commits.
    //
    // Frontend's adjustedFeatPools (useLevelWizard.ts) tracks these
    // dynamically and shows the slot to the user, but doesn't prevent
    // submit, so the backend has to enforce it.
    const ctx = await getCtx();
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Wizard Edit", xp: 0,
      alignment: "Neutral Good", age: 30, gender: "Female",
      height: "165", weight: "55", description: "Test",
      abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 16, Wisdom: 12, Charisma: 10 },
      languages: ["Common"],
    });

    await addOneLevel(
      session, characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      {
        [ctx.skillMap["Spellcraft"]]: 4, [ctx.skillMap["Concentration"]]: 4,
        [ctx.skillMap["Knowledge (Arcana)"]]: 4, [ctx.skillMap["Decipher Script"]]: 4,
        [ctx.skillMap["Knowledge (Religion)"]]: 4, [ctx.skillMap["Knowledge (Nature)"]]: 4,
      },
      {
        [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
        [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Evocation Specialist"]],
        [ctx.aptMap["Prohibited School"]]: [ctx.featMap["Prohibit Illusion"], ctx.featMap["Prohibit Necromancy"]],
        [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
      },
      {
        [ctx.aptMap["Wizard Spells"]]: [
          ctx.powerMap["Detect Magic"], ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
          ctx.powerMap["Light"], ctx.powerMap["Ray of Frost"], ctx.powerMap["Resistance"],
          ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"], ctx.powerMap["Mage Armor"],
        ],
      },
    );

    const [l1] = await CharacterLevels.findMany(db, { characterId });

    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1.id, 4, null,
        {
          [ctx.skillMap["Spellcraft"]]: 4, [ctx.skillMap["Concentration"]]: 4,
          [ctx.skillMap["Knowledge (Arcana)"]]: 4, [ctx.skillMap["Decipher Script"]]: 4,
          [ctx.skillMap["Knowledge (Religion)"]]: 4, [ctx.skillMap["Knowledge (Nature)"]]: 4,
        },
        {
          [ctx.aptMap["General"]]: [ctx.featMap["Toughness"], ctx.featMap["Great Fortitude"]],
          [ctx.aptMap["Wizard Specialization"]]: [ctx.featMap["Evocation Specialist"]],
          [ctx.aptMap["Prohibited School"]]: [],
          [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Cat Familiar"]],
        },
        {
          [ctx.aptMap["Wizard Spells"]]: [
            ctx.powerMap["Detect Magic"], ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
            ctx.powerMap["Light"], ctx.powerMap["Ray of Frost"], ctx.powerMap["Resistance"],
            ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"], ctx.powerMap["Mage Armor"],
          ],
        },
      ),
    ).rejects.toThrow(/Prohibited School.*unspent/);
  });
});

describe("ability increase position validation — reproduction guards", () => {
  // Locks down every save path that could write `abilityId` to a non-bump
  // character level. Prod data has rows where this happened before the
  // save-side validation existed (commit da8c414e, 2026-04-06); these tests
  // confirm the same shape can't be re-introduced through current code.
  const session = createTestSession(SEED_USER_ID);
  let ctx: SeedContext;
  async function getCtx() {
    if (!ctx) ctx = await getSeedContext(db);
    return ctx;
  }

  async function buildFighterL1L2(ctx: SeedContext) {
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Ability Guard", xp: 1000,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "180", weight: "80", description: "Test",
      abilities: FIGHTER_ABILITIES, languages: ["Common"],
    });
    const l1 = await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 1, 10, null,
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
    );
    const l2 = await addOneLevel(
      session, characterId, ctx.klassMap.pc["Fighter"], 2, 8, null,
      { [ctx.skillMap["Climb"]]: 1, [ctx.skillMap["Intimidate"]]: 1, [ctx.skillMap["Jump"]]: 1, [ctx.skillMap["Swim"]]: 1 },
      { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Dodge"]] },
      {},
    );
    return { characterId, l1Id: l1.id, l2Id: l2.id };
  }

  test("updateLevel rejects abilityId on a non-bump level (no force)", async () => {
    const ctx = await getCtx();
    const { characterId, l1Id } = await buildFighterL1L2(ctx);
    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1Id, 10, ctx.abilityMap["Strength"],
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      ),
    ).rejects.toThrow("Ability increase is not available at this level");
  });

  test("updateLevel rejects abilityId on a non-bump level even with force=true", async () => {
    // The wizard's "Proceed Anyway" / force flag bypasses validate() but
    // must NOT bypass the ability-position check (the check is unconditional
    // by design — finalize.ts:120 has no `if (!force)` guard).
    const ctx = await getCtx();
    const { characterId, l1Id } = await buildFighterL1L2(ctx);
    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1Id, 10, ctx.abilityMap["Strength"],
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
        true,
      ),
    ).rejects.toThrow("Ability increase is not available at this level");
  });

  test("updateLevel rejects re-save of a polluted level (legacy abilityId on non-bump row)", async () => {
    // Reproduces Elminster's prod state: legacy pollution leaves an abilityId
    // on a level that isn't a bump position. The edit dialog pre-populates
    // `selectedAttribute` from the stored value and submits it unchanged on
    // save. Current code MUST reject — that's how the pollution stops
    // perpetuating (and how the user is forced to fix it by clearing the
    // attribute or downgrading the level).
    const ctx = await getCtx();
    const { characterId, l1Id } = await buildFighterL1L2(ctx);

    // Simulate legacy pollution by writing abilityId directly to the L1 row,
    // bypassing the service layer the way pre-2026-04-06 saves did.
    await db.update(levelsInCharacter)
      .set({ abilityId: ctx.abilityMap["Strength"] })
      .where(eq(levelsInCharacter.id, l1Id));

    await expect(
      CharacterLevelsMethods.updateLevel(
        session, characterId, l1Id, 10, ctx.abilityMap["Strength"],
        { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
      ),
    ).rejects.toThrow("Ability increase is not available at this level");
  });

  test("updateLevel accepts clearing a polluted abilityId by passing null", async () => {
    // The escape hatch: re-saving the level with abilityId=null lets users
    // clean up the legacy pollution themselves through the UI.
    const ctx = await getCtx();
    const { characterId, l1Id } = await buildFighterL1L2(ctx);
    await db.update(levelsInCharacter)
      .set({ abilityId: ctx.abilityMap["Strength"] })
      .where(eq(levelsInCharacter.id, l1Id));

    await CharacterLevelsMethods.updateLevel(
      session, characterId, l1Id, 10, null,
      { [ctx.skillMap["Climb"]]: 4, [ctx.skillMap["Intimidate"]]: 4, [ctx.skillMap["Jump"]]: 4, [ctx.skillMap["Swim"]]: 4 },
      { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
      {},
    );
    const refreshed = await CharacterLevels.findOne(db, { id: l1Id });
    expect(refreshed?.abilityId).toBeNull();
  });

  test("finalizeLevelUp batch rejects abilityId on a non-bump level even with force=true", async () => {
    const ctx = await getCtx();
    const characterId = await createFighter(ctx);
    await expect(
      CharacterLevelsMethods.finalizeLevelUp(
        session, characterId,
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10, abilityId: ctx.abilityMap["Strength"] }],
        { [ctx.skillMap["Climb"]]: 16 },
        { [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]], [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"]] },
        {},
        true,
      ),
    ).rejects.toThrow("Level 1: Ability increase is not available at this level");
  });
});
