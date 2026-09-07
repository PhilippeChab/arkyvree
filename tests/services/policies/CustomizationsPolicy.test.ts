import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Aptitudes, Feats, Items, Klasses, KlassLevels, Modifiers, Properties, Races, Rulesets, Powers, Users } from "@/server/repositories/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import CustomizationsPolicy from "@/server/services/policies/CustomizationsPolicy.ts";
import type { Modifier, Property, Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("CustomizationsPolicy", () => {
  const createSession = (userId: string): Session => ({
    id: `session-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Helper to create test user and ruleset
  async function createTestUserAndRuleset() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createSession(user.id) };
  }

  const createModifier = (overrides: Partial<Modifier> = {}): Modifier => ({
    id: "modifier-123",
    sourceId: "feat-123",
    sourceType: "feats",
    target: "combat.bab",
    value: "1",
    valueType: "number",
    operator: "add",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  });

  const createProperty = (overrides: Partial<Property> = {}): Property => ({
    id: "property-123",
    entityId: "feat-123",
    entityType: "feats",
    type: "WEAPON_PROFICIENCY",
    value: "Longsword",
    description: "A longsword",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ...overrides,
  });

  describe("canCreate", () => {
    test("should always return true", () => {
      const session = createSession("user-123");
      const modifier = createModifier();
      const policy = new CustomizationsPolicy(session, modifier);

      expect(policy.canCreate()).toBe(true);
    });
  });

  describe("canRead", () => {
    test("should always return true", () => {
      const session = createSession("user-123");
      const property = createProperty();
      const policy = new CustomizationsPolicy(session, property);

      expect(policy.canRead()).toBe(true);
    });
  });

  describe("sourceExists - static method", () => {
    test("should validate feat exists", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      // Create aptitude (required for feat)
      await Aptitudes.create(db, {
        rulesetId: ruleset.id,
        name: "Test Aptitude",
        description: "Test",
      });

      // Create feat
      const feats = await Feats.create(db, {
        rulesetId: ruleset.id,
        name: "Test Feat",
        description: "Test feat",
      });
      const feat = feats[0];

      const result = await CustomizationsPolicy.sourceExists(feat.id, "feats");
      expect(result).toBe("Test Feat");
    });

    test("should validate item exists", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const items = await Items.create(db, {
        rulesetId: ruleset.id,
        name: "Test Item",
        description: "Test item",
      });
      const item = items[0];

      const result = await CustomizationsPolicy.sourceExists(item.id, "items");
      expect(result).toBe("Test Item");
    });

    test("should validate power exists", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const powers = await Powers.create(db, {
        rulesetId: ruleset.id,
        name: "Test Power",
        description: "Test power",
      });
      const power = powers[0];

      const result = await CustomizationsPolicy.sourceExists(power.id, "powers");
      expect(result).toBe("Test Power");
    });

    test("should validate race exists", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const races = await Races.create(db, {
        rulesetId: ruleset.id,
        name: "Test Race",
        description: "Test race",
        size: "Medium",
        baseSpeed: 30,
      });
      const race = races[0];

      const result = await CustomizationsPolicy.sourceExists(race.id, "races");
      expect(result).toBe("Test Race");
    });

    test("should validate klass_levels exists", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const klasses = await Klasses.create(db, {
        rulesetId: ruleset.id,
        name: "Test Class",
        description: "Test class",
        hd: 10,
      });
      const klass = klasses[0];

      const klassLevels = await KlassLevels.create(db, {
        klassId: klass.id,
        level: 1,
      });
      const klassLevel = klassLevels[0];

      await Properties.createMany(db, [
        { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "1" },
        { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "4" },
      ]);

      const result = await CustomizationsPolicy.sourceExists(klassLevel.id, "klass_levels");
      expect(result).toBe("Level 1");
    });

    test("should validate modifier exists (nested modifiers)", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      // Create aptitude and feat first
      await Aptitudes.create(db, {
        rulesetId: ruleset.id,
        name: "Test Aptitude",
        description: "Test",
      });

      const feats = await Feats.create(db, {
        rulesetId: ruleset.id,
        name: "Test Feat",
        description: "Test feat",
      });
      const feat = feats[0];

      // Create a modifier
      const modifiers = await Modifiers.create(db, {
        sourceId: feat.id,
        sourceType: "feats",
        target: "combat.bab",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      const modifier = modifiers[0];

      const result = await CustomizationsPolicy.sourceExists(modifier.id, "modifiers");
      expect(result).toBe("combat.bab add 1");
    });

    test("should throw NotFoundError for non-existent feat", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CustomizationsPolicy.sourceExists(fakeId, "feats")
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent item", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CustomizationsPolicy.sourceExists(fakeId, "items")
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for unsupported source type", async () => {
      await expect(
        CustomizationsPolicy.sourceExists("some-id", "invalid_type")
      ).rejects.toThrow(NotFoundError);

      await expect(
        CustomizationsPolicy.sourceExists("some-id", "invalid_type")
      ).rejects.toThrow("invalid_type not supported");
    });
  });

  describe("canUpdate", () => {
    test("should validate source exists for Modifier", async () => {
      const { user, ruleset } = await createTestUserAndRuleset();

      // Create feat
      await Aptitudes.create(db, {
        rulesetId: ruleset.id,
        name: "Test Aptitude",
        description: "Test",
      });

      const feats = await Feats.create(db, {
        rulesetId: ruleset.id,
        name: "Test Feat",
        description: "Test feat",
      });
      const feat = feats[0];

      // Create modifier
      const modifiers = await Modifiers.create(db, {
        sourceId: feat.id,
        sourceType: "feats",
        target: "combat.bab",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      const modifier = modifiers[0];

      const policy = new CustomizationsPolicy(createSession(user.id), modifier);

      const result = await policy.canUpdate();
      expect(result).toBe(true);
    });

    test("should validate entity exists for Property", async () => {
      const { user, ruleset } = await createTestUserAndRuleset();

      const feats = await Feats.create(db, {
        rulesetId: ruleset.id,
        name: "Test Feat",
        description: "Test feat",
      });
      const feat = feats[0];

      // Create a fake property object (not in DB, just for testing policy logic)
      const property: Property = {
        id: "prop-123",
        entityId: feat.id,
        entityType: "feats",
        type: "WEAPON_PROFICIENCY",
        value: "Longsword",
        description: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const policy = new CustomizationsPolicy(createSession(user.id), property);

      const result = await policy.canUpdate();
      expect(result).toBe(true);
    });

    test("should throw NotFoundError when source does not exist", async () => {
      const { user } = await createTestUserAndRuleset();

      const modifier = createModifier({
        sourceId: "00000000-0000-0000-0000-000000000000",
        sourceType: "feats",
      });

      const policy = new CustomizationsPolicy(createSession(user.id), modifier);

      await expect(policy.canUpdate()).rejects.toThrow(NotFoundError);
    });
  });

  describe("canDelete", () => {
    test("should validate source exists for Modifier", async () => {
      const { user, ruleset } = await createTestUserAndRuleset();

      await Aptitudes.create(db, {
        rulesetId: ruleset.id,
        name: "Test Aptitude",
        description: "Test",
      });

      const feats = await Feats.create(db, {
        rulesetId: ruleset.id,
        name: "Test Feat",
        description: "Test feat",
      });
      const feat = feats[0];

      const modifiers = await Modifiers.create(db, {
        sourceId: feat.id,
        sourceType: "feats",
        target: "combat.bab",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      const modifier = modifiers[0];

      const policy = new CustomizationsPolicy(createSession(user.id), modifier);

      const result = await policy.canDelete();
      expect(result).toBe(true);
    });

    test("should throw NotFoundError when source does not exist", async () => {
      const { user } = await createTestUserAndRuleset();

      const modifier = createModifier({
        sourceId: "00000000-0000-0000-0000-000000000000",
        sourceType: "items",
      });

      const policy = new CustomizationsPolicy(createSession(user.id), modifier);

      await expect(policy.canDelete()).rejects.toThrow(NotFoundError);
    });
  });

  describe("all source types", () => {
    test("should handle all supported sourceTypes for Modifiers", async () => {
      const { user } = await createTestUserAndRuleset();

      const sourceTypes = ["feats", "items", "powers", "klass_levels", "races", "modifiers"];

      for (const sourceType of sourceTypes) {
        const modifier = createModifier({
          sourceId: "00000000-0000-0000-0000-000000000000",
          sourceType,
        });

        const policy = new CustomizationsPolicy(createSession(user.id), modifier);

        // Should throw because the entity doesn't exist
        await expect(policy.canUpdate()).rejects.toThrow(NotFoundError);
      }
    });

    test("should handle all supported entityTypes for Properties", async () => {
      const { user } = await createTestUserAndRuleset();

      const entityTypes = ["feats", "items", "powers", "klass_levels", "races"];

      for (const entityType of entityTypes) {
        const property = createProperty({
          entityId: "00000000-0000-0000-0000-000000000000",
          entityType,
        });

        const policy = new CustomizationsPolicy(createSession(user.id), property);

        // Should throw because the entity doesn't exist
        await expect(policy.canUpdate()).rejects.toThrow(NotFoundError);
      }
    });
  });
});
