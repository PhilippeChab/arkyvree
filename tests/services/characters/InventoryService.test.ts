import { CharacterInventoryMethods } from "@/server/services/characters/CharacterInventoryService.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { db } from "@/server/database/index.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { Items, Modifiers, Requirements, Rulesets, Users, Races, Properties } from "@/server/repositories/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("InventoryService", () => {
  let seedCtx: SeedContext;

  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

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

  async function createTestCharacter(session: Session, raceId?: string) {
    const ctx = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);
    return await CharactersMethods.createCharacter(session, {
      rulesetId: ctx.rulesetId,
      raceId: raceId ?? ctx.raceMap.pc["Human"],
      name: `Test Character ${uniqueId}`,
      xp: 0,
      alignment: "Lawful Good",
      abilities: {},
      age: 25,
      gender: "Male",
      height: "6'0\"",
      weight: "180 lbs",
    });
  }

  async function createTestItem(
    overrides?: { name?: string; type?: string | null },
  ) {
    const ctx = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const items = await Items.create(db, {
      rulesetId: ctx.rulesetId,
      name: overrides?.name ?? `Test Item ${uniqueId}`,
      description: "Test item for inventory testing",
      weight: "5",
      costGp: "10",
      type: overrides?.type,
    });
    invalidateRuleset(ctx.rulesetId);
    return items[0];
  }

  async function setupTestData() {
    const { session } = await createTestUser();
    const character = await createTestCharacter(session);
    const item = await createTestItem();
    return { session, character, item };
  }

  describe("getInventory", () => {
    test("should return empty array for character with no inventory", async () => {
      const { session, character } = await setupTestData();

      const result = await CharacterInventoryMethods.getInventory(session, character.id);

      expect(result).toEqual([]);
    });

    test("should return inventory entries with item details", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 3, false, null, null, null, null);

      const result = await CharacterInventoryMethods.getInventory(session, character.id);

      expect(result.length).toBe(1);
      expect(result[0].quantity).toBe(3);
      expect(result[0].equipped).toBe(false);
      expect(result[0].item).toBeDefined();
      expect(result[0].item.name).toBe(item.name);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session } = await createTestUser();

      await expect(
        CharacterInventoryMethods.getInventory(session, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when accessing another user's character", async () => {
      const { character } = await setupTestData();
      const { session: otherSession } = await createTestUser();

      await expect(
        CharacterInventoryMethods.getInventory(otherSession, character.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("should return items with properties, modifiers, and requirements", async () => {
      const ctx = await getCtx();
      const { session, character, item } = await setupTestData();

      // Add property, modifier, and requirement to the item
      await Properties.create(db, {
        entityId: item.id,
        entityType: "items",
        type: "WEAPON_PROFICIENCY",
        value: "Martial",
      });
      await Modifiers.create(db, {
        sourceId: item.id,
        sourceType: "items",
        target: "combat.bab",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      await Requirements.create(db, {
        entityId: item.id,
        entityType: "items",
        level: "1",
        target: "abilities.strength.misc",
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
      invalidateRuleset(ctx.rulesetId);

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      const result = await CharacterInventoryMethods.getInventory(session, character.id);

      expect(result.length).toBe(1);
      expect(result[0].item.properties.length).toBe(1);
      expect(result[0].item.properties[0].type).toBe("WEAPON_PROFICIENCY");
      expect(result[0].item.modifiers.length).toBe(1);
      expect(result[0].item.modifiers[0].target).toBe("combat.bab");
      expect(result[0].item.requirements.length).toBe(1);
      expect(result[0].item.requirements[0].target).toBe("abilities.strength.misc");
    });

    test("should not return removed items", async () => {
      const { session, character, item } = await setupTestData();
      const item2 = await createTestItem();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);
      await CharacterInventoryMethods.addItem(session, character.id, item2.id, 1, false, null, null, null, null);
      await CharacterInventoryMethods.removeItem(session, character.id, item.id);

      const result = await CharacterInventoryMethods.getInventory(session, character.id);

      expect(result.length).toBe(1);
      expect(result[0].itemId).toBe(item2.id);
    });
  });

  describe("addItem", () => {
    test("should add item to inventory", async () => {
      const { session, character, item } = await setupTestData();

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, item.id, 5, false, null, null, null, null,
      );

      expect(result).toBeDefined();
      expect(result.characterId).toBe(character.id);
      expect(result.itemId).toBe(item.id);
      expect(result.quantity).toBe(5);
      expect(result.equipped).toBe(false);
      expect(result.location).toBeNull();
    });

    test("should add equipped item with location", async () => {
      const { session, character, item } = await setupTestData();

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, item.id, 1, true, "Trinket", null, null, null,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Trinket");
    });

    test("should add item with charges", async () => {
      const { session, character, item } = await setupTestData();

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, item.id, 1, false, null, 50, 50, null,
      );

      expect(result.totalCharges).toBe(50);
      expect(result.remainingCharges).toBe(50);
    });

    test("should clear location when not equipped", async () => {
      const { session, character, item } = await setupTestData();

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, item.id, 1, false, "Trinket", null, null, null,
      );

      expect(result.equipped).toBe(false);
      expect(result.location).toBeNull();
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session, item } = await setupTestData();

      await expect(
        CharacterInventoryMethods.addItem(
          session, "00000000-0000-0000-0000-000000000000", item.id, 1, false, null, null, null, null,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent item", async () => {
      const { session, character } = await setupTestData();

      await expect(
        CharacterInventoryMethods.addItem(
          session, character.id, "00000000-0000-0000-0000-000000000000", 1, false, null, null, null, null,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw BadRequestError when item already in inventory", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null),
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw BadRequestError when remaining charges exceed total", async () => {
      const { session, character, item } = await setupTestData();

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, 10, 20, null),
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw BadRequestError for item from different ruleset", async () => {
      const { session, character } = await setupTestData();
      const { user: otherUser, session: otherSession } = await createTestUser();
      const otherRulesets = await Rulesets.create(db, {
        name: `Other Ruleset ${Math.random().toString(36).substr(2, 9)}`,
        description: "Unrelated ruleset",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: otherUser.id,
      });
      const otherItem = await ItemsMethods.createRulesetItem(otherSession, otherRulesets[0].id, {
        name: `Other Item ${Math.random().toString(36).substr(2, 9)}`,
        description: "Item from different ruleset",
        weight: 5,
        costGp: 10,
      });

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, otherItem.id, 1, false, null, null, null, null),
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw NotFoundError when another user tries to add", async () => {
      const { character, item } = await setupTestData();
      const { session: otherSession } = await createTestUser();

      await expect(
        CharacterInventoryMethods.addItem(otherSession, character.id, item.id, 1, false, null, null, null, null),
      ).rejects.toThrow(NotFoundError);
    });

    test("accepts an item inherited via a multi-level chain (built directly in DB)", async () => {
      // The API blocks fork-of-fork via canFork, but addItem's lineage check
      // should still walk the full source chain if a deeper chain ever exists
      // in the DB. Build the chain directly via Rulesets.create and assert
      // an item defined at the root is accepted on the leaf.
      const { user, session } = await createTestUser();
      const { user: grandparentUser } = await createTestUser();
      const uniqueId = Math.random().toString(36).slice(2, 9);

      const grandparentRulesets = await Rulesets.create(db, {
        name: `Grandparent ${uniqueId}`,
        description: "Three-level chain root",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: grandparentUser.id,
      });
      const grandparent = grandparentRulesets[0];
      await Rulesets.update(db, { status: "Published" }, { id: grandparent.id });

      const races = await Races.create(db, {
        rulesetId: grandparent.id,
        name: `GP Race ${uniqueId}`,
        description: "GP race",
        size: "Medium",
        baseSpeed: 30,
      });
      const race = races[0];

      const items = await Items.create(db, {
        rulesetId: grandparent.id,
        name: `GP Item ${uniqueId}`,
        description: "Defined in grandparent, inherited transitively",
        weight: "1",
        costGp: "5",
      });
      const item = items[0];

      const parents = await Rulesets.create(db, {
        name: `Parent ${uniqueId}`,
        description: "Direct fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: grandparentUser.id,
        rulesetId: grandparent.id,
        ancestorRulesetIds: [grandparent.id],
      });
      const parent = parents[0];
      await Rulesets.update(db, { status: "Published" }, { id: parent.id });

      const grandchildRulesets = await Rulesets.create(db, {
        name: `Grandchild ${uniqueId}`,
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
        xp: 0, alignment: "Neutral Good", abilities: {},
        age: 25, gender: "Male", height: "6'0\"", weight: "180 lbs",
      });

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, item.id, 1, false, null, null, null, null,
      );
      expect(result).toBeDefined();
      expect(result.itemId).toBe(item.id);
    });

    test("should throw BadRequestError when equipping to occupied single slot", async () => {
      const { session, character, item } = await setupTestData();
      const item2 = await createTestItem();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Head", null, null, null);

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item2.id, 1, true, "Head", null, null, null),
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw BadRequestError when equipping two-handed with main hand occupied", async () => {
      const { session, character, item } = await setupTestData();
      const item2 = await createTestItem();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Main Hand", null, null, 0);

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item2.id, 1, true, "Two Handed", null, null, 0),
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw BadRequestError when equipping main hand with two-handed occupied", async () => {
      const { session, character, item } = await setupTestData();
      const item2 = await createTestItem();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Two Handed", null, null, 0);

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item2.id, 1, true, "Main Hand", null, null, 0),
      ).rejects.toThrow(BadRequestError);
    });

    test("should allow up to 2 finger items", async () => {
      const { session, character, item } = await setupTestData();
      const item2 = await createTestItem();
      const item3 = await createTestItem();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Finger", null, null, null);
      await CharacterInventoryMethods.addItem(session, character.id, item2.id, 1, true, "Finger", null, null, null);

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item3.id, 1, true, "Finger", null, null, null),
      ).rejects.toThrow(BadRequestError);
    });

    test("should reject equipping to hand slot without weaponSet", async () => {
      const { session, character, item } = await setupTestData();

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Main Hand", null, null, null),
      ).rejects.toThrow("A weapon set is required when equipping to a hand slot");
    });

    test("should reject equipping shield to Off Hand without weaponSet", async () => {
      const { session, character } = await setupTestData();
      const shield = await createTestItem({ type: "Shield" });

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, shield.id, 1, true, "Off Hand", null, null, null),
      ).rejects.toThrow("A weapon set is required when equipping to a hand slot");
    });

    test("should reject equipping item with unmet requirements when force is false", async () => {
      const ctx = await getCtx();
      const { session, character } = await setupTestData();
      const armor = await createTestItem({ type: "Armor" });

      // Add a requirement the character cannot meet (STR 30)
      await Requirements.create(db, {
        entityId: armor.id,
        entityType: "items",
        level: "1",
        target: "abilities.strength.misc",
        value: "30",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
      invalidateRuleset(ctx.rulesetId);

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, armor.id, 1, true, "Torso", null, null, null, false),
      ).rejects.toThrow(BadRequestError);
    });

    test("should allow equipping item with unmet requirements when force is true", async () => {
      const { session, character } = await setupTestData();
      const armor = await createTestItem({ type: "Armor" });

      // Add a requirement the character cannot meet (STR 30)
      await Requirements.create(db, {
        entityId: armor.id,
        entityType: "items",
        level: "1",
        target: "abilities.strength.misc",
        value: "30",
        valueType: "number",
        operator: "greater_than_or_equal",
      });

      // force: true should bypass the requirement check
      const result = await CharacterInventoryMethods.addItem(
        session, character.id, armor.id, 1, true, "Torso", null, null, null, true,
      );

      expect(result).toBeDefined();
      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Torso");
    });
  });

  describe("updateItem", () => {
    test("should update quantity", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      const result = await CharacterInventoryMethods.updateItem(
        session, character.id, item.id, 10, false, null, null, null, null,
      );

      expect(result.quantity).toBe(10);
    });

    test("should equip and set location", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      const result = await CharacterInventoryMethods.updateItem(
        session, character.id, item.id, 1, true, "Trinket", null, null, null,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Trinket");
    });

    test("should unequip and clear location", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Trinket", null, null, null);

      const result = await CharacterInventoryMethods.updateItem(
        session, character.id, item.id, 1, false, null, null, null, null,
      );

      expect(result.equipped).toBe(false);
      expect(result.location).toBeNull();
    });

    test("should update charges", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, 50, 50, null);

      const result = await CharacterInventoryMethods.updateItem(
        session, character.id, item.id, 1, false, null, 50, 30, null,
      );

      expect(result.totalCharges).toBe(50);
      expect(result.remainingCharges).toBe(30);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session, item } = await setupTestData();

      await expect(
        CharacterInventoryMethods.updateItem(
          session, "00000000-0000-0000-0000-000000000000", item.id, 1, false, null, null, null, null,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for item not in inventory", async () => {
      const { session, character } = await setupTestData();

      await expect(
        CharacterInventoryMethods.updateItem(
          session, character.id, "00000000-0000-0000-0000-000000000000", 1, false, null, null, null, null,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw BadRequestError when remaining charges exceed total", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, 10, 10, null);

      await expect(
        CharacterInventoryMethods.updateItem(session, character.id, item.id, 1, false, null, 10, 20, null),
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw NotFoundError when another user tries to update", async () => {
      const { session, character, item } = await setupTestData();
      const { session: otherSession } = await createTestUser();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      await expect(
        CharacterInventoryMethods.updateItem(otherSession, character.id, item.id, 5, false, null, null, null, null),
      ).rejects.toThrow(NotFoundError);
    });

    test("should allow moving item to different slot", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Trinket", null, null, null);

      const result = await CharacterInventoryMethods.updateItem(
        session, character.id, item.id, 1, true, "Waist", null, null, null,
      );

      expect(result.location).toBe("Waist");
    });

    test("should reject updating to hand slot without weaponSet", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      await expect(
        CharacterInventoryMethods.updateItem(session, character.id, item.id, 1, true, "Main Hand", null, null, null),
      ).rejects.toThrow("A weapon set is required when equipping to a hand slot");
    });
  });

  describe("weapon size validation", () => {
    async function createTestRaceWithSize(size: string) {
      const ctx = await getCtx();
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const races = await Races.create(db, {
        rulesetId: ctx.rulesetId,
        name: `Test Race ${uniqueId}`,
        description: "Test race",
        size: size as "Medium",
        baseSpeed: 30,
      });
      return races[0];
    }

    async function createWeaponWithSize(weaponSize: string) {
      const item = await createTestItem();
      await Properties.create(db, {
        entityId: item.id,
        entityType: "items",
        type: "WEAPON_PROFICIENCY",
        value: "Martial",
      });
      await Properties.create(db, {
        entityId: item.id,
        entityType: "items",
        type: "WEAPON_SIZE",
        value: weaponSize,
      });
      return item;
    }

    test("should allow weapon same size as character in Main Hand", async () => {
      const { session } = await setupTestData();
      const race = await createTestRaceWithSize("Medium");
      const character = await createTestCharacter(session, race.id);
      const weapon = await createWeaponWithSize("Medium");

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, weapon.id, 1, true, "Main Hand", null, null, 0,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Main Hand");
    });

    test("should allow weapon smaller than character in any hand slot", async () => {
      const { session } = await setupTestData();
      const race = await createTestRaceWithSize("Large");
      const character = await createTestCharacter(session, race.id);
      const weapon = await createWeaponWithSize("Medium");

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, weapon.id, 1, true, "Off Hand", null, null, 0,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Off Hand");
    });

    test("should allow weapon one size larger in Two Handed slot", async () => {
      const { session } = await setupTestData();
      const race = await createTestRaceWithSize("Medium");
      const character = await createTestCharacter(session, race.id);
      const weapon = await createWeaponWithSize("Large");

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, weapon.id, 1, true, "Two Handed", null, null, 0,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Two Handed");
    });

    test("should reject weapon one size larger in Main Hand", async () => {
      const { session } = await setupTestData();
      const race = await createTestRaceWithSize("Medium");
      const character = await createTestCharacter(session, race.id);
      const weapon = await createWeaponWithSize("Large");

      await expect(
        CharacterInventoryMethods.addItem(
          session, character.id, weapon.id, 1, true, "Main Hand", null, null, 0,
        ),
      ).rejects.toThrow("This weapon requires two hands for a character of this size");
    });

    test("should reject weapon one size larger in Off Hand", async () => {
      const { session } = await setupTestData();
      const race = await createTestRaceWithSize("Medium");
      const character = await createTestCharacter(session, race.id);
      const weapon = await createWeaponWithSize("Large");

      await expect(
        CharacterInventoryMethods.addItem(
          session, character.id, weapon.id, 1, true, "Off Hand", null, null, 0,
        ),
      ).rejects.toThrow("This weapon requires two hands for a character of this size");
    });

    test("should reject weapon two sizes larger than character", async () => {
      const { session } = await setupTestData();
      const race = await createTestRaceWithSize("Medium");
      const character = await createTestCharacter(session, race.id);
      const weapon = await createWeaponWithSize("Huge");

      await expect(
        CharacterInventoryMethods.addItem(
          session, character.id, weapon.id, 1, true, "Two Handed", null, null, 0,
        ),
      ).rejects.toThrow("Weapon is too large for this character");
    });

    test("should allow weapon without WEAPON_SIZE property in any hand slot", async () => {
      const { session, character, item } = await setupTestData();

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, item.id, 1, true, "Main Hand", null, null, 0,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Main Hand");
    });
  });

  describe("equipment type validation", () => {
    test("should reject equipping a weapon to a non-hand slot", async () => {
      const { session, character } = await setupTestData();
      const weapon = await createTestItem({ type: "Weapon" });

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, weapon.id, 1, true, "Trinket", null, null, null),
      ).rejects.toThrow("Weapons can only be equipped in hand slots");
    });

    test("should reject equipping armor to a non-torso slot", async () => {
      const { session, character } = await setupTestData();
      const armor = await createTestItem({ type: "Armor" });

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, armor.id, 1, true, "Head", null, null, null),
      ).rejects.toThrow("Body armor can only be equipped in the Torso slot");
    });

    test("should reject equipping a shield to a non-off-hand slot", async () => {
      const { session, character } = await setupTestData();
      const shield = await createTestItem({ type: "Shield" });

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, shield.id, 1, true, "Head", null, null, null),
      ).rejects.toThrow("Shields can only be equipped in the Off Hand slot");
    });

    test("should allow equipping armor to torso", async () => {
      const { session, character } = await setupTestData();
      const armor = await createTestItem({ type: "Armor" });

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, armor.id, 1, true, "Torso", null, null, null,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Torso");
    });

    test("should allow equipping a shield to off hand", async () => {
      const { session, character } = await setupTestData();
      const shield = await createTestItem({ type: "Shield" });

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, shield.id, 1, true, "Off Hand", null, null, 0,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Off Hand");
    });

    test("should reject equipping to same hand slot in same weapon set", async () => {
      const { session, character, item } = await setupTestData();
      const item2 = await createTestItem();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Off Hand", null, null, 0);

      await expect(
        CharacterInventoryMethods.addItem(session, character.id, item2.id, 1, true, "Off Hand", null, null, 0),
      ).rejects.toThrow("\"Off Hand\" is already occupied in this weapon set");
    });

    test("should allow same hand slot in different weapon sets", async () => {
      const { session, character, item } = await setupTestData();
      const item2 = await createTestItem();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, true, "Main Hand", null, null, 0);

      const result = await CharacterInventoryMethods.addItem(
        session, character.id, item2.id, 1, true, "Main Hand", null, null, 1,
      );

      expect(result.equipped).toBe(true);
      expect(result.location).toBe("Main Hand");
      expect(result.weaponSet).toBe(1);
    });
  });

  describe("removeItem", () => {
    test("should remove item from inventory", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      const result = await CharacterInventoryMethods.removeItem(session, character.id, item.id);

      expect(result).toEqual({ success: true });
    });

    test("should not return removed item in getInventory", async () => {
      const { session, character, item } = await setupTestData();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);
      await CharacterInventoryMethods.removeItem(session, character.id, item.id);

      const inventory = await CharacterInventoryMethods.getInventory(session, character.id);
      expect(inventory.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent character", async () => {
      const { session, item } = await setupTestData();

      await expect(
        CharacterInventoryMethods.removeItem(session, "00000000-0000-0000-0000-000000000000", item.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for item not in inventory", async () => {
      const { session, character } = await setupTestData();

      await expect(
        CharacterInventoryMethods.removeItem(session, character.id, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when another user tries to remove", async () => {
      const { session, character, item } = await setupTestData();
      const { session: otherSession } = await createTestUser();

      await CharacterInventoryMethods.addItem(session, character.id, item.id, 1, false, null, null, null, null);

      await expect(
        CharacterInventoryMethods.removeItem(otherSession, character.id, item.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("COW fork", () => {
    async function setupCowForkData() {
      const { user: parentUser, session: parentSession } = await createTestUser();
      const parentRulesets = await Rulesets.create(db, {
        name: `Parent Ruleset ${Math.random().toString(36).substr(2, 9)}`,
        description: "Parent ruleset for COW testing",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: parentUser.id,
      });
      const parentRuleset = parentRulesets[0];
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });
      const parentRaces = await Races.create(db, {
        rulesetId: parentRuleset.id,
        name: `Test Race ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test race for COW testing",
        size: "Medium",
        baseSpeed: 30,
      });
      const parentRace = parentRaces[0];
      const parentItem = await ItemsMethods.createRulesetItem(parentSession, parentRuleset.id, {
        name: `Parent Item ${Math.random().toString(36).substr(2, 9)}`,
        description: "Parent item for COW testing",
        weight: 5,
        costGp: 10,
      });

      const { user: childUser, session: childSession } = await createTestUser();
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childUser.id,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      const character = await CharactersMethods.createCharacter(childSession, {
        rulesetId: childRuleset.id,
        raceId: parentRace.id,
        name: `Test Character ${Math.random().toString(36).substr(2, 9)}`,
        xp: 0,
        alignment: "Lawful Good",
        abilities: {},
        age: 25,
        gender: "Male",
        height: "6'0\"",
        weight: "180 lbs",
      });

      return { parentRuleset, childRuleset, parentItem, character, childSession, parentSession };
    }

    test("should add an inherited parent item to inventory", async () => {
      const { childSession, character, parentItem } = await setupCowForkData();

      const result = await CharacterInventoryMethods.addItem(
        childSession, character.id, parentItem.id, 1, false, null, null, null, null,
      );

      expect(result).toBeDefined();
      expect(result.itemId).toBe(parentItem.id);
    });

    test("should reject an item from an unrelated ruleset", async () => {
      const { childSession, character } = await setupCowForkData();

      const { user: unrelatedUser, session: unrelatedSession } = await createTestUser();
      const unrelatedRulesets = await Rulesets.create(db, {
        name: `Unrelated Ruleset ${Math.random().toString(36).substr(2, 9)}`,
        description: "Unrelated ruleset",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: unrelatedUser.id,
      });
      const unrelatedItem = await ItemsMethods.createRulesetItem(unrelatedSession, unrelatedRulesets[0].id, {
        name: `Unrelated Item ${Math.random().toString(36).substr(2, 9)}`,
        description: "Item from unrelated ruleset",
        weight: 5,
        costGp: 10,
      });

      await expect(
        CharacterInventoryMethods.addItem(
          childSession, character.id, unrelatedItem.id, 1, false, null, null, null, null,
        ),
      ).rejects.toThrow(BadRequestError);
    });
  });
});
