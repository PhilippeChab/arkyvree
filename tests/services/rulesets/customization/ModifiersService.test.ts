import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Activities,
  Rulesets,
  Users,
  Feats,
  Items,
  Powers,
  Properties,
  Races,
  KlassLevels,
  Klasses,
  Requirements,
} from "@/server/repositories/index.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { getTableName } from "drizzle-orm";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("ModifiersService", () => {
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
      description: "Test ruleset for modifiers testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    // Create standard abilities so path validation works
    await Abilities.createMany(db, [
      { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
      { name: "Dexterity", description: "Agility and reflexes", rulesetId: ruleset.id },
      { name: "Constitution", description: "Health and stamina", rulesetId: ruleset.id },
      { name: "Intelligence", description: "Reasoning and memory", rulesetId: ruleset.id },
      { name: "Wisdom", description: "Perception and insight", rulesetId: ruleset.id },
      { name: "Charisma", description: "Force of personality", rulesetId: ruleset.id },
    ]);

    return { user, ruleset, session: createTestSession(user.id) };
  }

  // Helper to create test feat
  async function createTestFeat(rulesetId: string, name = "Test Feat") {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const feats = await Feats.create(db, {
      name: `${name} ${uniqueId}`,
      description: "Test feat for modifiers testing",
      rulesetId,
    });
    return feats[0];
  }

  // Helper to create test item
  async function createTestItem(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const items = await Items.create(db, {
      name: `Test Item ${uniqueId}`,
      description: "Test item for modifiers testing",
      rulesetId,
    });
    return items[0];
  }

  // Helper to create test power
  async function createTestPower(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const powers = await Powers.create(db, {
      name: `Test Power ${uniqueId}`,
      description: "Test power for modifiers testing",
      rulesetId,
    });
    return powers[0];
  }

  // Helper to create test race
  async function createTestRace(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const races = await Races.create(db, {
      name: `Test Race ${uniqueId}`,
      description: "Test race for modifiers testing",
      rulesetId,
      size: "Medium",
      baseSpeed: 30,
    });
    return races[0];
  }

  // Helper to create test klass level
  async function createTestKlassLevel(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const klasses = await Klasses.create(db, {
      name: `Test Klass ${uniqueId}`,
      description: "Test klass for modifiers testing",
      rulesetId,
      hd: 8,
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

    return klassLevel;
  }

  describe("getEntityModifiers", () => {
    test("should return modifiers for a feat", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const modifiers = await ModifiersMethods.getEntityModifiers(
        ruleset.id,
        "feats",
        feat.id
      );

      expect(modifiers).toBeDefined();
      expect(Array.isArray(modifiers)).toBe(true);
    });

    test("should return modifiers for an item", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const item = await createTestItem(ruleset.id);

      const modifiers = await ModifiersMethods.getEntityModifiers(
        ruleset.id,
        "items",
        item.id
      );

      expect(modifiers).toBeDefined();
      expect(Array.isArray(modifiers)).toBe(true);
    });

    test("should return modifiers for a power", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const power = await createTestPower(ruleset.id);

      const modifiers = await ModifiersMethods.getEntityModifiers(
        ruleset.id,
        "powers",
        power.id
      );

      expect(modifiers).toBeDefined();
      expect(Array.isArray(modifiers)).toBe(true);
    });

    test("should return modifiers for a race", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const race = await createTestRace(ruleset.id);

      const modifiers = await ModifiersMethods.getEntityModifiers(
        ruleset.id,
        "races",
        race.id
      );

      expect(modifiers).toBeDefined();
      expect(Array.isArray(modifiers)).toBe(true);
    });

    test("should return modifiers for a klass level", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const klassLevel = await createTestKlassLevel(ruleset.id);

      const modifiers = await ModifiersMethods.getEntityModifiers(
        ruleset.id,
        "klass_levels",
        klassLevel.id
      );

      expect(modifiers).toBeDefined();
      expect(Array.isArray(modifiers)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.getEntityModifiers(fakeRulesetId, "feats", feat.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent entity", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeEntityId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.getEntityModifiers(ruleset.id, "feats", fakeEntityId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getEntityModifier", () => {
    test("should return a specific modifier for a feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create a modifier first
      const created = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      const modifier = await ModifiersMethods.getEntityModifier(
        ruleset.id,
        "feats",
        feat.id,
        created.id
      );

      expect(modifier).toBeDefined();
      expect(modifier.id).toBe(created.id);
      expect(modifier.target).toBe("abilities.strength.misc");
      expect(modifier.value).toBe("2");
      expect(modifier.operator).toBe("add");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.getEntityModifier(
          fakeRulesetId,
          "feats",
          feat.id,
          "fake-modifier-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent entity", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeEntityId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.getEntityModifier(
          ruleset.id,
          "feats",
          fakeEntityId,
          "fake-modifier-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent modifier", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeModifierId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.getEntityModifier(ruleset.id, "feats", feat.id, fakeModifierId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createEntityModifier", () => {
    test("should create a modifier for a feat with valid path", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const modifierData = {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      };

      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        modifierData
      );

      expect(modifier).toBeDefined();
      expect(modifier.sourceId).toBe(feat.id);
      expect(modifier.sourceType).toBe("feats");
      expect(modifier.target).toBe(modifierData.target);
      expect(modifier.value).toBe(modifierData.value);
      expect(modifier.operator).toBe(modifierData.operator);
      expect(modifier.valueType).toBeDefined();
    });

    test("should create a modifier for an item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const item = await createTestItem(ruleset.id);

      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "items",
        item.id,
        {
          target: "abilities.dexterity.misc",
          value: "1",
          operator: "add",
        }
      );

      expect(modifier).toBeDefined();
      expect(modifier.sourceId).toBe(item.id);
      expect(modifier.sourceType).toBe("items");
    });

    test("should create a modifier for a power", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const power = await createTestPower(ruleset.id);

      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "powers",
        power.id,
        {
          target: "abilities.intelligence.misc",
          value: "3",
          operator: "add",
        }
      );

      expect(modifier).toBeDefined();
      expect(modifier.sourceId).toBe(power.id);
      expect(modifier.sourceType).toBe("powers");
    });

    test("should create a modifier for a race", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const race = await createTestRace(ruleset.id);

      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "races",
        race.id,
        {
          target: "abilities.constitution.misc",
          value: "2",
          operator: "add",
        }
      );

      expect(modifier).toBeDefined();
      expect(modifier.sourceId).toBe(race.id);
      expect(modifier.sourceType).toBe("races");
    });

    test("should create a modifier for a klass level", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const klassLevel = await createTestKlassLevel(ruleset.id);

      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "klass_levels",
        klassLevel.id,
        {
          target: "abilities.wisdom.misc",
          value: "1",
          operator: "add",
        }
      );

      expect(modifier).toBeDefined();
      expect(modifier.sourceId).toBe(klassLevel.id);
      expect(modifier.sourceType).toBe("klass_levels");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.createEntityModifier(session, fakeRulesetId, "feats", feat.id, {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeEntityId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.createEntityModifier(
          session,
          ruleset.id,
          "feats",
          fakeEntityId,
          {
            target: "abilities.strength.misc",
            value: "2",
            operator: "add",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      await expect(
        ModifiersMethods.createEntityModifier(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          {
            target: "abilities.strength.misc",
            value: "2",
            operator: "add",
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw BadRequestError for invalid path", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      await expect(
        ModifiersMethods.createEntityModifier(session, ruleset.id, "feats", feat.id, {
          target: "invalid.path.does.not.exist",
          value: "2",
          operator: "add",
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("duplicateEntityModifier", () => {
    test("copies the source modifier's requirement tree onto the new modifier", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const source = await ModifiersMethods.createEntityModifier(session, ruleset.id, "feats", feat.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "modifiers", source.id, {
        level: "1",
        target: "combat.bab",
        value: "5",
        operator: "greater_than_or_equal",
      });
      await RequirementsMethods.createEntityRequirement(session, ruleset.id, "modifiers", source.id, {
        level: "2",
        chainingOperator: "and",
      });

      const dup = await ModifiersMethods.duplicateEntityModifier(session, ruleset.id, "feats", feat.id, source.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });

      expect(dup.id).not.toBe(source.id);

      const dupReqs = await Requirements.findManyByEntity(db, { entityIds: [dup.id], entityType: "modifiers" });
      expect(dupReqs).toHaveLength(2);
      const byLevel = new Map(dupReqs.map((r) => [r.level, r]));
      expect(byLevel.get("1")?.target).toBe("combat.bab");
      expect(byLevel.get("1")?.value).toBe("5");
      expect(byLevel.get("2")?.chainingOperator).toBe("and");

      // Source still owns its originals
      const sourceReqs = await Requirements.findManyByEntity(db, { entityIds: [source.id], entityType: "modifiers" });
      expect(sourceReqs).toHaveLength(2);
      for (const sr of sourceReqs) {
        expect(dupReqs.find((dr) => dr.id === sr.id)).toBeUndefined();
      }
    });

    test("throws NotFoundError when source modifier does not exist", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.duplicateEntityModifier(session, ruleset.id, "feats", feat.id, fakeId, {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("throws NotFoundError when source modifier belongs to a different entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const item = await createTestItem(ruleset.id);

      const itemModifier = await ModifiersMethods.createEntityModifier(session, ruleset.id, "items", item.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });

      await expect(
        ModifiersMethods.duplicateEntityModifier(session, ruleset.id, "feats", feat.id, itemModifier.id, {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateEntityModifier", () => {
    test("should update a modifier for a feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create modifier first
      const created = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Update it
      const updateData = {
        target: "abilities.dexterity.misc",
        value: "3",
        operator: "add",
      };

      const updated = await ModifiersMethods.updateEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        updateData
      );

      expect(updated.id).toBe(created.id);
      expect(updated.target).toBe(updateData.target);
      expect(updated.value).toBe(updateData.value);
      expect(updated.operator).toBe(updateData.operator);
    });

    test("should update a modifier for an item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const item = await createTestItem(ruleset.id);

      const created = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "items",
        item.id,
        {
          target: "abilities.strength.misc",
          value: "1",
          operator: "add",
        }
      );

      const updated = await ModifiersMethods.updateEntityModifier(
        session,
        ruleset.id,
        "items",
        item.id,
        created.id,
        {
          target: "abilities.charisma.misc",
          value: "2",
          operator: "add",
        }
      );

      expect(updated.target).toBe("abilities.charisma.misc");
      expect(updated.value).toBe("2");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.updateEntityModifier(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          "fake-modifier-id",
          {
            target: "abilities.strength.misc",
            value: "2",
            operator: "add",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent modifier", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeModifierId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.updateEntityModifier(
          session,
          ruleset.id,
          "feats",
          feat.id,
          fakeModifierId,
          {
            target: "abilities.strength.misc",
            value: "2",
            operator: "add",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when modifier doesn't belong to entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat1 = await createTestFeat(ruleset.id, "Feat 1");
      const feat2 = await createTestFeat(ruleset.id, "Feat 2");

      // Create modifier for feat1
      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat1.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Try to update it as if it belongs to feat2
      await expect(
        ModifiersMethods.updateEntityModifier(
          session,
          ruleset.id,
          "feats",
          feat2.id,
          modifier.id,
          {
            target: "abilities.dexterity.misc",
            value: "3",
            operator: "add",
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create modifier as owner
      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Try to update as different user
      await expect(
        ModifiersMethods.updateEntityModifier(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          modifier.id,
          {
            target: "abilities.dexterity.misc",
            value: "3",
            operator: "add",
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw BadRequestError for invalid path", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const created = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      await expect(
        ModifiersMethods.updateEntityModifier(
          session,
          ruleset.id,
          "feats",
          feat.id,
          created.id,
          {
            target: "invalid.path.does.not.exist",
            value: "3",
            operator: "add",
          }
        )
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw ConflictError when updatedAt is stale", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const created = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { target: "abilities.strength.misc", value: "2", operator: "add" },
      );

      await ModifiersMethods.updateEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        { target: "abilities.dexterity.misc", value: "3", operator: "add", updatedAt: created.updatedAt },
      );

      await expect(
        ModifiersMethods.updateEntityModifier(
          session,
          ruleset.id,
          "feats",
          feat.id,
          created.id,
          { target: "abilities.constitution.misc", value: "1", operator: "add", updatedAt: created.updatedAt },
        ),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("deleteEntityModifier", () => {
    test("should delete a modifier for a feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create modifier first
      const created = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Delete it
      const deleted = await ModifiersMethods.deleteEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's deleted
      await expect(
        ModifiersMethods.getEntityModifier(ruleset.id, "feats", feat.id, created.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should delete a modifier for an item", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const item = await createTestItem(ruleset.id);

      const created = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "items",
        item.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      const deleted = await ModifiersMethods.deleteEntityModifier(
        session,
        ruleset.id,
        "items",
        item.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should cascade delete requirements when deleting modifier", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create modifier
      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Create requirement on the modifier
      await Requirements.create(db, {
        entityId: modifier.id,
        entityType: "modifiers",
        level: "1",
        target: "abilities.strength.misc",
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      });

      // Delete the modifier
      await ModifiersMethods.deleteEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        modifier.id
      );

      // Verify requirements are deleted
      const requirements = await Requirements.findManyByEntity(db, {
        entityIds: [modifier.id],
        entityType: "modifiers",
      });
      expect(requirements.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.deleteEntityModifier(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          "fake-modifier-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent modifier", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeModifierId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ModifiersMethods.deleteEntityModifier(
          session,
          ruleset.id,
          "feats",
          feat.id,
          fakeModifierId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when modifier doesn't belong to entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat1 = await createTestFeat(ruleset.id, "Feat 1");
      const feat2 = await createTestFeat(ruleset.id, "Feat 2");

      // Create modifier for feat1
      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat1.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Try to delete it as if it belongs to feat2
      await expect(
        ModifiersMethods.deleteEntityModifier(
          session,
          ruleset.id,
          "feats",
          feat2.id,
          modifier.id
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create modifier as owner
      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Try to delete as different user
      await expect(
        ModifiersMethods.deleteEntityModifier(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          modifier.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should cascade delete activities for the modifier", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Verify create activity exists
      const activitiesBefore = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(modifiersInCustomization) },
        { limit: 100, page: 1 },
      );
      const createActivity = activitiesBefore.items.find(
        (a) => a.targetId === modifier.id && a.type === "createModifier",
      );
      expect(createActivity).toBeDefined();

      await ModifiersMethods.deleteEntityModifier(session, ruleset.id, "feats", feat.id, modifier.id);

      // Verify create activity was deleted but delete activity was created
      const activitiesAfter = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(modifiersInCustomization) },
        { limit: 100, page: 1 },
      );
      const remaining = activitiesAfter.items.filter((a) => a.targetId === modifier.id);
      expect(remaining.length).toBe(1);
      expect(remaining[0].type).toBe("deleteModifier");
    });

    test("should cascade delete activities for modifier requirements", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const modifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Create requirement on the modifier (manually, since it's a sub-entity)
      const reqs = await Requirements.create(db, {
        entityId: modifier.id,
        entityType: "modifiers",
        level: "1",
        target: "abilities.strength.misc",
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
      const req = reqs[0];

      // Create activity for the requirement
      await Activities.create(db, {
        userId: session.userId,
        targetId: req.id,
        targetTable: getTableName(requirementsInCustomization),
        type: "createRequirement",
      });

      await ModifiersMethods.deleteEntityModifier(session, ruleset.id, "feats", feat.id, modifier.id);

      // Verify requirement activity was deleted
      const activitiesAfter = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(requirementsInCustomization) },
        { limit: 100, page: 1 },
      );
      const remaining = activitiesAfter.items.filter((a) => a.targetId === req.id);
      expect(remaining.length).toBe(0);
    });
  });

  describe("modifier on modifier (nested modifiers)", () => {
    test("should create a modifier on another modifier", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create base modifier on feat
      const baseModifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Create modifier on the modifier
      const nestedModifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "modifiers",
        baseModifier.id,
        {
          target: "abilities.dexterity.misc",
          value: "1",
          operator: "add",
        }
      );

      expect(nestedModifier).toBeDefined();
      expect(nestedModifier.sourceId).toBe(baseModifier.id);
      expect(nestedModifier.sourceType).toBe("modifiers");
    });

    test("should get modifiers of a modifier", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create base modifier
      const baseModifier = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Create nested modifier
      await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "modifiers",
        baseModifier.id,
        {
          target: "abilities.dexterity.misc",
          value: "1",
          operator: "add",
        }
      );

      // Get modifiers of the modifier
      const modifiers = await ModifiersMethods.getEntityModifiers(
        ruleset.id,
        "modifiers",
        baseModifier.id
      );

      expect(modifiers).toBeDefined();
      expect(modifiers.length).toBeGreaterThan(0);
      expect(modifiers[0].sourceId).toBe(baseModifier.id);
      expect(modifiers[0].sourceType).toBe("modifiers");
    });
  });

  describe("multiple modifiers on same entity", () => {
    test("should create multiple modifiers on the same feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const modifier1 = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      const modifier2 = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.dexterity.misc",
          value: "1",
          operator: "add",
        }
      );

      const modifiers = await ModifiersMethods.getEntityModifiers(
        ruleset.id,
        "feats",
        feat.id
      );

      expect(modifiers.length).toBe(2);
      expect(modifiers.map((m) => m.id)).toContain(modifier1.id);
      expect(modifiers.map((m) => m.id)).toContain(modifier2.id);
    });

    test("should allow multiple modifiers on same entity with same target", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create first modifier
      const modifier1 = await ModifiersMethods.createEntityModifier(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          target: "abilities.strength.misc",
          value: "2",
          operator: "add",
        }
      );

      // Create another modifier with the same target on the same entity
      const modifier2 = await ModifiersMethods.createEntityModifier(
        session, ruleset.id, "feats", feat.id, {
          target: "abilities.strength.misc",
          value: "3",
          operator: "add",
        }
      );

      expect(modifier1.id).not.toBe(modifier2.id);
    });
  });
});
