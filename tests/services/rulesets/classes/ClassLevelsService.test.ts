import { eq } from "drizzle-orm";

import { ClassLevelsMethods } from "@/server/services/rulesets/classes/ClassLevelsService.ts";
import { db } from "@/server/database/index.ts";
import { klassLevelFeatsInRules, klassLevelPowersInRules, klassLevelSavesInRules } from "@/drizzle/schema.ts";
import {
  Abilities,
  Aptitudes,
  EntitySnapshots,
  Feats,
  Klasses,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassLevelSaves,
  Modifiers,
  Powers,
  Properties,
  Requirements,
  Rulesets,
  Saves,
  Users,
} from "@/server/repositories/index.ts";
import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("ClassLevelsService", () => {
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

  // Helper to create test user, ruleset, and class
  async function createTestUserRulesetAndClass() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for class levels testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    const klasses = await Klasses.create(db, {
      name: `Test Class ${uniqueId}`,
      description: "Test class for levels testing",
      rulesetId: ruleset.id,
      hd: 8,
    });
    const klass = klasses[0];

    return { user, ruleset, klass, session: createTestSession(user.id) };
  }

  // Helper to create a test aptitude
  async function createTestAptitude(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const aptitudes = await Aptitudes.create(db, {
      name: `Test Aptitude ${uniqueId}`,
      description: "Test aptitude for feat testing",
      rulesetId,
    });
    return aptitudes[0];
  }

  // Helper to create a test feat
  async function createTestFeat(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const feats = await Feats.create(db, {
      name: `Test Feat ${uniqueId}`,
      description: "Test feat for class level testing",
      rulesetId,
    });
    return feats[0];
  }

  // Helper to create a test ability
  async function createTestAbility(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const abilities = await Abilities.create(db, {
      name: `Test Ability ${uniqueId}`,
      description: "Test ability for save testing",
      rulesetId,
    });
    return abilities[0];
  }

  // Helper to create a test save
  async function createTestSave(rulesetId: string, abilityId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const saves = await Saves.create(db, {
      name: `Test Save ${uniqueId}`,
      description: "Test save for class level testing",
      rulesetId,
      abilityId,
    });
    return saves[0];
  }

  describe("getRulesetKlassLevels", () => {
    test("should return empty array when class has no levels", async () => {
      const { ruleset, klass } = await createTestUserRulesetAndClass();

      const levels = await ClassLevelsMethods.getRulesetKlassLevels(
        ruleset.id,
        klass.id
      );

      expect(levels).toBeDefined();
      expect(Array.isArray(levels)).toBe(true);
      expect(levels.length).toBe(0);
    });

    test("should return class levels with feats", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await createTestFeat(ruleset.id);

      // Create a class level with a feat
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
        feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
      });

      const levels = await ClassLevelsMethods.getRulesetKlassLevels(
        ruleset.id,
        klass.id
      );

      expect(levels.length).toBe(1);
      expect(levels[0].level).toBe(1);
      expect(levels[0].bab).toBe(1);
      expect(levels[0].skills).toBe(4);
      expect(levels[0].feats).toBeDefined();
      expect(levels[0].feats.length).toBe(1);
      expect(levels[0].feats[0].id).toBe(feat.id);
    });

    test("should return multiple class levels ordered by level", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      // Create multiple levels
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 2,
        bab: 2,
        skills: 4,
      });

      const levels = await ClassLevelsMethods.getRulesetKlassLevels(
        ruleset.id,
        klass.id
      );

      expect(levels.length).toBe(2);
      expect(levels[0].level).toBe(1);
      expect(levels[1].level).toBe(2);
    });

    test("should return class levels with saves data", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const ability = await createTestAbility(ruleset.id);
      const save = await createTestSave(ruleset.id, ability.id);

      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
        saves: [{ saveId: save.id, base: 2 }],
      });

      const levels = await ClassLevelsMethods.getRulesetKlassLevels(
        ruleset.id,
        klass.id
      );

      expect(levels.length).toBe(1);
      expect(levels[0].saves).toBeDefined();
      expect(levels[0].saves.length).toBe(1);
      expect(levels[0].saves[0].saveId).toBe(save.id);
      expect(levels[0].saves[0].base).toBe(2);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset } = await createTestUserRulesetAndClass();
      const fakeClassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.getRulesetKlassLevels(ruleset.id, fakeClassId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getClassLevels", () => {
    test("should return class levels for valid class", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });

      const levels = await ClassLevelsMethods.getClassLevels(
        ruleset.id,
        klass.id
      );

      expect(levels).toBeDefined();
      expect(levels.length).toBe(1);
      expect(levels[0].level).toBe(1);
    });

    test("should return class levels with feats and saves", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await createTestFeat(ruleset.id);
      const ability = await createTestAbility(ruleset.id);
      const save = await createTestSave(ruleset.id, ability.id);

      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
        feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
        saves: [{ saveId: save.id, base: 2 }],
      });

      const levels = await ClassLevelsMethods.getClassLevels(
        ruleset.id,
        klass.id
      );

      expect(levels.length).toBe(1);
      expect(levels[0].feats.length).toBe(1);
      expect(levels[0].feats[0].id).toBe(feat.id);
      expect(levels[0].saves.length).toBe(1);
      expect(levels[0].saves[0].saveId).toBe(save.id);
      expect(levels[0].saves[0].base).toBe(2);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset } = await createTestUserRulesetAndClass();
      const fakeClassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.getClassLevels(ruleset.id, fakeClassId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getClassLevel", () => {
    test("should return a specific class level", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      const level = await ClassLevelsMethods.getClassLevel(
        ruleset.id,
        klass.id,
        created.id
      );

      expect(level).toBeDefined();
      expect(level.id).toBe(created.id);
      expect(level.level).toBe(1);
      expect(level.bab).toBe(1);
      expect(level.skills).toBe(4);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset } = await createTestUserRulesetAndClass();
      const fakeClassId = "00000000-0000-0000-0000-000000000000";
      const fakeLevelId = "00000000-0000-0000-0000-000000000001";

      await expect(
        ClassLevelsMethods.getClassLevel(ruleset.id, fakeClassId, fakeLevelId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent level", async () => {
      const { ruleset, klass } = await createTestUserRulesetAndClass();
      const fakeLevelId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.getClassLevel(ruleset.id, klass.id, fakeLevelId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getClassLevelById", () => {
    test("should return class level with class name", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      const level = await ClassLevelsMethods.getClassLevelById(
        ruleset.id,
        created.id
      );

      expect(level).toBeDefined();
      expect(level.id).toBe(created.id);
      expect(level.name).toBe(klass.name);
    });

    test("should throw NotFoundError for non-existent level", async () => {
      const { ruleset } = await createTestUserRulesetAndClass();
      const fakeLevelId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.getClassLevelById(ruleset.id, fakeLevelId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when class not in ruleset", async () => {
      const { ruleset: ruleset1, klass, session } = await createTestUserRulesetAndClass();
      const { ruleset: ruleset2 } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset1.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      await expect(
        ClassLevelsMethods.getClassLevelById(ruleset2.id, created.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createClassLevel", () => {
    test("should create a class level with all fields", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const levelData = {
        level: 1,
        bab: 1,
        skills: 4,
      };

      const level = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        levelData
      );

      expect(level).toBeDefined();
      expect(level.level).toBe(levelData.level);
      expect(level.bab).toBe(1);
      expect(level.skills).toBe(levelData.skills);
      expect(level.klassId).toBe(klass.id);
    });

    test("should create a class level with minimal fields", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const levelData = {
        level: 1,
        bab: 0,
        skills: 2,
      };

      const level = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        levelData
      );

      expect(level).toBeDefined();
      expect(level.level).toBe(1);
      expect(level.klassId).toBe(klass.id);
    });

    test("should create class level with feats", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await createTestFeat(ruleset.id);

      const level = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
        }
      );

      expect(level).toBeDefined();

      // Verify feat was associated
      const levelFeats = await KlassLevelFeats.findMany(db, {
        klassLevelIds: [level.id],
      });
      expect(levelFeats.length).toBe(1);
      expect(levelFeats[0].featId).toBe(feat.id);
      expect(levelFeats[0].aptitudeId).toBe(aptitude.id);
    });

    test("should create class level with multiple feats", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat1 = await createTestFeat(ruleset.id);
      const feat2 = await createTestFeat(ruleset.id);

      const level = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [
            { featId: feat1.id, aptitudeId: aptitude.id },
            { featId: feat2.id, aptitudeId: aptitude.id },
          ],
        }
      );

      const levelFeats = await KlassLevelFeats.findMany(db, {
        klassLevelIds: [level.id],
      });
      expect(levelFeats.length).toBe(2);
    });

    test("should create class level with saves", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const ability = await createTestAbility(ruleset.id);
      const save1 = await createTestSave(ruleset.id, ability.id);
      const save2 = await createTestSave(ruleset.id, ability.id);

      const level = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          saves: [
            { saveId: save1.id, base: 2 },
            { saveId: save2.id, base: 0 },
          ],
        }
      );

      expect(level).toBeDefined();

      const levelSaves = await KlassLevelSaves.findMany(db, {
        klassLevelIds: [level.id],
      });
      expect(levelSaves.length).toBe(2);
      expect(levelSaves.some((ls) => ls.saveId === save1.id && ls.base === 2)).toBe(true);
      expect(levelSaves.some((ls) => ls.saveId === save2.id && ls.base === 0)).toBe(true);
    });

    test("should create requirement for level > 1", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      // Create level 1
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });

      // Create level 2
      const level2 = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 2,
          bab: 2,
          skills: 4,
        }
      );

      // Check if requirement was created
      const requirements = await Requirements.findManyByEntity(db, {
        entityIds: [level2.id],
        entityType: "klass_levels",
      });

      expect(requirements.length).toBeGreaterThan(0);
      const levelRequirement = requirements.find(
        (req) => req.operator === "greater_than" && req.value === "1"
      );
      expect(levelRequirement).toBeDefined();
    });

    test("should not create requirement for level 1", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const level1 = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      const requirements = await Requirements.findManyByEntity(db, {
        entityIds: [level1.id],
        entityType: "klass_levels",
      });

      expect(requirements.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { klass, session } = await createTestUserRulesetAndClass();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.createClassLevel(
          session,
          fakeRulesetId,
          klass.id,
          {
            level: 1,
            bab: 1,
            skills: 4,
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset, session } = await createTestUserRulesetAndClass();
      const fakeClassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.createClassLevel(
          session,
          ruleset.id,
          fakeClassId,
          {
            level: 1,
            bab: 1,
            skills: 4,
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, klass } = await createTestUserRulesetAndClass();
      const { session: otherSession } = await createTestUserRulesetAndClass();

      await expect(
        ClassLevelsMethods.createClassLevel(
          otherSession,
          ruleset.id,
          klass.id,
          {
            level: 1,
            bab: 1,
            skills: 4,
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateClassLevel", () => {
    test("should update class level stats", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      const updateData = {
        bab: 2,
        skills: 6,
      };

      const updated = await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        updateData
      );

      expect(updated.bab).toBe(2);
      expect(updated.skills).toBe(6);
    });

    test("should update class level feats", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat1 = await createTestFeat(ruleset.id);
      const feat2 = await createTestFeat(ruleset.id);

      // Create level with initial feat
      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [{ featId: feat1.id, aptitudeId: aptitude.id }],
        }
      );

      // Update with different feat
      await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        {
          feats: [{ featId: feat2.id, aptitudeId: aptitude.id }],
        }
      );

      // Verify old feat was removed and new feat added
      const levelFeats = await KlassLevelFeats.findMany(db, {
        klassLevelIds: [created.id],
      });
      expect(levelFeats.length).toBe(1);
      expect(levelFeats[0].featId).toBe(feat2.id);
    });

    test("should clear feats when updating with empty array", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await createTestFeat(ruleset.id);

      // Create level with feat
      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
        }
      );

      // Update with empty feats array
      await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        {
          feats: [],
        }
      );

      // Verify feats were cleared
      const levelFeats = await KlassLevelFeats.findMany(db, {
        klassLevelIds: [created.id],
      });
      expect(levelFeats.length).toBe(0);
    });

    test("should update class level saves", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const ability = await createTestAbility(ruleset.id);
      const save1 = await createTestSave(ruleset.id, ability.id);
      const save2 = await createTestSave(ruleset.id, ability.id);

      // Create level with initial save
      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          saves: [{ saveId: save1.id, base: 2 }],
        }
      );

      // Update with different save
      await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        {
          saves: [{ saveId: save2.id, base: 3 }],
        }
      );

      const levelSaves = await KlassLevelSaves.findMany(db, {
        klassLevelIds: [created.id],
      });
      expect(levelSaves.length).toBe(1);
      expect(levelSaves[0].saveId).toBe(save2.id);
      expect(levelSaves[0].base).toBe(3);
    });

    test("should clear saves when updating with empty array", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const ability = await createTestAbility(ruleset.id);
      const save = await createTestSave(ruleset.id, ability.id);

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          saves: [{ saveId: save.id, base: 2 }],
        }
      );

      await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        {
          saves: [],
        }
      );

      const levelSaves = await KlassLevelSaves.findMany(db, {
        klassLevelIds: [created.id],
      });
      expect(levelSaves.length).toBe(0);
    });

    test("should not change feats when feats field not provided", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await createTestFeat(ruleset.id);

      // Create level with feat
      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
        }
      );

      // Update without feats field
      await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        {
          bab: 2,
        }
      );

      // Verify feats were not changed
      const levelFeats = await KlassLevelFeats.findMany(db, {
        klassLevelIds: [created.id],
      });
      expect(levelFeats.length).toBe(1);
      expect(levelFeats[0].featId).toBe(feat.id);
    });

    test("should hard-delete old feats when updating (rows removed from DB)", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat1 = await createTestFeat(ruleset.id);
      const feat2 = await createTestFeat(ruleset.id);

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [{ featId: feat1.id, aptitudeId: aptitude.id }],
        }
      );

      // Update with different feat
      await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        {
          feats: [{ featId: feat2.id, aptitudeId: aptitude.id }],
        }
      );

      // Old feat association should be completely gone (hard-deleted)
      const rawFeats = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.klassLevelId, created.id));
      expect(rawFeats.length).toBe(1);
      expect(rawFeats[0].featId).toBe(feat2.id);
      expect(rawFeats[0].deletedAt).toBeNull();
    });

    test("should hard-delete old saves when updating (rows removed from DB)", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const ability = await createTestAbility(ruleset.id);
      const save1 = await createTestSave(ruleset.id, ability.id);
      const save2 = await createTestSave(ruleset.id, ability.id);

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          saves: [{ saveId: save1.id, base: 2 }],
        }
      );

      // Update with different save
      await ClassLevelsMethods.updateClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id,
        {
          saves: [{ saveId: save2.id, base: 3 }],
        }
      );

      // Old save association should be completely gone (hard-deleted)
      const rawSaves = await db.select().from(klassLevelSavesInRules)
        .where(eq(klassLevelSavesInRules.klassLevelId, created.id));
      expect(rawSaves.length).toBe(1);
      expect(rawSaves[0].saveId).toBe(save2.id);
      expect(rawSaves[0].deletedAt).toBeNull();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { klass, session } = await createTestUserRulesetAndClass();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";
      const fakeLevelId = "00000000-0000-0000-0000-000000000001";

      await expect(
        ClassLevelsMethods.updateClassLevel(
          session,
          fakeRulesetId,
          klass.id,
          fakeLevelId,
          { bab: 2 }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset, session } = await createTestUserRulesetAndClass();
      const fakeClassId = "00000000-0000-0000-0000-000000000000";
      const fakeLevelId = "00000000-0000-0000-0000-000000000001";

      await expect(
        ClassLevelsMethods.updateClassLevel(
          session,
          ruleset.id,
          fakeClassId,
          fakeLevelId,
          { bab: 2 }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent level", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const fakeLevelId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.updateClassLevel(
          session,
          ruleset.id,
          klass.id,
          fakeLevelId,
          { bab: 2 }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const { session: otherSession } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      await expect(
        ClassLevelsMethods.updateClassLevel(
          otherSession,
          ruleset.id,
          klass.id,
          created.id,
          { bab: 2 }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteClassLevel", () => {
    test("should delete a class level", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      const deleted = await ClassLevelsMethods.deleteClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it was deleted
      const level = await KlassLevels.findOne(db, { id: created.id });
      expect(level).toBeUndefined();
    });

    test("should delete associated requirements", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      // Create level 1
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });

      // Create level 2 (which creates a requirement)
      const level2 = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 2,
          bab: 2,
          skills: 4,
        }
      );

      // Delete level 2
      await ClassLevelsMethods.deleteClassLevel(
        session,
        ruleset.id,
        klass.id,
        level2.id
      );

      // Verify requirements were deleted
      const requirements = await Requirements.findManyByEntity(db, {
        entityIds: [level2.id],
        entityType: "klass_levels",
      });
      expect(requirements.length).toBe(0);
    });

    test("should delete associated properties", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      // Manually add a property
      await Properties.create(db, {
        entityId: created.id,
        entityType: "klass_levels",
        type: "test_type",
        value: "test_value",
      });

      // Delete the level
      await ClassLevelsMethods.deleteClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id
      );

      // Verify properties were deleted
      const properties = await Properties.findManyByEntity(db, {
        entityIds: [created.id],
        entityType: "klass_levels",
      });
      expect(properties.length).toBe(0);
    });

    test("should delete associated modifiers", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      // Manually add a modifier
      await Modifiers.create(db, {
        sourceId: created.id,
        sourceType: "klass_levels",
        target: "abilities.strength",
        value: "2",
        valueType: "number",
        operator: "add",
      });

      // Delete the level
      await ClassLevelsMethods.deleteClassLevel(
        session,
        ruleset.id,
        klass.id,
        created.id
      );

      // Verify modifiers were deleted
      const modifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [created.id],
        sourceType: "klass_levels",
      });
      expect(modifiers.length).toBe(0);
    });

    test("should hard-delete all join tables when deleting level", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await createTestFeat(ruleset.id);
      const ability = await createTestAbility(ruleset.id);
      const save = await createTestSave(ruleset.id, ability.id);

      // Create a power
      const powers = await Powers.create(db, {
        name: `Power ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: ruleset.id,
      });

      const created = await ClassLevelsMethods.createClassLevel(
        session, ruleset.id, klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
          feats: [{ featId: feat.id, aptitudeId: aptitude.id }],
          saves: [{ saveId: save.id, base: 2 }],
        }
      );
      // Powers on levels are created directly (not via createClassLevel)
      await KlassLevelPowers.create(db, {
        klassLevelId: created.id,
        powerId: powers[0].id,
        aptitudeId: aptitude.id,
      });

      // Verify all join tables have rows
      let rawFeats = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.klassLevelId, created.id));
      let rawPowers = await db.select().from(klassLevelPowersInRules)
        .where(eq(klassLevelPowersInRules.klassLevelId, created.id));
      let rawSaves = await db.select().from(klassLevelSavesInRules)
        .where(eq(klassLevelSavesInRules.klassLevelId, created.id));
      expect(rawFeats.length).toBe(1);
      expect(rawPowers.length).toBe(1);
      expect(rawSaves.length).toBe(1);

      // Delete the level
      await ClassLevelsMethods.deleteClassLevel(session, ruleset.id, klass.id, created.id);

      // All join table rows should be completely gone (hard-deleted)
      rawFeats = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.klassLevelId, created.id));
      rawPowers = await db.select().from(klassLevelPowersInRules)
        .where(eq(klassLevelPowersInRules.klassLevelId, created.id));
      rawSaves = await db.select().from(klassLevelSavesInRules)
        .where(eq(klassLevelSavesInRules.klassLevelId, created.id));
      expect(rawFeats.length).toBe(0);
      expect(rawPowers.length).toBe(0);
      expect(rawSaves.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { klass, session } = await createTestUserRulesetAndClass();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";
      const fakeLevelId = "00000000-0000-0000-0000-000000000001";

      await expect(
        ClassLevelsMethods.deleteClassLevel(
          session,
          fakeRulesetId,
          klass.id,
          fakeLevelId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset, session } = await createTestUserRulesetAndClass();
      const fakeClassId = "00000000-0000-0000-0000-000000000000";
      const fakeLevelId = "00000000-0000-0000-0000-000000000001";

      await expect(
        ClassLevelsMethods.deleteClassLevel(
          session,
          ruleset.id,
          fakeClassId,
          fakeLevelId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent level", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const fakeLevelId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassLevelsMethods.deleteClassLevel(
          session,
          ruleset.id,
          klass.id,
          fakeLevelId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const { session: otherSession } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        session,
        ruleset.id,
        klass.id,
        {
          level: 1,
          bab: 1,
          skills: 4,
        }
      );

      await expect(
        ClassLevelsMethods.deleteClassLevel(
          otherSession,
          ruleset.id,
          klass.id,
          created.id
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("getClassLevelFeatPools", () => {
    test("should return empty featPools for class with no modifiers", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1, bab: 1, skills: 4,
      });

      const result = await ClassLevelsMethods.getClassLevelFeatPools(ruleset.id, klass.id);

      expect(result.length).toBe(1);
      expect(result[0].featPools).toEqual({});
    });

    test("should compute cumulative allowed counts from modifiers", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);

      const level1 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1, bab: 1, skills: 4,
      });
      const level2 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 2, bab: 2, skills: 4,
      });
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 3, bab: 3, skills: 4,
      });

      // Level 1 and 2 grant 1 pick each; level 3 has none
      const aptSlug = aptitude.name.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
      await Modifiers.createMany(db, [
        { sourceId: level1.id, sourceType: "klass_levels", target: `aptitudes.${aptSlug}.allowed`, value: "1", valueType: "number", operator: "add" },
        { sourceId: level2.id, sourceType: "klass_levels", target: `aptitudes.${aptSlug}.allowed`, value: "1", valueType: "number", operator: "add" },
      ]);

      const result = await ClassLevelsMethods.getClassLevelFeatPools(ruleset.id, klass.id);
      const sorted = result.sort((a, b) => a.level - b.level);

      expect(sorted[0].featPools).toEqual({ [aptitude.name]: 1 });
      expect(sorted[1].featPools).toEqual({ [aptitude.name]: 2 });
      expect(sorted[2].featPools).toEqual({ [aptitude.name]: 2 });
    });

    test("should only match feat pool modifiers, not spell modifiers", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const aptitude = await createTestAptitude(ruleset.id);

      const level1 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1, bab: 1, skills: 4,
      });

      const aptSlug = aptitude.name.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
      await Modifiers.createMany(db, [
        // Feat pool modifier (should be included)
        { sourceId: level1.id, sourceType: "klass_levels", target: `aptitudes.${aptSlug}.allowed`, value: "1", valueType: "number", operator: "add" },
        // Spell modifier (should be excluded — has numeric segment)
        { sourceId: level1.id, sourceType: "klass_levels", target: "aptitudes.wizardspells.0.uses", value: "3", valueType: "number", operator: "add" },
        { sourceId: level1.id, sourceType: "klass_levels", target: "aptitudes.wizardspells.1.uses", value: "1", valueType: "number", operator: "add" },
      ]);

      const result = await ClassLevelsMethods.getClassLevelFeatPools(ruleset.id, klass.id);

      expect(result[0].featPools).toEqual({ [aptitude.name]: 1 });
    });

    test("should return empty array for class with no levels", async () => {
      const { ruleset, klass } = await createTestUserRulesetAndClass();

      const result = await ClassLevelsMethods.getClassLevelFeatPools(ruleset.id, klass.id);

      expect(result).toEqual([]);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { klass } = await createTestUserRulesetAndClass();

      await expect(
        ClassLevelsMethods.getClassLevelFeatPools("00000000-0000-0000-0000-000000000000", klass.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset } = await createTestUserRulesetAndClass();

      await expect(
        ClassLevelsMethods.getClassLevelFeatPools(ruleset.id, "00000000-0000-0000-0000-000000000000")
      ).rejects.toThrow(NotFoundError);
    });

    test("should include feat pools from stackable feats granted at class levels", async () => {
      // Regression test: aptitude pools granted by feats on class levels (e.g. "Bonus Feat (Fighter)")
      // were missing because only klass_level-sourced modifiers were fetched. Stackable feats share
      // one feat record linked to multiple levels, so the modifier must be duplicated per link.
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();
      const poolAptitude = await createTestAptitude(ruleset.id);
      const grantAptitude = await createTestAptitude(ruleset.id);

      // Create a stackable feat that grants 1 pool pick
      const aptSlug = poolAptitude.name.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
      const stackableFeat = await Feats.create(db, {
        name: `Bonus Pool ${Math.random().toString(36).substr(2, 5)}`,
        description: "Grants a pool pick",
        rulesetId: ruleset.id,
        stackable: true,
      });
      await Modifiers.createMany(db, [{
        sourceId: stackableFeat[0].id,
        sourceType: "feats",
        target: `aptitudes.${aptSlug}.allowed`,
        value: "1",
        valueType: "number",
        operator: "add",
      }]);

      // Create 3 levels, grant the stackable feat at levels 1 and 2, skip level 3
      const level1 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1, bab: 1, skills: 4,
      });
      const level2 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 2, bab: 2, skills: 4,
      });
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 3, bab: 3, skills: 4,
      });

      await KlassLevelFeats.create(db, {
        klassLevelId: level1.id, featId: stackableFeat[0].id, aptitudeId: grantAptitude.id, free: true,
      });
      await KlassLevelFeats.create(db, {
        klassLevelId: level2.id, featId: stackableFeat[0].id, aptitudeId: grantAptitude.id, free: true,
      });

      const result = await ClassLevelsMethods.getClassLevelFeatPools(ruleset.id, klass.id);
      const sorted = result.sort((a, b) => a.level - b.level);

      // Cumulative: L1=1, L2=2, L3=2 (no new grant)
      expect(sorted[0].featPools).toEqual({ [poolAptitude.name]: 1 });
      expect(sorted[1].featPools).toEqual({ [poolAptitude.name]: 2 });
      expect(sorted[2].featPools).toEqual({ [poolAptitude.name]: 2 });
    });
  });

  describe("getClassLevelSpells", () => {
    test("should return empty spellsPerDay for class with no modifiers", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1, bab: 1, skills: 4,
      });

      const result = await ClassLevelsMethods.getClassLevelSpells(ruleset.id, klass.id);

      expect(result.length).toBe(1);
      expect(result[0].spellsPerDay).toEqual({});
    });

    test("should compute cumulative spells per day from modifiers", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const level1 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1, bab: 0, skills: 2,
      });
      const level2 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 2, bab: 1, skills: 2,
      });

      // Simulate spell modifiers: level 1 grants 3 0th-level and 1 1st-level
      await Modifiers.createMany(db, [
        { sourceId: level1.id, sourceType: "klass_levels", target: "aptitudes.wizardspells.0.uses", value: "3", valueType: "number", operator: "add" },
        { sourceId: level1.id, sourceType: "klass_levels", target: "aptitudes.wizardspells.1.uses", value: "1", valueType: "number", operator: "add" },
        // Level 2 adds 1 more 0th-level and 1 more 1st-level
        { sourceId: level2.id, sourceType: "klass_levels", target: "aptitudes.wizardspells.0.uses", value: "1", valueType: "number", operator: "add" },
        { sourceId: level2.id, sourceType: "klass_levels", target: "aptitudes.wizardspells.1.uses", value: "1", valueType: "number", operator: "add" },
      ]);

      const result = await ClassLevelsMethods.getClassLevelSpells(ruleset.id, klass.id);
      const sorted = result.sort((a, b) => a.level - b.level);

      expect(sorted[0].spellsPerDay).toEqual({ 0: 3, 1: 1 });
      expect(sorted[1].spellsPerDay).toEqual({ 0: 4, 1: 2 });
    });

    test("should only match spell modifiers, not non-spell aptitude modifiers", async () => {
      const { ruleset, klass, session } = await createTestUserRulesetAndClass();

      const level1 = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klass.id, {
        level: 1, bab: 1, skills: 4,
      });

      // Spell modifier (should be included)
      await Modifiers.create(db, {
        sourceId: level1.id, sourceType: "klass_levels",
        target: "aptitudes.wizardspells.0.uses", value: "3",
        valueType: "number", operator: "add",
      });
      // Non-spell aptitude modifier — no numeric spell level (should be excluded)
      await Modifiers.create(db, {
        sourceId: level1.id, sourceType: "klass_levels",
        target: "aptitudes.fighter_bonus_feat.allowed", value: "1",
        valueType: "number", operator: "add",
      });

      const result = await ClassLevelsMethods.getClassLevelSpells(ruleset.id, klass.id);

      expect(result[0].spellsPerDay).toEqual({ 0: 3 });
    });

    test("should return empty array for class with no levels", async () => {
      const { ruleset, klass } = await createTestUserRulesetAndClass();

      const result = await ClassLevelsMethods.getClassLevelSpells(ruleset.id, klass.id);

      expect(result).toEqual([]);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { klass } = await createTestUserRulesetAndClass();

      await expect(
        ClassLevelsMethods.getClassLevelSpells("00000000-0000-0000-0000-000000000000", klass.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset } = await createTestUserRulesetAndClass();

      await expect(
        ClassLevelsMethods.getClassLevelSpells(ruleset.id, "00000000-0000-0000-0000-000000000000")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("COW fork", () => {
    async function createCOWFork() {
      // Create parent with class
      const { ruleset: parentRuleset, klass: parentKlass, session: parentSession } =
        await createTestUserRulesetAndClass();

      // Publish parent
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      // Create child fork owner
      const { session: childSession } = await createTestUserRulesetAndClass();
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

      return { parentRuleset, parentKlass, parentSession, childRuleset, childSession };
    }

    test("should get class levels for inherited parent class via getRulesetKlassLevels", async () => {
      const { parentRuleset, parentKlass, parentSession, childRuleset } = await createCOWFork();

      // Create level in parent
      await ClassLevelsMethods.createClassLevel(parentSession, parentRuleset.id, parentKlass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });

      // Read from child fork
      const levels = await ClassLevelsMethods.getRulesetKlassLevels(childRuleset.id, parentKlass.id);

      expect(levels.length).toBe(1);
      expect(levels[0].level).toBe(1);
      expect(levels[0].bab).toBe(1);
    });

    test("should get class levels for inherited parent class via getClassLevels", async () => {
      const { parentRuleset, parentKlass, parentSession, childRuleset } = await createCOWFork();

      await ClassLevelsMethods.createClassLevel(parentSession, parentRuleset.id, parentKlass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });

      const levels = await ClassLevelsMethods.getClassLevels(childRuleset.id, parentKlass.id);

      expect(levels.length).toBe(1);
      expect(levels[0].level).toBe(1);
    });

    test("should get specific class level for inherited parent class via getClassLevel", async () => {
      const { parentRuleset, parentKlass, parentSession, childRuleset } = await createCOWFork();

      const created = await ClassLevelsMethods.createClassLevel(parentSession, parentRuleset.id, parentKlass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });

      const level = await ClassLevelsMethods.getClassLevel(childRuleset.id, parentKlass.id, created.id);

      expect(level).toBeDefined();
      expect(level.id).toBe(created.id);
      expect(level.level).toBe(1);
    });

    test("should get class level by ID for inherited parent class via getClassLevelById", async () => {
      const { parentRuleset, parentKlass, parentSession, childRuleset } = await createCOWFork();

      const created = await ClassLevelsMethods.createClassLevel(parentSession, parentRuleset.id, parentKlass.id, {
        level: 1,
        bab: 1,
        skills: 4,
      });

      const level = await ClassLevelsMethods.getClassLevelById(childRuleset.id, created.id);

      expect(level).toBeDefined();
      expect(level.id).toBe(created.id);
      expect(level.name).toBe(parentKlass.name);
    });

    test("should create class level for inherited parent class in child fork", async () => {
      const { parentKlass, childRuleset, childSession } = await createCOWFork();

      // Parent has no levels — capture baseline.
      const parentLevelsBefore = await KlassLevels.findManyByKlass(db, { klassId: parentKlass.id });

      const level = await ClassLevelsMethods.createClassLevel(
        childSession,
        childRuleset.id,
        parentKlass.id,
        { level: 1, bab: 1, skills: 4 },
      );

      expect(level).toBeDefined();
      expect(level.level).toBe(1);
      // The new level must belong to the COW'd klass, not the parent's klass.
      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: parentKlass.id,
        rulesetId: childRuleset.id,
      });
      expect(snapshot).toBeDefined();
      expect(level.klassId).toBe(snapshot!.forkedEntityId);
      expect(level.klassId).not.toBe(parentKlass.id);

      // Parent klass must not have gained a level.
      const parentLevelsAfter = await KlassLevels.findManyByKlass(db, { klassId: parentKlass.id });
      expect(parentLevelsAfter.length).toBe(parentLevelsBefore.length);
    });

    test("should update class level for inherited parent class in child fork", async () => {
      const { parentKlass, childRuleset, childSession } = await createCOWFork();

      const created = await ClassLevelsMethods.createClassLevel(
        childSession,
        childRuleset.id,
        parentKlass.id,
        { level: 1, bab: 1, skills: 4 },
      );

      const updated = await ClassLevelsMethods.updateClassLevel(
        childSession,
        childRuleset.id,
        parentKlass.id,
        created.id,
        { bab: 2, skills: 6 },
      );

      expect(updated.bab).toBe(2);
      expect(updated.skills).toBe(6);
    });

    test("partial bab update on inherited level keeps parent's skills (no silent zero)", async () => {
      // Regression: rulesetData.propertiesByEntity is composed at the start of
      // withRulesetScope. If the very first update on an inherited klass-level
      // triggers cowEntityForCustomization mid-call, the new level's properties
      // exist in the DB but not in the pre-COW cache. A naive cache lookup
      // returns [] and readCurrentValues defaults skills to 0, so a partial
      // body of { bab: X } silently zeroes skills on the COW row.
      const { parentRuleset, parentKlass, parentSession, childRuleset, childSession } = await createCOWFork();

      const parentLevel = await ClassLevelsMethods.createClassLevel(
        parentSession,
        parentRuleset.id,
        parentKlass.id,
        { level: 1, bab: 1, skills: 4 },
      );

      // First write from the fork is a partial update on the inherited level.
      // Skills are not in the body, so the unspecified field must be carried
      // over from the parent's value (4), not silently zeroed.
      const updated = await ClassLevelsMethods.updateClassLevel(
        childSession,
        childRuleset.id,
        parentKlass.id,
        parentLevel.id,
        { bab: 5 },
      );

      expect(updated.bab).toBe(5);
      expect(updated.skills).toBe(4);
    });

    test("should delete class level for inherited parent class in child fork", async () => {
      const { parentKlass, childRuleset, childSession } = await createCOWFork();

      const created = await ClassLevelsMethods.createClassLevel(
        childSession,
        childRuleset.id,
        parentKlass.id,
        { level: 1, bab: 1, skills: 4 },
      );

      const deleted = await ClassLevelsMethods.deleteClassLevel(
        childSession,
        childRuleset.id,
        parentKlass.id,
        created.id,
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should reject unrelated class in createClassLevel", async () => {
      const { childRuleset, childSession } = await createCOWFork();
      const { klass: unrelatedKlass } = await createTestUserRulesetAndClass();

      await expect(
        ClassLevelsMethods.createClassLevel(
          childSession,
          childRuleset.id,
          unrelatedKlass.id,
          { level: 1, bab: 1, skills: 4 },
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should reject unrelated class in getClassLevelSpells", async () => {
      const { childRuleset } = await createCOWFork();
      const { klass: unrelatedKlass } = await createTestUserRulesetAndClass();

      await expect(
        ClassLevelsMethods.getClassLevelSpells(
          childRuleset.id,
          unrelatedKlass.id,
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should reject unrelated class in updateClassLevel", async () => {
      const { childRuleset, childSession } = await createCOWFork();
      const { klass: unrelatedKlass, session: unrelatedSession, ruleset: unrelatedRuleset } = await createTestUserRulesetAndClass();

      const created = await ClassLevelsMethods.createClassLevel(
        unrelatedSession,
        unrelatedRuleset.id,
        unrelatedKlass.id,
        { level: 1, bab: 1, skills: 4 },
      );

      await expect(
        ClassLevelsMethods.updateClassLevel(
          childSession,
          childRuleset.id,
          unrelatedKlass.id,
          created.id,
          { bab: 2 },
        )
      ).rejects.toThrow(NotFoundError);
    });
  });
});
