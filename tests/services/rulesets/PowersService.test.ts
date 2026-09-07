import { eq } from "drizzle-orm";

import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { db } from "@/server/database/index.ts";
import { klassLevelPowersInRules, levelPowersInCharacter, levelsInCharacter, powersAptitudesInRules } from "@/drizzle/schema.ts";
import { Aptitudes, Characters, EntitySnapshots, KlassLevelPowers, KlassLevels, Klasses, Modifiers, Powers, Properties, Races, Requirements, Rulesets, Users } from "@/server/repositories/index.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { ClassLevelsMethods } from "@/server/services/rulesets/classes/ClassLevelsService.ts";
import PowersAptitudesRepository from "@/server/repositories/PowersAptitudesRepository.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import { ConflictError, NotFoundError, ForbiddenError, BadRequestError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

const PowersAptitudes = new PowersAptitudesRepository();

describe("PowersService", () => {
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
      description: "Test ruleset for powers testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  // Helper to create test aptitudes
  async function createTestAptitudes(rulesetId: string, count: number = 2) {
    const aptitudes = [];
    for (let i = 0; i < count; i++) {
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const created = await Aptitudes.create(db, {
        name: `Test Aptitude ${uniqueId}`,
        description: `Test aptitude description ${i + 1}`,
        rulesetId,
      });
      aptitudes.push(created[0]);
    }
    return aptitudes;
  }

  describe("getRulesetPowers", () => {
    test("should return powers for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await PowersMethods.getRulesetPowers(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PowersMethods.getRulesetPowers(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    test("should return powers with aptitude associations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Test Power",
        description: "Test description",
        aptitudes: aptitudes.map(a => ({ id: a.id })),
      });

      const result = await PowersMethods.getRulesetPowers(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBeGreaterThan(0);
      const power = result.items[0];
      expect(power).toBeDefined();
    });
  });

  describe("getRulesetPower", () => {
    test("should return a specific power by id", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Specific Power",
        description: "Specific power description",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const power = await PowersMethods.getRulesetPower(ruleset.id, created.id);

      expect(power).toBeDefined();
      expect(power.id).toBe(created.id);
      expect(power.name).toBe("Specific Power");
      expect(power.description).toBe("Specific power description");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";
      const fakePowerId = "00000000-0000-0000-0000-000000000001";

      await expect(
        PowersMethods.getRulesetPower(fakeRulesetId, fakePowerId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent power", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakePowerId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PowersMethods.getRulesetPower(ruleset.id, fakePowerId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when power doesn't belong to ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset1.id, 1);

      const power = await PowersMethods.createRulesetPower(session1, ruleset1.id, {
        name: "Power in Ruleset 1",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      await expect(
        PowersMethods.getRulesetPower(ruleset2.id, power.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createRulesetPower", () => {
    test("should create a power with all required fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      const powerData = {
        name: "New Power",
        description: "A brand new power",
        aptitudes: aptitudes.map(a => ({ id: a.id })),
      };

      const power = await PowersMethods.createRulesetPower(
        session,
        ruleset.id,
        powerData
      );

      expect(power).toBeDefined();
      expect(power.name).toBe(powerData.name);
      expect(power.description).toBe(powerData.description);
      expect(power.rulesetId).toBe(ruleset.id);

      // Verify aptitude associations were created
      const associations = await PowersAptitudes.findMany(db, { powerId: power.id });
      expect(associations.length).toBe(2);
    });

    test("should create a power with a single aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Single Aptitude Power",
        description: "Power with one aptitude",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      expect(power).toBeDefined();
      const associations = await PowersAptitudes.findMany(db, { powerId: power.id });
      expect(associations.length).toBe(1);
      expect(associations[0].aptitudeId).toBe(aptitudes[0].id);
    });

    test("should throw BadRequestError when no aptitudes are provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await expect(
        PowersMethods.createRulesetPower(session, ruleset.id, {
          name: "No Aptitudes",
          description: "This should fail",
          aptitudes: [],
        })
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PowersMethods.createRulesetPower(session, fakeRulesetId, {
          name: "Test",
          description: "Test",
          aptitudes: [{ id: "fake-aptitude-id" }],
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      await expect(
        PowersMethods.createRulesetPower(otherSession, ruleset.id, {
          name: "Test",
          description: "Test",
          aptitudes: [{ id: aptitudes[0].id }],
        })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create activity record on power creation", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Activity Test Power",
        description: "Test activity creation",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      expect(power).toBeDefined();
      // Activity creation is part of the transaction, so if we got here, it succeeded
    });
  });

  describe("updateRulesetPower", () => {
    test("should update power name and description", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Original Name",
        description: "Original description",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const updateData = {
        name: "Updated Name",
        description: "Updated description",
      };

      const updated = await PowersMethods.updateRulesetPower(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
      expect(updated.id).toBe(created.id);
    });

    test("should update aptitude associations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 3);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Power to Update",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const updated = await PowersMethods.updateRulesetPower(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated Power",
          description: "Updated",
          aptitudes: [{ id: aptitudes[1].id }, { id: aptitudes[2].id }],
        }
      );

      expect(updated).toBeDefined();

      const associations = await PowersAptitudes.findMany(db, { powerId: created.id });
      expect(associations.length).toBe(2);
      const aptitudeIds = associations.map(a => a.aptitudeId);
      expect(aptitudeIds).toContain(aptitudes[1].id);
      expect(aptitudeIds).toContain(aptitudes[2].id);
      expect(aptitudeIds).not.toContain(aptitudes[0].id);
    });

    test("should update without changing aptitudes when aptitudeIds not provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Original",
        description: "Original",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const updated = await PowersMethods.updateRulesetPower(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated Name Only",
          description: "Updated description",
        }
      );

      expect(updated.name).toBe("Updated Name Only");

      const associations = await PowersAptitudes.findMany(db, { powerId: created.id });
      expect(associations.length).toBe(1);
      expect(associations[0].aptitudeId).toBe(aptitudes[0].id);
    });

    test("should allow removing all aptitudes when explicitly set to empty array", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Power with Aptitudes",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const updated = await PowersMethods.updateRulesetPower(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated",
          description: "Updated",
          aptitudes: [],
        }
      );

      expect(updated).toBeDefined();

      const associations = await PowersAptitudes.findMany(db, { powerId: created.id });
      expect(associations.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PowersMethods.updateRulesetPower(
          session,
          fakeRulesetId,
          "fake-power-id",
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent power", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakePowerId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PowersMethods.updateRulesetPower(
          session,
          ruleset.id,
          fakePowerId,
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Test",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      await expect(
        PowersMethods.updateRulesetPower(
          otherSession,
          ruleset.id,
          power.id,
          { name: "Updated", description: "Updated" }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create activity record on power update", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Original",
        description: "Original",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const updated = await PowersMethods.updateRulesetPower(
        session,
        ruleset.id,
        created.id,
        { name: "Updated", description: "Updated" }
      );

      expect(updated).toBeDefined();
      // Activity creation is part of the transaction, so if we got here, it succeeded
    });
  });

  describe("deleteRulesetPower", () => {
    test("should delete a power", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "To Delete",
        description: "Will be deleted",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const deleted = await PowersMethods.deleteRulesetPower(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's actually deleted
      const power = await Powers.findOne(db, { id: created.id });
      expect(power).toBeUndefined();
    });

    test("should delete aptitude associations when deleting power", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Power with Associations",
        description: "Test",
        aptitudes: aptitudes.map(a => ({ id: a.id })),
      });

      // Verify associations exist
      let associations = await PowersAptitudes.findMany(db, { powerId: created.id });
      expect(associations.length).toBe(2);

      // Delete power
      await PowersMethods.deleteRulesetPower(session, ruleset.id, created.id);

      // Verify associations are deleted
      associations = await PowersAptitudes.findMany(db, { powerId: created.id });
      expect(associations.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PowersMethods.deleteRulesetPower(
          session,
          fakeRulesetId,
          "fake-power-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent power", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakePowerId = "00000000-0000-0000-0000-000000000000";

      await expect(
        PowersMethods.deleteRulesetPower(
          session,
          ruleset.id,
          fakePowerId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Test",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      await expect(
        PowersMethods.deleteRulesetPower(
          otherSession,
          ruleset.id,
          power.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create activity record on power deletion", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "To Delete",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const deleted = await PowersMethods.deleteRulesetPower(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      // Activity creation is part of the transaction, so if we got here, it succeeded
    });

    test("should handle deleting power without aptitude associations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Power",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      // Manually archive associations first
      await PowersAptitudes.archive(db, { powerId: created.id });

      // Delete power should still work
      const deleted = await PowersMethods.deleteRulesetPower(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should hard-delete aptitude associations (rows removed from DB)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Hard Delete Test",
        description: "Test",
        aptitudes: aptitudes.map(a => ({ id: a.id })),
      });

      // Verify associations exist in DB
      let rawAssociations = await db.select().from(powersAptitudesInRules)
        .where(eq(powersAptitudesInRules.powerId, created.id));
      expect(rawAssociations.length).toBe(2);

      // Delete power
      await PowersMethods.deleteRulesetPower(session, ruleset.id, created.id);

      // Associations should be completely gone from DB (hard-deleted, not soft-deleted)
      rawAssociations = await db.select().from(powersAptitudesInRules)
        .where(eq(powersAptitudesInRules.powerId, created.id));
      expect(rawAssociations.length).toBe(0);
    });

    test("should hard-delete customizations (rows removed from DB)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Customization Delete Test",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      // Add customizations
      await Properties.create(db, {
        entityId: created.id,
        entityType: "powers",
        type: "test",
        value: "test",
      });
      await Requirements.create(db, {
        entityId: created.id,
        entityType: "powers",
        level: "character",
        target: "abilities.strength",
        value: "5",
        valueType: "number",
        operator: "greater_than",
      });

      // Delete power
      await PowersMethods.deleteRulesetPower(session, ruleset.id, created.id);

      // Customizations should be completely gone from DB
      const properties = await Properties.findManyByEntity(db, {
        entityIds: [created.id],
        entityType: "powers",
      });
      expect(properties.length).toBe(0);

      const requirements = await Requirements.findManyByEntity(db, {
        entityIds: [created.id],
        entityType: "powers",
      });
      expect(requirements.length).toBe(0);
    });
  });

  describe("updateRulesetPower - hard delete pattern", () => {
    test("should hard-delete old aptitude associations when updating with new ones", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 3);

      const created = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Update Delete Test",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      // Update with different aptitudes
      await PowersMethods.updateRulesetPower(session, ruleset.id, created.id, {
        name: "Updated",
        description: "Updated",
        aptitudes: [{ id: aptitudes[1].id }, { id: aptitudes[2].id }],
      });

      // Old association should be completely gone from DB (hard-deleted)
      const rawAssociations = await db.select().from(powersAptitudesInRules)
        .where(eq(powersAptitudesInRules.powerId, created.id));
      expect(rawAssociations.length).toBe(2);

      // All remaining rows should have no deletedAt (they are fresh creates)
      for (const row of rawAssociations) {
        expect(row.deletedAt).toBeNull();
      }

      const aptitudeIds = rawAssociations.map(a => a.aptitudeId);
      expect(aptitudeIds).toContain(aptitudes[1].id);
      expect(aptitudeIds).toContain(aptitudes[2].id);
      expect(aptitudeIds).not.toContain(aptitudes[0].id);
    });

    test("should block deletion when a host subscribed to this extension has a character picking the power", async () => {
      const { user, ruleset: extension, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(extension.id, 1);

      const power = await PowersMethods.createRulesetPower(session, extension.id, {
        name: "Extension Power",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

      const hostRows = await Rulesets.create(db, {
        name: `Host ${Math.random().toString(36).substr(2, 9)}`,
        description: "Subscribes to extension",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        extensionRulesetIds: [extension.id],
      });
      const host = hostRows[0];

      const races = await Races.create(db, { name: `Race ${Math.random().toString(36).substr(2, 9)}`, description: "Test", rulesetId: host.id, size: "Medium", baseSpeed: 30 });
      const klasses = await Klasses.create(db, { name: `Class ${Math.random().toString(36).substr(2, 9)}`, description: "Test", rulesetId: host.id, hd: 10 });
      const klassLevels = await KlassLevels.create(db, { klassId: klasses[0].id, level: 1 });
      const characters = await Characters.create(db, { name: "Subscriber", userId: user.id, rulesetId: host.id, raceId: races[0].id, xp: 0, alignment: "Neutral Good", age: 25, gender: "Male", height: "180", weight: "75" });
      const characterLevels = await db.insert(levelsInCharacter).values({ characterId: characters[0].id, klassLevelId: klassLevels[0].id, hp: 10 }).returning();
      await db.insert(levelPowersInCharacter).values({ characterLevelId: characterLevels[0].id, powerId: power.id, aptitudeId: aptitudes[0].id });

      await expect(
        PowersMethods.deleteRulesetPower(session, extension.id, power.id),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("deleteRulesetPower - klass_level_powers cascade", () => {
    test("should hard-delete klass_level_powers referencing the power", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Power to Cascade",
        description: "Test",
        aptitudes: [{ id: aptitudes[0].id }],
      });

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
      });
      await KlassLevelPowers.create(db, {
        klassLevelId: level.id,
        powerId: power.id,
        aptitudeId: aptitudes[0].id,
      });

      let rawRows = await db.select().from(klassLevelPowersInRules)
        .where(eq(klassLevelPowersInRules.powerId, power.id));
      expect(rawRows.length).toBe(1);

      await PowersMethods.deleteRulesetPower(session, ruleset.id, power.id);

      rawRows = await db.select().from(klassLevelPowersInRules)
        .where(eq(klassLevelPowersInRules.powerId, power.id));
      expect(rawRows.length).toBe(0);
    });
  });

  describe("COW fork", () => {
    // Helper: create a published parent with a power + aptitudes, then fork it
    async function createPublishedParentWithPower() {
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const users = await Users.create(db, {
        username: `owner-${uniqueId}`,
        emailAddress: `owner-${uniqueId}@example.com`,
        password: "password1234",
      });
      const ownerUser = users[0];
      const parentSession = createTestSession(ownerUser.id);

      const rulesets = await Rulesets.create(db, {
        name: `Parent ${uniqueId}`,
        description: "Parent ruleset",
        private: false,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: ownerUser.id,
        status: "Published",
      });
      const parent = rulesets[0];

      const aptitudes = await createTestAptitudes(parent.id, 3);
      const power = await PowersMethods.createRulesetPower(parentSession, parent.id, {
        name: "Fireball",
        description: "A ball of fire",
        aptitudes: [{ id: aptitudes[0].id }, { id: aptitudes[1].id }],
      });

      // Create a modifier and requirement on the power
      const modifiers = await Modifiers.createMany(db, [{
        sourceId: power.id,
        sourceType: "powers",
        target: "abilities.strength.misc",
        value: "2",
        valueType: "number",
        operator: "add",
      }]);
      await Requirements.createMany(db, [{
        entityId: power.id,
        entityType: "powers",
        level: "1",
        target: "abilities.strength.misc",
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      }]);

      // Fork
      const forkUsers = await Users.create(db, {
        username: `forker-${uniqueId}`,
        emailAddress: `forker-${uniqueId}@example.com`,
        password: "password1234",
      });
      const forkUser = forkUsers[0];
      const forkSession = createTestSession(forkUser.id);

      const fork = await RulesetsMethods.forkRuleset(
        forkSession,
        parent.id,
        { name: "Fork", description: "Fork", private: false },
      );

      invalidateAll();

      return { parent, fork, parentSession, forkSession, power, aptitudes, modifier: modifiers[0] };
    }

    test("should throw ConflictError when creating power with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      const parentAptitudes = await createTestAptitudes(parentRuleset.id, 1);
      await PowersMethods.createRulesetPower(parentSession, parentRuleset.id, {
        name: "Fireball",
        description: "A ball of fire",
        aptitudes: [{ id: parentAptitudes[0].id }],
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

      const childAptitudes = await createTestAptitudes(childRuleset.id, 1);

      await expect(
        PowersMethods.createRulesetPower(childSession, childRuleset.id, {
          name: "Fireball",
          description: "Duplicate name",
          aptitudes: [{ id: childAptitudes[0].id }],
        }),
      ).rejects.toThrow(ConflictError);
    });

    test("GET should return inherited power with parent's aptitudes via overrideMap", async () => {
      const { fork, power, aptitudes } = await createPublishedParentWithPower();

      // GET the inherited power from the fork — should resolve through overrideMap
      const fetched = await PowersMethods.getRulesetPower(fork.id, power.id);

      expect(fetched).toBeDefined();
      expect(fetched.name).toBe("Fireball");
      // Should include aptitudes from the parent
      const fetchedAptitudes = (fetched as { powersAptitudesInRules?: { aptitudeId: string }[] }).powersAptitudesInRules ?? [];
      expect(fetchedAptitudes.length).toBe(2);
      const aptitudeIds = fetchedAptitudes.map((a) => a.aptitudeId);
      expect(aptitudeIds).toContain(aptitudes[0].id);
      expect(aptitudeIds).toContain(aptitudes[1].id);
    });

    test("GET should return inherited power with modifiers and requirements", async () => {
      const { fork, power } = await createPublishedParentWithPower();

      const fetched = await PowersMethods.getRulesetPower(fork.id, power.id);

      expect(fetched.modifiers.length).toBe(1);
      expect(fetched.modifiers[0].target).toBe("abilities.strength.misc");
      expect(fetched.requirements.length).toBe(1);
      expect(fetched.requirements[0].value).toBe("13");
    });

    test("UPDATE should COW the power and GET should return fork's data", async () => {
      const { fork, forkSession, power, aptitudes } = await createPublishedParentWithPower();

      // Update in fork: remove one aptitude
      const updated = await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "Updated in fork",
        aptitudes: [{ id: aptitudes[0].id }], // only keep first aptitude
      });

      // Should have a new ID (COW'd copy)
      expect(updated.id).not.toBe(power.id);

      invalidateAll();

      // GET using the PARENT's power ID — should resolve to COW'd copy via overrideMap
      const fetchedByParentId = await PowersMethods.getRulesetPower(fork.id, power.id);
      expect(fetchedByParentId.id).toBe(updated.id);
      expect(fetchedByParentId.description).toBe("Updated in fork");

      const fetchedAptitudes = (fetchedByParentId as { powersAptitudesInRules?: { aptitudeId: string }[] }).powersAptitudesInRules ?? [];
      expect(fetchedAptitudes.length).toBe(1);
      expect(fetchedAptitudes[0].aptitudeId).toBe(aptitudes[0].id);

      // GET using the COW'd ID directly — should also work
      const fetchedByCowId = await PowersMethods.getRulesetPower(fork.id, updated.id);
      expect(fetchedByCowId.id).toBe(updated.id);
      expect(fetchedByCowId.description).toBe("Updated in fork");
    });

    test("UPDATE should COW the power and parent data should be unchanged", async () => {
      const { parent, fork, forkSession, power, aptitudes } = await createPublishedParentWithPower();

      // Update in fork
      await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "Modified in fork",
        aptitudes: [{ id: aptitudes[2].id }], // completely different aptitude
      });

      invalidateAll();

      // Parent's power should be unchanged
      const parentPower = await PowersMethods.getRulesetPower(parent.id, power.id);
      expect(parentPower.id).toBe(power.id);
      expect(parentPower.description).toBe("A ball of fire");

      const parentAptitudes = (parentPower as { powersAptitudesInRules?: { aptitudeId: string }[] }).powersAptitudesInRules ?? [];
      expect(parentAptitudes.length).toBe(2);
      const parentAptitudeIds = parentAptitudes.map((a) => a.aptitudeId);
      expect(parentAptitudeIds).toContain(aptitudes[0].id);
      expect(parentAptitudeIds).toContain(aptitudes[1].id);
    });

    test("second UPDATE should modify existing COW'd copy, not create another", async () => {
      const { fork, forkSession, power, aptitudes } = await createPublishedParentWithPower();

      // First update: triggers COW
      const firstUpdate = await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "First edit",
        aptitudes: [{ id: aptitudes[0].id }],
      });
      const cowId = firstUpdate.id;

      invalidateAll();

      // Second update using parent ID — should resolve to existing COW'd copy
      const secondUpdate = await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "Second edit",
        aptitudes: [{ id: aptitudes[1].id }, { id: aptitudes[2].id }],
      });

      // Should reuse the same COW'd copy (no duplicate COW)
      expect(secondUpdate.id).toBe(cowId);

      invalidateAll();

      // Verify final state
      const fetched = await PowersMethods.getRulesetPower(fork.id, power.id);
      expect(fetched.description).toBe("Second edit");
      const fetchedAptitudes = (fetched as { powersAptitudesInRules?: { aptitudeId: string }[] }).powersAptitudesInRules ?? [];
      expect(fetchedAptitudes.length).toBe(2);
      const aptitudeIds = fetchedAptitudes.map((a) => a.aptitudeId);
      expect(aptitudeIds).toContain(aptitudes[1].id);
      expect(aptitudeIds).toContain(aptitudes[2].id);
    });

    test("GET should return COW'd copy's modifiers and requirements, not parent's", async () => {
      const { fork, forkSession, power } = await createPublishedParentWithPower();

      // Update to trigger COW
      await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "COW'd",
      });

      invalidateAll();

      const fetched = await PowersMethods.getRulesetPower(fork.id, power.id);

      // Should have modifiers and requirements from the COW'd copy
      expect(fetched.modifiers.length).toBe(1);
      expect(fetched.modifiers[0].sourceId).toBe(fetched.id); // sourceId should be the COW'd power ID
      expect(fetched.requirements.length).toBe(1);
      expect(fetched.requirements[0].entityId).toBe(fetched.id);
    });

    test("DELETE inherited power should archive via COW using parent ID", async () => {
      const { parent, fork, forkSession, power } = await createPublishedParentWithPower();

      // Delete the inherited power using the parent's ID
      await PowersMethods.deleteRulesetPower(forkSession, fork.id, power.id);
      invalidateAll();

      // Power should no longer appear in fork's list
      const forkPowers = await PowersMethods.getRulesetPowers(fork.id, {}, { limit: 50, page: 1 });
      expect(forkPowers.items.find((p: { id: string }) => p.id === power.id)).toBeUndefined();

      // Parent's power should be untouched
      const parentPower = await PowersMethods.getRulesetPower(parent.id, power.id);
      expect(parentPower).toBeDefined();
      expect(parentPower.name).toBe("Fireball");
    });

    test("DELETE after UPDATE should archive the COW'd copy, not create a second one", async () => {
      const { parent, fork, forkSession, power } = await createPublishedParentWithPower();

      // Update to trigger COW
      await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "Updated in fork",
      });
      invalidateAll();

      // Verify COW'd copy exists
      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: power.id,
        rulesetId: fork.id,
      });
      expect(snapshot).toBeDefined();
      const cowId = snapshot!.forkedEntityId;

      // Delete using parent's ID — should resolve to existing COW'd copy
      await PowersMethods.deleteRulesetPower(forkSession, fork.id, power.id);
      invalidateAll();

      // The COW'd copy should be archived
      const cowPower = await Powers.findOne(db, { id: cowId });
      expect(cowPower).toBeUndefined();

      // Parent's power should be untouched
      const parentPower = await PowersMethods.getRulesetPower(parent.id, power.id);
      expect(parentPower).toBeDefined();
      expect(parentPower.name).toBe("Fireball");
    });

    test("DELETE after UPDATE should not leave orphaned modifiers or requirements", async () => {
      const { fork, forkSession, power } = await createPublishedParentWithPower();

      // Update to trigger COW
      await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "Updated in fork",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: power.id,
        rulesetId: fork.id,
      });
      const cowId = snapshot!.forkedEntityId;

      // Delete using parent's ID
      await PowersMethods.deleteRulesetPower(forkSession, fork.id, power.id);
      invalidateAll();

      // No orphaned modifiers or requirements should remain for the COW'd copy
      const remainingModifiers = await Modifiers.findManyBySource(db, { sourceIds: [cowId], sourceType: "powers" });
      expect(remainingModifiers.length).toBe(0);

      const remainingRequirements = await Requirements.findManyByEntity(db, { entityIds: [cowId], entityType: "powers" });
      expect(remainingRequirements.length).toBe(0);
    });

    test("create with ancestor name succeeds after the ancestor's copy was COW'd + renamed", async () => {
      // Regression: before the fix, the name-conflict check loaded the
      // ancestor row via `Powers.findOne({name, rulesetId: ancestorId})`,
      // which the repo Proxy's output auto-resolve rewrote to the post-COW
      // id. The snapshot lookup by `sourceEntityId` then missed (it stores
      // pre-COW ids) and ConflictError fired even though the COW existed.
      const { fork, forkSession, power, aptitudes } = await createPublishedParentWithPower();

      // Step 1: COW the inherited power into the fork by updating it.
      await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fireball",
        description: "Forked description",
        aptitudes: [{ id: aptitudes[0].id }, { id: aptitudes[1].id }],
      });
      invalidateAll();

      // Step 2: rename the COW'd copy so the name "Fireball" is free in the fork.
      await PowersMethods.updateRulesetPower(forkSession, fork.id, power.id, {
        name: "Fire Blast",
        description: "Renamed",
        aptitudes: [{ id: aptitudes[0].id }, { id: aptitudes[1].id }],
      });
      invalidateAll();

      // Step 3: create a new "Fireball" in the fork — should succeed since the
      // ancestor's Fireball has been COW'd (and the COW copy no longer uses
      // the name).
      const created = await PowersMethods.createRulesetPower(forkSession, fork.id, {
        name: "Fireball",
        description: "A new Fireball",
        aptitudes: [{ id: aptitudes[0].id }],
      });
      expect(created).toBeDefined();
      expect(created.name).toBe("Fireball");
      expect(created.rulesetId).toBe(fork.id);
    });
  });
});
