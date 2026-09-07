import { and, eq } from "drizzle-orm";
import {
  charactersInCharacter,
  featsInRules,
  powersInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import {
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { refreshEntityData } from "@/server/services/rulesets/cow.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import {
  addClassLevels,
  addFeats,
  addPowers,
  createCharacter,
  getSeedContext,
} from "@/database/seeds/helpers.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { describe, expect, test } from "bun:test";

// ── Helpers ──

async function createTestUser() {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const users = await Users.create(db, {
    username: `testuser-cow-${uniqueId}`,
    emailAddress: `test-cow-${uniqueId}@example.com`,
    password: "password1234",
  });
  const user = users[0];
  const [session] = await Sessions.create(db, { userId: user.id });
  return { user, session };
}

// ── Unit tests for refreshEntityData ──

describe("refreshEntityData", () => {
  test("refreshes data fields from reference data by ID", () => {
    const rows = [
      { id: "a", name: "old-name", description: "old-desc", extra: 42 },
      { id: "b", name: "keep-name", description: "keep-desc", extra: 99 },
    ];
    const referenceData = [
      { id: "a", name: "new-name", description: "new-desc" },
    ];

    const result = refreshEntityData(rows, referenceData, ["name", "description"]);

    expect(result[0].name).toBe("new-name");
    expect(result[0].description).toBe("new-desc");
    expect(result[0].extra).toBe(42);
    expect(result[1].name).toBe("keep-name");
    expect(result[1].description).toBe("keep-desc");
  });

  test("returns rows unchanged when reference data is empty", () => {
    const rows = [{ id: "a", name: "original" }];
    const result = refreshEntityData(rows, [], ["name"]);
    expect(result).toEqual(rows);
  });

  test("returns rows unchanged when keys array is empty", () => {
    const rows = [{ id: "a", name: "original" }];
    const referenceData = [{ id: "a", name: "new" }];
    const result = refreshEntityData(rows, referenceData, []);
    expect(result).toEqual(rows);
  });

  test("only refreshes specified keys, leaving others untouched", () => {
    const rows = [{ id: "a", name: "old", description: "old-desc", stackable: false }];
    const referenceData = [{ id: "a", name: "new", description: "new-desc", stackable: true }];

    const result = refreshEntityData(rows, referenceData, ["description"]);

    expect(result[0].name).toBe("old");
    expect(result[0].description).toBe("new-desc");
    expect(result[0].stackable).toBe(false);
  });

  test("handles rows with no matching reference data gracefully", () => {
    const rows = [
      { id: "a", name: "name-a" },
      { id: "b", name: "name-b" },
    ];
    const referenceData = [{ id: "c", name: "name-c" }];

    const result = refreshEntityData(rows, referenceData, ["name"]);

    expect(result[0].name).toBe("name-a");
    expect(result[1].name).toBe("name-b");
  });
});

// ── Integration tests: overridden descriptions in DetailedCharacter ──

describe("COW override descriptions in DetailedCharacter", () => {
  test("overridden feat description is displayed on the character sheet", async () => {
    const { user, session } = await createTestUser();
    const fork = await createSeededTestRuleset(user.id);
    invalidateAll();

    // Get the SRD seed context for entity IDs, override rulesetId to the fork
    const ctx = await getSeedContext(db);
    const forkCtx = { ...ctx, rulesetId: fork.id };

    // Find the "Toughness" feat from the SRD
    const [toughness] = await db
      .select({ id: featsInRules.id, description: featsInRules.description })
      .from(featsInRules)
      .where(and(eq(featsInRules.name, "Toughness"), eq(featsInRules.rulesetId, ctx.rulesetId)));

    const originalDescription = toughness.description;

    // Override Toughness description in the fork (triggers COW)
    const overriddenDescription = "You gain +3 hit points. [OVERRIDDEN IN FORK]";
    await FeatsMethods.updateRulesetFeat(session, fork.id, toughness.id, {
      name: "Toughness",
      description: overriddenDescription,
    });
    invalidateAll();

    // Create a minimal character in the fork: Human Fighter 1 with Toughness
    const characterId = await createCharacter(db, forkCtx, {
      raceName: "Human",
      name: "COW Feat Test Character",
      xp: 0,
      alignment: "True Neutral",
      age: 25,
      gender: "Male",
      height: "180",
      weight: "80",
      description: "Test",
      abilities: {
        Strength: 14, Dexterity: 12, Constitution: 14,
        Intelligence: 10, Wisdom: 10, Charisma: 10,
      },
      languages: ["Common"],
    });

    const levelIds = await addClassLevels(db, forkCtx, characterId, "Fighter", [1], [10]);
    await addFeats(db, forkCtx, levelIds, [
      { levelIndex: 0, featName: "Toughness", aptitude: "General" },
    ]);

    // Build the character and extract feats
    const [character] = await db
      .select()
      .from(charactersInCharacter)
      .where(eq(charactersInCharacter.id, characterId));

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const classes = detailedCharacter.getDetailedCharacterClasses().getCharacterClasses();
    const allFeats = Object.values(classes).flatMap((klass) =>
      klass.levels.flatMap((level) => level.feats),
    );
    const toughnessFeat = allFeats.find((f) => f.name === "Toughness");

    expect(toughnessFeat).toBeDefined();
    expect(toughnessFeat!.description).not.toBe(originalDescription);
    expect(toughnessFeat!.description).toBe(overriddenDescription);
  });

  test("overridden power description is displayed on the character sheet", async () => {
    const { user, session } = await createTestUser();
    const fork = await createSeededTestRuleset(user.id);
    invalidateAll();

    const ctx = await getSeedContext(db);
    const forkCtx = { ...ctx, rulesetId: fork.id };

    // Find "Magic Missile" from the SRD
    const [magicMissile] = await db
      .select({ id: powersInRules.id, description: powersInRules.description })
      .from(powersInRules)
      .where(and(eq(powersInRules.name, "Magic Missile"), eq(powersInRules.rulesetId, ctx.rulesetId)));

    const originalDescription = magicMissile.description;

    // Override Magic Missile description in the fork (triggers COW)
    const overriddenDescription = "A missile of magical energy darts forth. [OVERRIDDEN IN FORK]";
    await PowersMethods.updateRulesetPower(session, fork.id, magicMissile.id, {
      name: "Magic Missile",
      description: overriddenDescription,
    });
    invalidateAll();

    // Create a minimal character in the fork: Elf Wizard 1 with Magic Missile
    const characterId = await createCharacter(db, forkCtx, {
      raceName: "Elf",
      name: "COW Power Test Character",
      xp: 0,
      alignment: "True Neutral",
      age: 120,
      gender: "Female",
      height: "165",
      weight: "50",
      description: "Test",
      abilities: {
        Strength: 8, Dexterity: 14, Constitution: 10,
        Intelligence: 18, Wisdom: 12, Charisma: 10,
      },
      languages: ["Common", "Elven"],
    });

    const levelIds = await addClassLevels(db, forkCtx, characterId, "Wizard", [1], [4]);
    await addPowers(db, forkCtx, levelIds, [
      { levelIndex: 0, powerName: "Magic Missile", aptitude: "Wizard Spells" },
    ]);

    // Build the character and extract powers
    const [character] = await db
      .select()
      .from(charactersInCharacter)
      .where(eq(charactersInCharacter.id, characterId));

    const detailedCharacter = new DetailedCharacter(character);
    await detailedCharacter.build();

    const classes = detailedCharacter.getDetailedCharacterClasses().getCharacterClasses();
    const allPowers = Object.values(classes).flatMap((klass) =>
      klass.levels.flatMap((level) => level.powers),
    );
    const magicMissilePower = allPowers.find((p) => p.name === "Magic Missile");

    expect(magicMissilePower).toBeDefined();
    expect(magicMissilePower!.description).not.toBe(originalDescription);
    expect(magicMissilePower!.description).toBe(overriddenDescription);
  });
});
