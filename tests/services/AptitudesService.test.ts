import { eq } from "drizzle-orm";

import { AptitudesMethods } from "@/server/services/rulesets/AptitudesService.ts";
import { db } from "@/server/database/index.ts";
import { featsAptitudesInRules, klassLevelFeatsInRules, klassLevelPowersInRules, powersAptitudesInRules } from "@/drizzle/schema.ts";
import { Feats, KlassLevelPowers, Klasses, Modifiers, Powers, Properties, Requirements, Rulesets, Users } from "@/server/repositories/index.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { ClassLevelsMethods } from "@/server/services/rulesets/classes/ClassLevelsService.ts";
import { NotFoundError, ForbiddenError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("AptitudesService", () => {
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
      description: "Test ruleset for aptitudes testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  describe("getRulesetAptitudes", () => {
    test("should return aptitudes for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await AptitudesMethods.getRulesetAptitudes(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        AptitudesMethods.getRulesetAptitudes(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createRulesetAptitude", () => {
    test("should create an aptitude with all fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const aptitudeData = {
        name: "Test Aptitude",
        description: "A test aptitude",
      };

      const aptitude = await AptitudesMethods.createRulesetAptitude(
        session,
        ruleset.id,
        aptitudeData
      );

      expect(aptitude).toBeDefined();
      expect(aptitude.name).toBe(aptitudeData.name);
      expect(aptitude.description).toBe(aptitudeData.description);
      expect(aptitude.rulesetId).toBe(ruleset.id);
    });

    test("should create an aptitude with minimal fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const aptitudeData = {
        name: "Minimal Aptitude",
      };

      const aptitude = await AptitudesMethods.createRulesetAptitude(
        session,
        ruleset.id,
        aptitudeData
      );

      expect(aptitude).toBeDefined();
      expect(aptitude.name).toBe(aptitudeData.name);
      expect(aptitude.rulesetId).toBe(ruleset.id);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        AptitudesMethods.createRulesetAptitude(session, fakeRulesetId, {
          name: "Test",
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      await expect(
        AptitudesMethods.createRulesetAptitude(otherSession, ruleset.id, {
          name: "Test",
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateRulesetAptitude", () => {
    test("should update an aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create aptitude first
      const created = await AptitudesMethods.createRulesetAptitude(
        session,
        ruleset.id,
        {
          name: "Original Name",
          description: "Original description",
        }
      );

      // Update it
      const updateData = {
        name: "Updated Name",
        description: "Updated description",
      };

      const updated = await AptitudesMethods.updateRulesetAptitude(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        AptitudesMethods.updateRulesetAptitude(
          session,
          fakeRulesetId,
          "fake-aptitude-id",
          { name: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeAptitudeId = "00000000-0000-0000-0000-000000000000";

      await expect(
        AptitudesMethods.updateRulesetAptitude(
          session,
          ruleset.id,
          fakeAptitudeId,
          { name: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create aptitude as owner
      const aptitude = await AptitudesMethods.createRulesetAptitude(
        session,
        ruleset.id,
        { name: "Test" }
      );

      // Try to update as different user
      await expect(
        AptitudesMethods.updateRulesetAptitude(
          otherSession,
          ruleset.id,
          aptitude.id,
          { name: "Updated" }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetAptitude", () => {
    test("should delete an aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create aptitude first
      const created = await AptitudesMethods.createRulesetAptitude(
        session,
        ruleset.id,
        { name: "To Delete" }
      );

      // Delete it
      const deleted = await AptitudesMethods.deleteRulesetAptitude(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        AptitudesMethods.deleteRulesetAptitude(
          session,
          fakeRulesetId,
          "fake-aptitude-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeAptitudeId = "00000000-0000-0000-0000-000000000000";

      await expect(
        AptitudesMethods.deleteRulesetAptitude(
          session,
          ruleset.id,
          fakeAptitudeId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create aptitude as owner
      const aptitude = await AptitudesMethods.createRulesetAptitude(
        session,
        ruleset.id,
        { name: "Test" }
      );

      // Try to delete as different user
      await expect(
        AptitudesMethods.deleteRulesetAptitude(
          otherSession,
          ruleset.id,
          aptitude.id
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetAptitude - cascade", () => {
    test("should hard-delete feats_aptitudes and powers_aptitudes referencing the aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const featAptitude = await AptitudesMethods.createRulesetAptitude(session, ruleset.id, {
        name: "Feat Aptitude to Cascade",
      });
      const powerAptitude = await AptitudesMethods.createRulesetAptitude(session, ruleset.id, {
        name: "Power Aptitude to Cascade",
      });

      // Create a feat and power linked to separate aptitudes
      await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Feat Linked",
        description: "Test",
        aptitudeIds: [featAptitude.id],
      });
      await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Power Linked",
        description: "Test",
        aptitudes: [{ id: powerAptitude.id }],
      });

      // Verify associations exist
      let featAptRows = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.aptitudeId, featAptitude.id));
      let powerAptRows = await db.select().from(powersAptitudesInRules)
        .where(eq(powersAptitudesInRules.aptitudeId, powerAptitude.id));
      expect(featAptRows.length).toBe(1);
      expect(powerAptRows.length).toBe(1);

      // Delete both aptitudes
      await AptitudesMethods.deleteRulesetAptitude(session, ruleset.id, featAptitude.id);
      await AptitudesMethods.deleteRulesetAptitude(session, ruleset.id, powerAptitude.id);

      // All associations should be completely gone (hard-deleted)
      featAptRows = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.aptitudeId, featAptitude.id));
      powerAptRows = await db.select().from(powersAptitudesInRules)
        .where(eq(powersAptitudesInRules.aptitudeId, powerAptitude.id));
      expect(featAptRows.length).toBe(0);
      expect(powerAptRows.length).toBe(0);
    });

    test("should hard-delete klass_level_feats and klass_level_powers referencing the aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const aptitude = await AptitudesMethods.createRulesetAptitude(session, ruleset.id, {
        name: "Aptitude for Levels",
      });

      const feats = await Feats.create(db, { name: `Feat ${Math.random().toString(36).substr(2, 9)}`, description: "Test", rulesetId: ruleset.id });
      const powers = await Powers.create(db, { name: `Power ${Math.random().toString(36).substr(2, 9)}`, description: "Test", rulesetId: ruleset.id });

      const klasses = await Klasses.create(db, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: ruleset.id,
        hd: 10,
      });
      const level = await ClassLevelsMethods.createClassLevel(session, ruleset.id, klasses[0].id, {
        level: 1,
        bab: 1,
        skills: 2,
        feats: [{ featId: feats[0].id, aptitudeId: aptitude.id }],
      });
      await KlassLevelPowers.create(db, {
        klassLevelId: level.id,
        powerId: powers[0].id,
        aptitudeId: aptitude.id,
      });

      let levelFeatRows = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.aptitudeId, aptitude.id));
      let levelPowerRows = await db.select().from(klassLevelPowersInRules)
        .where(eq(klassLevelPowersInRules.aptitudeId, aptitude.id));
      expect(levelFeatRows.length).toBe(1);
      expect(levelPowerRows.length).toBe(1);

      await AptitudesMethods.deleteRulesetAptitude(session, ruleset.id, aptitude.id);

      levelFeatRows = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.aptitudeId, aptitude.id));
      levelPowerRows = await db.select().from(klassLevelPowersInRules)
        .where(eq(klassLevelPowersInRules.aptitudeId, aptitude.id));
      expect(levelFeatRows.length).toBe(0);
      expect(levelPowerRows.length).toBe(0);
    });

    test("should hard-delete customizations when deleting aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const aptitude = await AptitudesMethods.createRulesetAptitude(session, ruleset.id, {
        name: "Aptitude With Customizations",
      });

      // Add customizations
      await Modifiers.create(db, {
        sourceId: aptitude.id,
        sourceType: "aptitudes",
        target: "abilities.strength",
        value: "2",
        valueType: "number",
        operator: "add",
      });
      await Properties.create(db, {
        entityId: aptitude.id,
        entityType: "aptitudes",
        type: "test",
        value: "test",
      });
      await Requirements.create(db, {
        entityId: aptitude.id,
        entityType: "aptitudes",
        level: "character",
        target: "abilities.strength",
        value: "5",
        valueType: "number",
        operator: "greater_than",
      });

      // Delete the aptitude
      await AptitudesMethods.deleteRulesetAptitude(session, ruleset.id, aptitude.id);

      // All customizations should be completely gone
      const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [aptitude.id], sourceType: "aptitudes" });
      const properties = await Properties.findManyByEntity(db, { entityIds: [aptitude.id], entityType: "aptitudes" });
      const requirements = await Requirements.findManyByEntity(db, { entityIds: [aptitude.id], entityType: "aptitudes" });
      expect(modifiers.length).toBe(0);
      expect(properties.length).toBe(0);
      expect(requirements.length).toBe(0);
    });
  });
});
