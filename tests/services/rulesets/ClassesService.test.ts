import { eq } from "drizzle-orm";

import { ClassesMethods } from "@/server/services/rulesets/ClassesService.ts";
import { ClassLevelsMethods } from "@/server/services/rulesets/classes/ClassLevelsService.ts";
import { db } from "@/server/database/index.ts";
import { klassLevelFeatsInRules, klassLevelPowersInRules, klassLevelSavesInRules, klassSkillsInRules } from "@/drizzle/schema.ts";
import { Abilities, Aptitudes, Feats, KlassLevelPowers, KlassLevels, KlassSkills, Modifiers, Powers, Properties, Rulesets, Saves, Skills, Users } from "@/server/repositories/index.ts";
import { ConflictError, NotFoundError, ForbiddenError } from "@/server/errors/index.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("ClassesService", () => {
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
      description: "Test ruleset for classes testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  describe("getRulesetKlasses", () => {
    test("should return classes for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await ClassesMethods.getRulesetKlasses(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassesMethods.getRulesetKlasses(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getRulesetKlass", () => {
    test("should return a specific class for a valid ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create a class first
      const created = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        {
          name: "Test Class",
          description: "A test class",
          hd: 10,
        }
      );

      const klass = await ClassesMethods.getRulesetKlass(
        ruleset.id,
        created.id
      );

      expect(klass).toBeDefined();
      expect(klass.id).toBe(created.id);
      expect(klass.name).toBe("Test Class");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";
      const fakeKlassId = "00000000-0000-0000-0000-000000000001";

      await expect(
        ClassesMethods.getRulesetKlass(fakeRulesetId, fakeKlassId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeKlassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassesMethods.getRulesetKlass(ruleset.id, fakeKlassId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when class exists but not in the specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();

      // Create class in ruleset1
      const created = await ClassesMethods.createRulesetKlass(
        session1,
        ruleset1.id,
        {
          name: "Test Class",
          description: "A test class",
          hd: 10,
        }
      );

      // Try to get it from ruleset2
      await expect(
        ClassesMethods.getRulesetKlass(ruleset2.id, created.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should return null bonusSpellPropertyId when class has no bonus spell property", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ClassesMethods.createRulesetKlass(session, ruleset.id, {
        name: "Fighter",
        description: "No spells",
        hd: 10,
      });

      const klass = await ClassesMethods.getRulesetKlass(ruleset.id, created.id);

      expect(klass.bonusSpellAbilityId).toBeNull();
      expect(klass.bonusSpellPropertyId).toBeNull();
    });

    test("should return bonusSpellPropertyId when class has a bonus spell property", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const created = await ClassesMethods.createRulesetKlass(session, ruleset.id, {
        name: "Wizard",
        description: "A spellcaster",
        hd: 4,
      });

      const abilities = await Abilities.createMany(db, [
        { name: `Int ${Math.random().toString(36).substr(2, 5)}`, description: "Test", rulesetId: ruleset.id },
      ]);

      const props = await Properties.create(db, {
        entityId: created.id,
        entityType: "klasses",
        type: KLASS_BONUS_SPELL_ABILITY_ID,
        value: abilities[0].id,
      });

      const klass = await ClassesMethods.getRulesetKlass(ruleset.id, created.id);

      expect(klass.bonusSpellAbilityId).toBe(abilities[0].id);
      expect(klass.bonusSpellPropertyId).toBe(props[0].id);
    });
  });

  describe("createRulesetKlass", () => {
    test("should create a class with all fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const klassData = {
        name: "Warrior",
        description: "A mighty warrior class",
        hd: 12,
      };

      const klass = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        klassData
      );

      expect(klass).toBeDefined();
      expect(klass.name).toBe(klassData.name);
      expect(klass.description).toBe(klassData.description);
      expect(klass.hd).toBe(12);
      expect(klass.rulesetId).toBe(ruleset.id);
    });

    test("should create a class with default HD of 8 when not provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const klassData = {
        name: "Mage",
        description: "A powerful mage class",
      };

      const klass = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        klassData
      );

      expect(klass).toBeDefined();
      expect(klass.name).toBe(klassData.name);
      expect(klass.description).toBe(klassData.description);
      expect(klass.hd).toBe(8);
      expect(klass.rulesetId).toBe(ruleset.id);
    });

    test("should default to HD of 8 when 0 is explicitly provided (due to falsy check)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const klassData = {
        name: "Special Class",
        description: "A class with no hit dice",
        hd: 0,
      };

      const klass = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        klassData
      );

      expect(klass).toBeDefined();
      expect(klass.hd).toBe(8);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassesMethods.createRulesetKlass(session, fakeRulesetId, {
          name: "Test",
          description: "Test description",
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      await expect(
        ClassesMethods.createRulesetKlass(otherSession, ruleset.id, {
          name: "Test",
          description: "Test description",
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateRulesetKlass", () => {
    test("should update a class with all fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create class first
      const created = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        {
          name: "Original Warrior",
          description: "Original description",
          hd: 10,
        }
      );

      // Update it
      const updateData = {
        name: "Updated Warrior",
        description: "Updated description",
        hd: 12,
      };

      const updated = await ClassesMethods.updateRulesetKlass(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
      expect(updated.hd).toBe(12);
      expect(updated.id).toBe(created.id);
    });

    test("should update only the HD field", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create class first
      const created = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        {
          name: "Rogue",
          description: "A sneaky rogue",
          hd: 6,
        }
      );

      // Update only HD
      const updateData = {
        name: "Rogue",
        description: "A sneaky rogue",
        hd: 8,
      };

      const updated = await ClassesMethods.updateRulesetKlass(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.hd).toBe(8);
      expect(updated.name).toBe(created.name);
      expect(updated.description).toBe(created.description);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassesMethods.updateRulesetKlass(
          session,
          fakeRulesetId,
          "fake-klass-id",
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeKlassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassesMethods.updateRulesetKlass(
          session,
          ruleset.id,
          fakeKlassId,
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when class exists but not in the specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2, session: session2 } = await createTestUserAndRuleset();

      // Create class in ruleset1
      const created = await ClassesMethods.createRulesetKlass(
        session1,
        ruleset1.id,
        {
          name: "Test Class",
          description: "A test class",
          hd: 10,
        }
      );

      // Try to update it from ruleset2
      await expect(
        ClassesMethods.updateRulesetKlass(
          session2,
          ruleset2.id,
          created.id,
          { name: "Updated", description: "Updated" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create class as owner
      const klass = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        { name: "Test", description: "Test" }
      );

      // Try to update as different user
      await expect(
        ClassesMethods.updateRulesetKlass(
          otherSession,
          ruleset.id,
          klass.id,
          { name: "Updated", description: "Updated" }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetKlass", () => {
    test("should delete a class", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create class first
      const created = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        { name: "To Delete", description: "Will be deleted", hd: 10 }
      );

      // Delete it
      const deleted = await ClassesMethods.deleteRulesetKlass(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's deleted by trying to get it
      await expect(
        ClassesMethods.getRulesetKlass(ruleset.id, created.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassesMethods.deleteRulesetKlass(
          session,
          fakeRulesetId,
          "fake-klass-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeKlassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassesMethods.deleteRulesetKlass(
          session,
          ruleset.id,
          fakeKlassId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when class exists but not in the specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2, session: session2 } = await createTestUserAndRuleset();

      // Create class in ruleset1
      const created = await ClassesMethods.createRulesetKlass(
        session1,
        ruleset1.id,
        {
          name: "Test Class",
          description: "A test class",
          hd: 10,
        }
      );

      // Try to delete it from ruleset2
      await expect(
        ClassesMethods.deleteRulesetKlass(
          session2,
          ruleset2.id,
          created.id
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create class as owner
      const klass = await ClassesMethods.createRulesetKlass(
        session,
        ruleset.id,
        { name: "Test", description: "Test" }
      );

      // Try to delete as different user
      await expect(
        ClassesMethods.deleteRulesetKlass(
          otherSession,
          ruleset.id,
          klass.id
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("COW fork", () => {
    test("should throw ConflictError when creating class with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      await ClassesMethods.createRulesetKlass(parentSession, parentRuleset.id, {
        name: "Fighter",
        description: "A warrior class",
      });

      const { session: childSession } = await createTestUserAndRuleset();
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

      await expect(
        ClassesMethods.createRulesetKlass(childSession, childRuleset.id, {
          name: "Fighter",
          description: "Duplicate name",
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("deleteRulesetKlass - cascade", () => {
    test("should cascade delete levels, level join tables, klass skills, and customizations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create supporting entities
      const abilities = await Abilities.createMany(db, [
        { name: `Str ${Math.random().toString(36).substr(2, 5)}`, description: "Test", rulesetId: ruleset.id },
      ]);
      const aptitudes = await Aptitudes.create(db, {
        name: `Apt ${Math.random().toString(36).substr(2, 5)}`,
        description: "Test",
        rulesetId: ruleset.id,
      });
      const feats = await Feats.create(db, {
        name: `Feat ${Math.random().toString(36).substr(2, 5)}`,
        description: "Test",
        rulesetId: ruleset.id,
      });
      const powers = await Powers.create(db, {
        name: `Power ${Math.random().toString(36).substr(2, 5)}`,
        description: "Test",
        rulesetId: ruleset.id,
      });
      const saves = await Saves.create(db, {
        name: `Save ${Math.random().toString(36).substr(2, 5)}`,
        description: "Test",
        abilityId: abilities[0].id,
        rulesetId: ruleset.id,
      });
      const skills = await Skills.create(db, {
        name: `Skill ${Math.random().toString(36).substr(2, 5)}`,
        description: "Test",
        primaryAbilityId: abilities[0].id,
        rulesetId: ruleset.id,
      });

      // Create a class
      const klass = await ClassesMethods.createRulesetKlass(session, ruleset.id, {
        name: `Class ${Math.random().toString(36).substr(2, 5)}`,
        description: "Test class with full setup",
      });

      // Add a class skill
      await KlassSkills.create(db, { klassId: klass.id, skillId: skills[0].id });

      // Create a level with feats and saves
      const level = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
        feats: [{ featId: feats[0].id, aptitudeId: aptitudes[0].id }],
        saves: [{ saveId: saves[0].id, base: 2 }],
      });
      // Powers on levels are created directly (not via createClassLevel)
      await KlassLevelPowers.create(db, {
        klassLevelId: level.id,
        powerId: powers[0].id,
        aptitudeId: aptitudes[0].id,
      });

      // Add customizations to the klass and level
      await Modifiers.create(db, {
        sourceId: klass.id,
        sourceType: "klasses",
        target: "abilities.strength",
        value: "2",
        valueType: "number",
        operator: "add",
      });
      await Modifiers.create(db, {
        sourceId: level.id,
        sourceType: "klass_levels",
        target: "abilities.strength",
        value: "1",
        valueType: "number",
        operator: "add",
      });

      // Delete the class
      await ClassesMethods.deleteRulesetKlass(session, ruleset.id, klass.id);

      // Level should be soft-deleted (archived)
      const archivedLevel = await KlassLevels.findOne(db, { id: level.id });
      expect(archivedLevel).toBeUndefined(); // findOne filters out deleted

      // Level join tables should be hard-deleted
      const levelFeats = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.klassLevelId, level.id));
      const levelPowers = await db.select().from(klassLevelPowersInRules)
        .where(eq(klassLevelPowersInRules.klassLevelId, level.id));
      const levelSaves = await db.select().from(klassLevelSavesInRules)
        .where(eq(klassLevelSavesInRules.klassLevelId, level.id));
      expect(levelFeats.length).toBe(0);
      expect(levelPowers.length).toBe(0);
      expect(levelSaves.length).toBe(0);

      // Klass skills should be hard-deleted
      const klassSkillRows = await db.select().from(klassSkillsInRules)
        .where(eq(klassSkillsInRules.klassId, klass.id));
      expect(klassSkillRows.length).toBe(0);

      // Customizations should be hard-deleted
      const klassModifiers = await Modifiers.findManyBySource(db, { sourceIds: [klass.id], sourceType: "klasses" });
      const levelModifiers = await Modifiers.findManyBySource(db, { sourceIds: [level.id], sourceType: "klass_levels" });
      expect(klassModifiers.length).toBe(0);
      expect(levelModifiers.length).toBe(0);
    });
  });
});
