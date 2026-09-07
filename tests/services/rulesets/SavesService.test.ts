import { SavesMethods } from "@/server/services/rulesets/SavesService.ts";
import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Klasses,
  KlassLevelSaves,
  KlassLevels,
  Modifiers,
  Properties,
  Requirements,
  Rulesets,
  Saves,
  Users,
} from "@/server/repositories/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("SavesService", () => {
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

  async function createTestSetup() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for saves testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    const abilities = await Abilities.create(db, {
      name: `Dexterity ${uniqueId}`,
      description: "Agility and reflexes",
      rulesetId: ruleset.id,
    });
    const ability = abilities[0];

    return { user, ruleset, ability, session: createTestSession(user.id) };
  }

  describe("getRulesetSaves", () => {
    test("should return empty paginated result when no saves exist", async () => {
      const { ruleset } = await createTestSetup();

      const result = await SavesMethods.getRulesetSaves(
        ruleset.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items).toEqual([]);
      expect(result.items.length).toBe(0);
    });

    test("should return saves for a ruleset", async () => {
      const { ruleset, ability, session } = await createTestSetup();

      await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Fortitude",
        description: "Physical resistance",
        abilityId: ability.id,
      });

      const result = await SavesMethods.getRulesetSaves(
        ruleset.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe("Fortitude");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      await expect(
        SavesMethods.getRulesetSaves(
          "00000000-0000-0000-0000-000000000000",
          {},
          { limit: 10, page: 1 },
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createRulesetSave", () => {
    test("should create a save", async () => {
      const { ruleset, ability, session } = await createTestSetup();

      const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Reflex",
        description: "Dodge and evade",
        abilityId: ability.id,
      });

      expect(save).toBeDefined();
      expect(save.name).toBe("Reflex");
      expect(save.description).toBe("Dodge and evade");
      expect(save.abilityId).toBe(ability.id);
      expect(save.rulesetId).toBe(ruleset.id);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { ability, session } = await createTestSetup();

      await expect(
        SavesMethods.createRulesetSave(session, "00000000-0000-0000-0000-000000000000", {
          name: "Fortitude",
          description: "Physical resistance",
          abilityId: ability.id,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, ability } = await createTestSetup();
      const { session: otherSession } = await createTestSetup();

      await expect(
        SavesMethods.createRulesetSave(otherSession, ruleset.id, {
          name: "Fortitude",
          description: "Physical resistance",
          abilityId: ability.id,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateRulesetSave", () => {
    test("should update a save", async () => {
      const { ruleset, ability, session } = await createTestSetup();

      const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Fortitude",
        description: "Physical resistance",
        abilityId: ability.id,
      });

      const updated = await SavesMethods.updateRulesetSave(session, ruleset.id, save.id, {
        name: "Will",
        description: "Mental resistance",
        abilityId: ability.id,
      });

      expect(updated.name).toBe("Will");
      expect(updated.description).toBe("Mental resistance");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestSetup();

      await expect(
        SavesMethods.updateRulesetSave(
          session,
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000001",
          {
            name: "Will",
            description: "Mental resistance",
            abilityId: "00000000-0000-0000-0000-000000000002",
          },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent save", async () => {
      const { ruleset, ability, session } = await createTestSetup();

      await expect(
        SavesMethods.updateRulesetSave(
          session,
          ruleset.id,
          "00000000-0000-0000-0000-000000000000",
          {
            name: "Will",
            description: "Mental resistance",
            abilityId: ability.id,
          },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, ability, session } = await createTestSetup();
      const { session: otherSession } = await createTestSetup();

      const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Fortitude",
        description: "Physical resistance",
        abilityId: ability.id,
      });

      await expect(
        SavesMethods.updateRulesetSave(otherSession, ruleset.id, save.id, {
          name: "Will",
          description: "Mental resistance",
          abilityId: ability.id,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetSave", () => {
    test("should delete a save", async () => {
      const { ruleset, ability, session } = await createTestSetup();

      const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Fortitude",
        description: "Physical resistance",
        abilityId: ability.id,
      });

      const deleted = await SavesMethods.deleteRulesetSave(session, ruleset.id, save.id);

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(save.id);

      const found = await Saves.findOne(db, { id: save.id });
      expect(found).toBeUndefined();
    });

    test("should throw ConflictError when save is in use by class levels", async () => {
      const { ruleset, ability, session } = await createTestSetup();

      const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Fortitude",
        description: "Physical resistance",
        abilityId: ability.id,
      });

      // Create a class and level that uses this save
      const klasses = await Klasses.create(db, {
        name: `Test Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test class",
        rulesetId: ruleset.id,
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
        { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "2" },
      ]);

      await KlassLevelSaves.createMany(db, [{
        klassLevelId: klassLevel.id,
        saveId: save.id,
        base: 2,
      }]);

      await expect(
        SavesMethods.deleteRulesetSave(session, ruleset.id, save.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestSetup();

      await expect(
        SavesMethods.deleteRulesetSave(
          session,
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000001",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent save", async () => {
      const { ruleset, session } = await createTestSetup();

      await expect(
        SavesMethods.deleteRulesetSave(
          session,
          ruleset.id,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, ability, session } = await createTestSetup();
      const { session: otherSession } = await createTestSetup();

      const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Fortitude",
        description: "Physical resistance",
        abilityId: ability.id,
      });

      await expect(
        SavesMethods.deleteRulesetSave(otherSession, ruleset.id, save.id),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("COW fork", () => {
    test("should throw ConflictError when creating save with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession, ability } = await createTestSetup();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      await SavesMethods.createRulesetSave(parentSession, parentRuleset.id, {
        name: "Fortitude",
        description: "Physical resistance",
        abilityId: ability.id,
      });

      const { session: childSession } = await createTestSetup();
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childSession.userId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      const childAbility = await Abilities.create(db, {
        name: "Dexterity",
        description: "Agility",
        rulesetId: childRuleset.id,
      });

      await expect(
        SavesMethods.createRulesetSave(childSession, childRuleset.id, {
          name: "Fortitude",
          description: "Duplicate name",
          abilityId: childAbility[0].id,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("deleteRulesetSave - cascade", () => {
    test("should hard-delete customizations when deleting save", async () => {
      const { ruleset, ability, session } = await createTestSetup();

      const save = await SavesMethods.createRulesetSave(session, ruleset.id, {
        name: "Save With Customizations",
        description: "Test",
        abilityId: ability.id,
      });

      // Add customizations
      await Modifiers.create(db, {
        sourceId: save.id,
        sourceType: "saves",
        target: "abilities.constitution",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      await Properties.create(db, {
        entityId: save.id,
        entityType: "saves",
        type: "test",
        value: "test",
      });
      await Requirements.create(db, {
        entityId: save.id,
        entityType: "saves",
        level: "character",
        target: "abilities.constitution",
        value: "10",
        valueType: "number",
        operator: "greater_than",
      });

      // Delete the save
      await SavesMethods.deleteRulesetSave(session, ruleset.id, save.id);

      // All customizations should be completely gone
      const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [save.id], sourceType: "saves" });
      const properties = await Properties.findManyByEntity(db, { entityIds: [save.id], entityType: "saves" });
      const requirements = await Requirements.findManyByEntity(db, { entityIds: [save.id], entityType: "saves" });
      expect(modifiers.length).toBe(0);
      expect(properties.length).toBe(0);
      expect(requirements.length).toBe(0);
    });
  });
});
