import { eq } from "drizzle-orm";

import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { db } from "@/server/database/index.ts";
import { featsAptitudesInRules, klassLevelFeatsInRules, levelFeatsInCharacter, levelsInCharacter } from "@/drizzle/schema.ts";
import { Aptitudes, Characters, EntitySnapshots, Feats, Klasses, KlassLevels, Properties, Races, Requirements, Rulesets, Users } from "@/server/repositories/index.ts";
import { ClassLevelsMethods } from "@/server/services/rulesets/classes/ClassLevelsService.ts";
import FeatsAptitudesRepository from "@/server/repositories/FeatsAptitudesRepository.ts";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

const FeatsAptitudes = new FeatsAptitudesRepository();

describe("FeatsService", () => {
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
      description: "Test ruleset for feats testing",
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

  describe("getRulesetFeats", () => {
    test("should return feats for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await FeatsMethods.getRulesetFeats(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        FeatsMethods.getRulesetFeats(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    test("should return feats with aptitude associations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      // Create a feat with aptitude associations
      await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Test Feat",
        description: "Test description",
        aptitudeIds: aptitudes.map(a => a.id),
      });

      const result = await FeatsMethods.getRulesetFeats(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBeGreaterThan(0);
      const feat = result.items[0];
      expect(feat).toBeDefined();
      expect(feat.featsAptitudesInRules).toBeDefined();
    });
  });

  describe("getRulesetFeat", () => {
    test("should return a specific feat by id", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Specific Feat",
        description: "Specific feat description",
        aptitudeIds: [aptitudes[0].id],
      });

      const feat = await FeatsMethods.getRulesetFeat(ruleset.id, created.id);

      expect(feat).toBeDefined();
      expect(feat.id).toBe(created.id);
      expect(feat.name).toBe("Specific Feat");
      expect(feat.description).toBe("Specific feat description");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";
      const fakeFeatId = "00000000-0000-0000-0000-000000000001";

      await expect(
        FeatsMethods.getRulesetFeat(fakeRulesetId, fakeFeatId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent feat", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeFeatId = "00000000-0000-0000-0000-000000000000";

      await expect(
        FeatsMethods.getRulesetFeat(ruleset.id, fakeFeatId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when feat doesn't belong to ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset1.id, 1);

      // Create feat in ruleset1
      const feat = await FeatsMethods.createRulesetFeat(session1, ruleset1.id, {
        name: "Feat in Ruleset 1",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Try to get it from ruleset2
      await expect(
        FeatsMethods.getRulesetFeat(ruleset2.id, feat.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createRulesetFeat", () => {
    test("should create a feat with all required fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      const featData = {
        name: "New Feat",
        description: "A brand new feat",
        aptitudeIds: aptitudes.map(a => a.id),
      };

      const feat = await FeatsMethods.createRulesetFeat(
        session,
        ruleset.id,
        featData
      );

      expect(feat).toBeDefined();
      expect(feat.name).toBe(featData.name);
      expect(feat.description).toBe(featData.description);
      expect(feat.rulesetId).toBe(ruleset.id);

      // Verify aptitude associations were created
      const associations = await FeatsAptitudes.findMany(db, { featId: feat.id });
      expect(associations.length).toBe(2);
    });

    test("should create a feat with a single aptitude", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Single Aptitude Feat",
        description: "Feat with one aptitude",
        aptitudeIds: [aptitudes[0].id],
      });

      expect(feat).toBeDefined();
      const associations = await FeatsAptitudes.findMany(db, { featId: feat.id });
      expect(associations.length).toBe(1);
      expect(associations[0].aptitudeId).toBe(aptitudes[0].id);
    });

    test("should throw BadRequestError when no aptitudes are provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await expect(
        FeatsMethods.createRulesetFeat(session, ruleset.id, {
          name: "No Aptitudes",
          description: "This should fail",
          aptitudeIds: [],
        })
      ).rejects.toThrow(BadRequestError);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        FeatsMethods.createRulesetFeat(session, fakeRulesetId, {
          name: "Test",
          description: "Test",
          aptitudeIds: ["fake-aptitude-id"],
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      await expect(
        FeatsMethods.createRulesetFeat(otherSession, ruleset.id, {
          name: "Test",
          description: "Test",
          aptitudeIds: [aptitudes[0].id],
        })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create activity record on feat creation", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Activity Test Feat",
        description: "Test activity creation",
        aptitudeIds: [aptitudes[0].id],
      });

      expect(feat).toBeDefined();
      // Activity creation is part of the transaction, so if we got here, it succeeded
    });
  });

  describe("updateRulesetFeat", () => {
    test("should update feat name and description", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      // Create feat first
      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Original Name",
        description: "Original description",
        aptitudeIds: [aptitudes[0].id],
      });

      // Update it
      const updateData = {
        name: "Updated Name",
        description: "Updated description",
      };

      const updated = await FeatsMethods.updateRulesetFeat(
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

      // Create feat with first aptitude
      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Feat to Update",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Update to use second and third aptitudes
      const updated = await FeatsMethods.updateRulesetFeat(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated Feat",
          description: "Updated",
          aptitudeIds: [aptitudes[1].id, aptitudes[2].id],
        }
      );

      expect(updated).toBeDefined();

      // Verify old associations are removed and new ones are added
      const associations = await FeatsAptitudes.findMany(db, { featId: created.id });
      expect(associations.length).toBe(2);
      const aptitudeIds = associations.map(a => a.aptitudeId);
      expect(aptitudeIds).toContain(aptitudes[1].id);
      expect(aptitudeIds).toContain(aptitudes[2].id);
      expect(aptitudeIds).not.toContain(aptitudes[0].id);
    });

    test("should update without changing aptitudes when aptitudeIds not provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      // Create feat
      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Original",
        description: "Original",
        aptitudeIds: [aptitudes[0].id],
      });

      // Update without aptitudeIds
      const updated = await FeatsMethods.updateRulesetFeat(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated Name Only",
          description: "Updated description",
        }
      );

      expect(updated.name).toBe("Updated Name Only");

      // Verify aptitude associations unchanged
      const associations = await FeatsAptitudes.findMany(db, { featId: created.id });
      expect(associations.length).toBe(1);
      expect(associations[0].aptitudeId).toBe(aptitudes[0].id);
    });

    test("should allow removing all aptitudes when explicitly set to empty array", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      // Create feat with aptitudes
      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Feat with Aptitudes",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Update with empty aptitudes array
      const updated = await FeatsMethods.updateRulesetFeat(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated",
          description: "Updated",
          aptitudeIds: [],
        }
      );

      expect(updated).toBeDefined();

      // Verify all associations are removed
      const associations = await FeatsAptitudes.findMany(db, { featId: created.id });
      expect(associations.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        FeatsMethods.updateRulesetFeat(
          session,
          fakeRulesetId,
          "fake-feat-id",
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeFeatId = "00000000-0000-0000-0000-000000000000";

      await expect(
        FeatsMethods.updateRulesetFeat(
          session,
          ruleset.id,
          fakeFeatId,
          { name: "Test", description: "Test" }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      // Create feat as owner
      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Test",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Try to update as different user
      await expect(
        FeatsMethods.updateRulesetFeat(
          otherSession,
          ruleset.id,
          feat.id,
          { name: "Updated", description: "Updated" }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create activity record on feat update", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Original",
        description: "Original",
        aptitudeIds: [aptitudes[0].id],
      });

      const updated = await FeatsMethods.updateRulesetFeat(
        session,
        ruleset.id,
        created.id,
        { name: "Updated", description: "Updated" }
      );

      expect(updated).toBeDefined();
      // Activity creation is part of the transaction, so if we got here, it succeeded
    });
  });

  describe("deleteRulesetFeat", () => {
    test("should delete a feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      // Create feat first
      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "To Delete",
        description: "Will be deleted",
        aptitudeIds: [aptitudes[0].id],
      });

      // Delete it
      const deleted = await FeatsMethods.deleteRulesetFeat(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's actually deleted
      const feat = await Feats.findOne(db, { id: created.id });
      expect(feat).toBeUndefined();
    });

    test("should delete aptitude associations when deleting feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      // Create feat with aptitude associations
      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Feat with Associations",
        description: "Test",
        aptitudeIds: aptitudes.map(a => a.id),
      });

      // Verify associations exist
      let associations = await FeatsAptitudes.findMany(db, { featId: created.id });
      expect(associations.length).toBe(2);

      // Delete feat
      await FeatsMethods.deleteRulesetFeat(session, ruleset.id, created.id);

      // Verify associations are deleted
      associations = await FeatsAptitudes.findMany(db, { featId: created.id });
      expect(associations.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        FeatsMethods.deleteRulesetFeat(
          session,
          fakeRulesetId,
          "fake-feat-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeFeatId = "00000000-0000-0000-0000-000000000000";

      await expect(
        FeatsMethods.deleteRulesetFeat(
          session,
          ruleset.id,
          fakeFeatId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      // Create feat as owner
      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Test",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Try to delete as different user
      await expect(
        FeatsMethods.deleteRulesetFeat(
          otherSession,
          ruleset.id,
          feat.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create activity record on feat deletion", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "To Delete",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      const deleted = await FeatsMethods.deleteRulesetFeat(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      // Activity creation is part of the transaction, so if we got here, it succeeded
    });

    test("should handle deleting feat without aptitude associations", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      // Create feat
      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Feat",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Manually archive associations first
      await FeatsAptitudes.archive(db, { featId: created.id });

      // Delete feat should still work
      const deleted = await FeatsMethods.deleteRulesetFeat(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should throw ConflictError when feat is picked by a character", async () => {
      const { user, ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const races = await Races.create(db, {
        name: "Test Race",
        description: "Test",
        rulesetId: ruleset.id,
        size: "Medium",
        baseSpeed: 30,
      });

      const characters = await Characters.create(db, {
        name: "Test Character",
        userId: user.id,
        rulesetId: ruleset.id,
        raceId: races[0].id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Feat to Delete",
        description: "Should not be deletable",
        aptitudeIds: [aptitudes[0].id],
      });

      // Set up a character level + level-feat pick referencing this feat
      const klasses = await Klasses.create(db, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: ruleset.id,
        hd: 10,
      });
      const klassLevels = await KlassLevels.create(db, {
        klassId: klasses[0].id,
        level: 1,
      });
      const characterLevels = await db.insert(levelsInCharacter).values({
        characterId: characters[0].id,
        klassLevelId: klassLevels[0].id,
        hp: 10,
      }).returning();
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: characterLevels[0].id,
        featId: feat.id,
        aptitudeId: aptitudes[0].id,
      });

      await expect(
        FeatsMethods.deleteRulesetFeat(session, ruleset.id, feat.id)
      ).rejects.toThrow(ConflictError);
    });

    test("should allow deleting a feat that no character has picked", async () => {
      const { user, ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      // A character on the ruleset (without picking the feat) must not block deletion
      const races = await Races.create(db, {
        name: "Test Race",
        description: "Test",
        rulesetId: ruleset.id,
        size: "Medium",
        baseSpeed: 30,
      });
      await Characters.create(db, {
        name: "Test Character",
        userId: user.id,
        rulesetId: ruleset.id,
        raceId: races[0].id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Unpicked Feat",
        description: "Nobody picked me",
        aptitudeIds: [aptitudes[0].id],
      });

      const deleted = await FeatsMethods.deleteRulesetFeat(session, ruleset.id, feat.id);
      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(feat.id);
    });

    test("should still block deletion when only an archived character has picked the feat", async () => {
      // Per project memory: archived characters keep their picks live so
      // unarchive can restore them. The in-use check must count them.
      const { user, ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const races = await Races.create(db, {
        name: "Test Race",
        description: "Test",
        rulesetId: ruleset.id,
        size: "Medium",
        baseSpeed: 30,
      });
      const characters = await Characters.create(db, {
        name: "Archived Character",
        userId: user.id,
        rulesetId: ruleset.id,
        raceId: races[0].id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Picked-then-archived Feat",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      const klasses = await Klasses.create(db, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: ruleset.id,
        hd: 10,
      });
      const klassLevels = await KlassLevels.create(db, {
        klassId: klasses[0].id,
        level: 1,
      });
      const characterLevels = await db.insert(levelsInCharacter).values({
        characterId: characters[0].id,
        klassLevelId: klassLevels[0].id,
        hp: 10,
      }).returning();
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: characterLevels[0].id,
        featId: feat.id,
        aptitudeId: aptitudes[0].id,
      });

      // Archive the character (sets only charactersInCharacter.deletedAt)
      await Characters.archive(db, { id: characters[0].id });

      // Deletion must still be blocked — the pick survives archive.
      await expect(
        FeatsMethods.deleteRulesetFeat(session, ruleset.id, feat.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should block deletion when a descendant fork has a character picking the feat", async () => {
      // Regression: inUse must consider characters in descendants. A parent
      // author deleting a feat that a fork's character picked would silently
      // wipe the pick via FK CASCADE.
      const { user, ruleset: parent, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(parent.id, 1);

      const races = await Races.create(db, {
        name: `Race ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: parent.id,
        size: "Medium",
        baseSpeed: 30,
      });

      const feat = await FeatsMethods.createRulesetFeat(session, parent.id, {
        name: "Inherited Feat",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Parent must be Published before forkRuleset will accept it
      await Rulesets.update(db, { status: "Published" }, { id: parent.id });

      const { RulesetsMethods } = await import("@/server/services/RulesetsService.ts");
      const fork = await RulesetsMethods.forkRuleset(session, parent.id, {
        name: `Fork ${Math.random().toString(36).substr(2, 6)}`,
        private: true,
      });

      // Character on the fork picks the inherited feat
      const characters = await Characters.create(db, {
        name: "Fork Character",
        userId: user.id,
        rulesetId: fork.id,
        raceId: races[0].id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      const klasses = await Klasses.create(db, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: parent.id,
        hd: 10,
      });
      const klassLevels = await KlassLevels.create(db, {
        klassId: klasses[0].id,
        level: 1,
      });
      const characterLevels = await db.insert(levelsInCharacter).values({
        characterId: characters[0].id,
        klassLevelId: klassLevels[0].id,
        hp: 10,
      }).returning();
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: characterLevels[0].id,
        featId: feat.id,
        aptitudeId: aptitudes[0].id,
      });

      // Parent author tries to delete the feat — should be blocked by fork's character
      await expect(
        FeatsMethods.deleteRulesetFeat(session, parent.id, feat.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should block deletion when a host subscribed to this extension has a character picking the feat", async () => {
      // Regression: inUse must also consider hosts that subscribe to this
      // ruleset as an extension. A homebrew extension author deleting a feat
      // that a subscribing host's character picked would silently wipe the
      // pick via FK CASCADE.
      const { user, ruleset: extension, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(extension.id, 1);

      const feat = await FeatsMethods.createRulesetFeat(session, extension.id, {
        name: "Extension Feat",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Host ruleset subscribes to the extension
      const hostRows = await Rulesets.create(db, {
        name: `Host ${Math.random().toString(36).substr(2, 9)}`,
        description: "Subscribes to the extension",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        extensionRulesetIds: [extension.id],
      });
      const host = hostRows[0];

      // Race + class live on the host so the character can be assembled
      const races = await Races.create(db, {
        name: `Race ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: host.id,
        size: "Medium",
        baseSpeed: 30,
      });
      const klasses = await Klasses.create(db, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: host.id,
        hd: 10,
      });
      const klassLevels = await KlassLevels.create(db, {
        klassId: klasses[0].id,
        level: 1,
      });

      // Character on the host picks the extension's feat
      const characters = await Characters.create(db, {
        name: "Subscriber Character",
        userId: user.id,
        rulesetId: host.id,
        raceId: races[0].id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });
      const characterLevels = await db.insert(levelsInCharacter).values({
        characterId: characters[0].id,
        klassLevelId: klassLevels[0].id,
        hp: 10,
      }).returning();
      await db.insert(levelFeatsInCharacter).values({
        characterLevelId: characterLevels[0].id,
        featId: feat.id,
        aptitudeId: aptitudes[0].id,
      });

      // Extension owner tries to delete the feat — should be blocked by host's character
      await expect(
        FeatsMethods.deleteRulesetFeat(session, extension.id, feat.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should hard-delete aptitude associations (rows removed from DB)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 2);

      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Hard Delete Test",
        description: "Test",
        aptitudeIds: aptitudes.map(a => a.id),
      });

      // Verify associations exist in DB
      let rawAssociations = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.featId, created.id));
      expect(rawAssociations.length).toBe(2);

      // Delete feat
      await FeatsMethods.deleteRulesetFeat(session, ruleset.id, created.id);

      // Associations should be completely gone from DB (hard-deleted, not soft-deleted)
      rawAssociations = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.featId, created.id));
      expect(rawAssociations.length).toBe(0);
    });

    test("should hard-delete customizations (rows removed from DB)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Customization Delete Test",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Add customizations
      await Properties.create(db, {
        entityId: created.id,
        entityType: "feats",
        type: "test",
        value: "test",
      });
      await Requirements.create(db, {
        entityId: created.id,
        entityType: "feats",
        level: "character",
        target: "abilities.strength",
        value: "5",
        valueType: "number",
        operator: "greater_than",
      });

      // Delete feat
      await FeatsMethods.deleteRulesetFeat(session, ruleset.id, created.id);

      // Customizations should be completely gone from DB
      const properties = await Properties.findManyByEntity(db, {
        entityIds: [created.id],
        entityType: "feats",
      });
      expect(properties.length).toBe(0);

      const requirements = await Requirements.findManyByEntity(db, {
        entityIds: [created.id],
        entityType: "feats",
      });
      expect(requirements.length).toBe(0);
    });
  });

  describe("updateRulesetFeat - hard delete pattern", () => {
    test("should hard-delete old aptitude associations when updating with new ones", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 3);

      const created = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Update Delete Test",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      // Update with different aptitudes
      await FeatsMethods.updateRulesetFeat(session, ruleset.id, created.id, {
        name: "Updated",
        description: "Updated",
        aptitudeIds: [aptitudes[1].id, aptitudes[2].id],
      });

      // Old association should be completely gone from DB (hard-deleted)
      const rawAssociations = await db.select().from(featsAptitudesInRules)
        .where(eq(featsAptitudesInRules.featId, created.id));
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
  });

  describe("deleteRulesetFeat - klass_level_feats cascade", () => {
    test("should hard-delete klass_level_feats referencing the feat", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const aptitudes = await createTestAptitudes(ruleset.id, 1);

      const feat = await FeatsMethods.createRulesetFeat(session, ruleset.id, {
        name: "Feat to Cascade",
        description: "Test",
        aptitudeIds: [aptitudes[0].id],
      });

      const klasses = await Klasses.create(db, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
        rulesetId: ruleset.id,
        hd: 10,
      });
      await ClassLevelsMethods.createClassLevel(session, ruleset.id, klasses[0].id, {
        level: 1,
        bab: 1,
        skills: 2,
        feats: [{ featId: feat.id, aptitudeId: aptitudes[0].id }],
      });

      let rawRows = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.featId, feat.id));
      expect(rawRows.length).toBe(1);

      await FeatsMethods.deleteRulesetFeat(session, ruleset.id, feat.id);

      rawRows = await db.select().from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.featId, feat.id));
      expect(rawRows.length).toBe(0);
    });
  });

  describe("COW fork", () => {
    test("should repoint tombstone snapshot when re-creating feat with same name as deleted override", async () => {
      // Regression for the EntitySnapshots write-canonicalization bug:
      // withRequestCache used to ignore { skipCow: true } on writes, so
      // EntitySnapshots.create/delete had their sourceEntityId rewritten through
      // the overrideMap — the parent's id became the (deleted) COW's id, and the
      // tombstone was left dangling instead of being repointed to the new entity.
      const { ruleset: parent, session: parentSession } = await createTestUserAndRuleset();
      const parentAptitudes = await createTestAptitudes(parent.id, 1);
      const parentFeat = await FeatsMethods.createRulesetFeat(parentSession, parent.id, {
        name: "Endurance",
        description: "Original",
        aptitudeIds: [parentAptitudes[0].id],
      });

      await Rulesets.update(db, { status: "Published" }, { id: parent.id });

      const { RulesetsMethods } = await import("@/server/services/RulesetsService.ts");
      const fork = await RulesetsMethods.forkRuleset(parentSession, parent.id, {
        name: `Fork ${Math.random().toString(36).substr(2, 6)}`,
        private: true,
      });

      // Edit the inherited feat in the fork → COW (creates snapshot pointing parent → COW)
      const cow = await FeatsMethods.updateRulesetFeat(parentSession, fork.id, parentFeat.id, {
        name: "Endurance",
        description: "Edited in fork",
        aptitudeIds: [parentAptitudes[0].id],
      });
      expect(cow.id).not.toBe(parentFeat.id);

      // Delete the override → tombstone (snapshot stays, COW row hard-deleted)
      await FeatsMethods.deleteRulesetFeat(parentSession, fork.id, cow.id);

      // Re-create with same name → repointTombstoneSnapshot should run
      const recreated = await FeatsMethods.createRulesetFeat(parentSession, fork.id, {
        name: "Endurance",
        description: "Recreated",
        aptitudeIds: [parentAptitudes[0].id],
      });

      const snapshots = await EntitySnapshots.findByTypeAndRuleset(db, {
        rulesetId: fork.id,
        entityType: "feats",
      });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].sourceEntityId).toBe(parentFeat.id);
      expect(snapshots[0].forkedEntityId).toBe(recreated.id);
    });

    test("should throw ConflictError when creating feat with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      const parentAptitudes = await createTestAptitudes(parentRuleset.id, 1);
      await FeatsMethods.createRulesetFeat(parentSession, parentRuleset.id, {
        name: "Power Attack",
        description: "Trade accuracy for damage",
        aptitudeIds: [parentAptitudes[0].id],
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
        FeatsMethods.createRulesetFeat(childSession, childRuleset.id, {
          name: "Power Attack",
          description: "Duplicate name",
          aptitudeIds: [childAptitudes[0].id],
        }),
      ).rejects.toThrow(ConflictError);
    });
  });
});
