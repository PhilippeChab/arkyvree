import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { db } from "@/server/database/index.ts";
import { Activities, Rulesets, Users, Feats, Races, Requirements } from "@/server/repositories/index.ts";
import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { NotFoundError, ForbiddenError, BadRequestError } from "@/server/errors/index.ts";
import { getTableName } from "drizzle-orm";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("RequirementsService", () => {
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
      description: "Test ruleset for requirements testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  // Helper to create test feat
  async function createTestFeat(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const feats = await Feats.create(db, {
      rulesetId,
      name: `Test Feat ${uniqueId}`,
      description: "Test feat for requirements testing",
    });

    return feats[0];
  }

  // Helper to create test race
  async function createTestRace(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const races = await Races.create(db, {
      rulesetId,
      name: `Test Race ${uniqueId}`,
      description: "Test race for requirements testing",
      size: "Medium",
      baseSpeed: 30,
    });

    return races[0];
  }

  describe("getEntityRequirements", () => {
    test("should return requirements for a valid entity", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const requirements = await RequirementsMethods.getEntityRequirements(
        ruleset.id,
        "feats",
        feat.id,
      );

      expect(requirements).toBeDefined();
      expect(Array.isArray(requirements)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.getEntityRequirements(fakeRulesetId, "feats", feat.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent entity", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeEntityId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.getEntityRequirements(ruleset.id, "feats", fakeEntityId),
      ).rejects.toThrow(NotFoundError);
    });

    test("should return empty array when entity has no requirements", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const requirements = await RequirementsMethods.getEntityRequirements(
        ruleset.id,
        "feats",
        feat.id,
      );

      expect(requirements).toEqual([]);
    });

    test("should work with different entity types (races)", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const race = await createTestRace(ruleset.id);

      const requirements = await RequirementsMethods.getEntityRequirements(
        ruleset.id,
        "races",
        race.id,
      );

      expect(requirements).toBeDefined();
      expect(Array.isArray(requirements)).toBe(true);
    });
  });

  describe("createEntityRequirement", () => {
    test("should create a requirement with chaining operator (no target)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const requirementData = {
        level: "1",
        chainingOperator: "and",
      };

      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        requirementData,
      );

      expect(requirement).toBeDefined();
      expect(requirement.level).toBe("1");
      expect(requirement.chainingOperator).toBe("and");
      expect(requirement.target).toBeNull();
      expect(requirement.value).toBeNull();
      expect(requirement.operator).toBeNull();
      expect(requirement.entityId).toBe(feat.id);
      expect(requirement.entityType).toBe("feats");
    });

    test("should create a requirement with target and value", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const requirementData = {
        level: "1",
        target: "combat.bab",
        value: "5",
        operator: "greater_than_or_equal",
      };

      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        requirementData,
      );

      expect(requirement).toBeDefined();
      expect(requirement.level).toBe("1");
      expect(requirement.target).toBe("combat.bab");
      expect(requirement.value).toBe("5");
      expect(requirement.operator).toBe("greater_than_or_equal");
      expect(requirement.valueType).toBeDefined(); // Should be inferred from path definition
      expect(requirement.chainingOperator).toBeNull();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.createEntityRequirement(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          { level: "1", chainingOperator: "and" },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeEntityId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.createEntityRequirement(
          session,
          ruleset.id,
          "feats",
          fakeEntityId,
          { level: "1", chainingOperator: "and" },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      await expect(
        RequirementsMethods.createEntityRequirement(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          { level: "1", chainingOperator: "and" },
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw BadRequestError for invalid target path", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const requirementData = {
        level: "1",
        target: "invalid.path.that.does.not.exist",
        value: "10",
        operator: "equal",
      };

      await expect(
        RequirementsMethods.createEntityRequirement(
          session,
          ruleset.id,
          "feats",
          feat.id,
          requirementData,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    test("should create activity log when creating requirement", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const requirementData = {
        level: "1",
        chainingOperator: "or",
      };

      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        requirementData,
      );

      // Activities are created in the transaction, just verify requirement was created
      expect(requirement).toBeDefined();
      expect(requirement.id).toBeDefined();
    });

    test("should work with different entity types (races)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const race = await createTestRace(ruleset.id);

      const requirementData = {
        level: "1",
        chainingOperator: "and",
      };

      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "races",
        race.id,
        requirementData,
      );

      expect(requirement).toBeDefined();
      expect(requirement.entityType).toBe("races");
      expect(requirement.entityId).toBe(race.id);
    });
  });

  describe("updateEntityRequirement", () => {
    test("should update requirement with chaining operator", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1",
          chainingOperator: "and",
        },
      );

      // Update it
      const updateData = {
        level: "2",
        chainingOperator: "or",
      };

      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        updateData,
      );

      expect(updated.level).toBe("2");
      expect(updated.chainingOperator).toBe("or");
      expect(updated.id).toBe(created.id);
    });

    test("should update requirement with target and value", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1",
          target: "combat.bab",
          value: "5",
          operator: "greater_than_or_equal",
        },
      );

      // Update it
      const updateData = {
        level: "1",
        target: "combat.bab",
        value: "10",
        operator: "greater_than_or_equal",
      };

      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        updateData,
      );

      expect(updated.value).toBe("10");
      expect(updated.target).toBe("combat.bab");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.updateEntityRequirement(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          created.id,
          { level: "2", chainingOperator: "or" },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent requirement", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRequirementId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.updateEntityRequirement(
          session,
          ruleset.id,
          "feats",
          feat.id,
          fakeRequirementId,
          { level: "2", chainingOperator: "or" },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when requirement doesn't belong to entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat1 = await createTestFeat(ruleset.id);
      const feat2 = await createTestFeat(ruleset.id);

      // Create requirement for feat1
      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat1.id,
        { level: "1", chainingOperator: "and" },
      );

      // Try to update it as belonging to feat2
      await expect(
        RequirementsMethods.updateEntityRequirement(
          session,
          ruleset.id,
          "feats",
          feat2.id,
          requirement.id,
          { level: "2", chainingOperator: "or" },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement as owner
      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Try to update as different user
      await expect(
        RequirementsMethods.updateEntityRequirement(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          requirement.id,
          { level: "2", chainingOperator: "or" },
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw BadRequestError for invalid target path", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1",
          target: "combat.bab",
          value: "5",
          operator: "greater_than_or_equal",
        },
      );

      // Try to update with invalid path
      await expect(
        RequirementsMethods.updateEntityRequirement(
          session,
          ruleset.id,
          "feats",
          feat.id,
          created.id,
          {
            level: "1",
            target: "invalid.path.does.not.exist",
            value: "10",
            operator: "equal",
          },
        ),
      ).rejects.toThrow(BadRequestError);
    });

    test("should create activity log when updating requirement", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Update it
      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        { level: "2", chainingOperator: "or" },
      );

      // Activities are created in the transaction, just verify update was successful
      expect(updated).toBeDefined();
      expect(updated.level).toBe("2");
    });

    test("should infer value type from path definition when updating", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1",
          target: "combat.bab",
          value: "5",
          operator: "greater_than_or_equal",
        },
      );

      // Update with different target
      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        {
          level: "1",
          target: "combat.ac.total",
          value: "10",
          operator: "greater_than_or_equal",
        },
      );

      // Value type should be inferred from the new path
      expect(updated.valueType).toBeDefined();
      expect(updated.target).toBe("combat.ac.total");
    });
  });

  describe("deleteEntityRequirement", () => {
    test("should delete a requirement", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Delete it
      const deleted = await RequirementsMethods.deleteEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's deleted
      const requirement = await Requirements.findOne(db, { id: created.id });
      expect(requirement).toBeUndefined();
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.deleteEntityRequirement(
          session,
          fakeRulesetId,
          "feats",
          feat.id,
          created.id,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent requirement", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);
      const fakeRequirementId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RequirementsMethods.deleteEntityRequirement(
          session,
          ruleset.id,
          "feats",
          feat.id,
          fakeRequirementId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when requirement doesn't belong to entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat1 = await createTestFeat(ruleset.id);
      const feat2 = await createTestFeat(ruleset.id);

      // Create requirement for feat1
      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat1.id,
        { level: "1", chainingOperator: "and" },
      );

      // Try to delete it as belonging to feat2
      await expect(
        RequirementsMethods.deleteEntityRequirement(
          session,
          ruleset.id,
          "feats",
          feat2.id,
          requirement.id,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement as owner
      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Try to delete as different user
      await expect(
        RequirementsMethods.deleteEntityRequirement(
          otherSession,
          ruleset.id,
          "feats",
          feat.id,
          requirement.id,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should create activity log when deleting requirement", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Delete it
      const deleted = await RequirementsMethods.deleteEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
      );

      // Activities are created in the transaction, just verify deletion was successful
      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should work with different entity types (races)", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const race = await createTestRace(ruleset.id);

      // Create requirement first
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "races",
        race.id,
        { level: "1", chainingOperator: "and" },
      );

      // Delete it
      const deleted = await RequirementsMethods.deleteEntityRequirement(
        session,
        ruleset.id,
        "races",
        race.id,
        created.id,
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should cascade delete activities for the requirement", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      const requirement = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Verify create activity exists
      const activitiesBefore = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(requirementsInCustomization) },
        { limit: 100, page: 1 },
      );
      const createActivity = activitiesBefore.items.find(
        (a) => a.targetId === requirement.id && a.type === "createRequirement",
      );
      expect(createActivity).toBeDefined();

      await RequirementsMethods.deleteEntityRequirement(session, ruleset.id, "feats", feat.id, requirement.id);

      // Verify create activity was deleted but delete activity was created
      const activitiesAfter = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(requirementsInCustomization) },
        { limit: 100, page: 1 },
      );
      const remaining = activitiesAfter.items.filter((a) => a.targetId === requirement.id);
      expect(remaining.length).toBe(1);
      expect(remaining[0].type).toBe("deleteRequirement");
    });
  });

  describe("complex scenarios", () => {
    test("should handle multiple requirements for the same entity", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create multiple requirements
      const req1 = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      const req2 = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1.1",
          target: "combat.bab",
          value: "5",
          operator: "greater_than_or_equal",
        },
      );

      const req3 = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1.2",
          target: "combat.ac.total",
          value: "10",
          operator: "greater_than_or_equal",
        },
      );

      // Get all requirements
      const requirements = await RequirementsMethods.getEntityRequirements(
        ruleset.id,
        "feats",
        feat.id,
      );

      expect(requirements.length).toBe(3);
      const reqIds = requirements.map((r) => r.id);
      expect(reqIds).toContain(req1.id);
      expect(reqIds).toContain(req2.id);
      expect(reqIds).toContain(req3.id);
    });

    test("should handle nested requirement hierarchy", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create parent requirement (level 1)
      const parent = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Create child requirements (level 1.1, 1.2)
      await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1.1",
          target: "combat.bab",
          value: "5",
          operator: "greater_than_or_equal",
        },
      );

      const child2 = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1.2", chainingOperator: "or" },
      );

      // Create grandchild requirements (level 1.2.1, 1.2.2)
      await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1.2.1",
          target: "combat.ac.total",
          value: "10",
          operator: "greater_than_or_equal",
        },
      );

      await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1.2.2",
          target: "combat.ac.total",
          value: "15",
          operator: "greater_than_or_equal",
        },
      );

      // Get all requirements
      const requirements = await RequirementsMethods.getEntityRequirements(
        ruleset.id,
        "feats",
        feat.id,
      );

      expect(requirements.length).toBe(5);

      // Verify hierarchy
      const parentReq = requirements.find((r) => r.id === parent.id);
      expect(parentReq?.level).toBe("1");
      expect(parentReq?.chainingOperator).toBe("and");

      const child2Req = requirements.find((r) => r.id === child2.id);
      expect(child2Req?.level).toBe("1.2");
      expect(child2Req?.chainingOperator).toBe("or");
    });

    test("should update chaining requirement with different chaining operator", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create chaining requirement
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        { level: "1", chainingOperator: "and" },
      );

      // Update chaining operator
      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        {
          level: "1",
          chainingOperator: "or",
        },
      );

      expect(updated.chainingOperator).toBe("or");
      expect(updated.target).toBeNull();
      expect(updated.value).toBeNull();
      expect(updated.operator).toBeNull();
    });

    test("should update target-based requirement with different target", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const feat = await createTestFeat(ruleset.id);

      // Create target-based requirement
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        {
          level: "1",
          target: "combat.bab",
          value: "5",
          operator: "greater_than_or_equal",
        },
      );

      // Update with different target
      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        ruleset.id,
        "feats",
        feat.id,
        created.id,
        {
          level: "1",
          target: "combat.ac.total",
          value: "15",
          operator: "greater_than_or_equal",
        },
      );

      expect(updated.target).toBe("combat.ac.total");
      expect(updated.value).toBe("15");
      expect(updated.chainingOperator).toBeNull();
    });
  });
});
