import { MechanicsMethods } from "@/server/services/rulesets/MechanicsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { db } from "@/server/database/index.ts";
import {
  Mechanics,
  Rulesets,
  Users,
} from "@/server/repositories/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("MechanicsService", () => {
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
      description: "Test ruleset for mechanics testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  describe("getRulesetMechanics", () => {
    test("should return empty paginated result when no mechanics exist", async () => {
      const { ruleset } = await createTestSetup();

      const result = await MechanicsMethods.getRulesetMechanics(
        ruleset.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items).toEqual([]);
    });

    test("should return mechanics for a ruleset", async () => {
      const { ruleset, session } = await createTestSetup();

      await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
        description: "To trip an opponent, make a melee touch attack.",
      });

      const result = await MechanicsMethods.getRulesetMechanics(
        ruleset.id,
        {},
        { limit: 10, page: 1 },
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe("Trip");
    });

    test("should support search", async () => {
      const { ruleset, session } = await createTestSetup();

      await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
        description: "Sweep the legs",
      });
      await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Disarm",
        description: "Knock the weapon away",
      });

      const result = await MechanicsMethods.getRulesetMechanics(
        ruleset.id,
        { search: "Trip" },
        { limit: 10, page: 1 },
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe("Trip");
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      await expect(
        MechanicsMethods.getRulesetMechanics(
          "00000000-0000-0000-0000-000000000000",
          {},
          { limit: 10, page: 1 },
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getRulesetMechanic", () => {
    test("should return a mechanic by id", async () => {
      const { ruleset, session } = await createTestSetup();

      const created = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Grapple",
        description: "Wrestling rules",
      });

      const fetched = await MechanicsMethods.getRulesetMechanic(ruleset.id, created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe("Grapple");
    });

    test("should throw NotFoundError for non-existent mechanic", async () => {
      const { ruleset } = await createTestSetup();

      await expect(
        MechanicsMethods.getRulesetMechanic(ruleset.id, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createRulesetMechanic", () => {
    test("should create a mechanic", async () => {
      const { ruleset, session } = await createTestSetup();

      const mechanic = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Bull Rush",
        description: "Push an opponent back",
      });

      expect(mechanic).toBeDefined();
      expect(mechanic.name).toBe("Bull Rush");
      expect(mechanic.description).toBe("Push an opponent back");
      expect(mechanic.rulesetId).toBe(ruleset.id);
    });

    test("should create a mechanic without description", async () => {
      const { ruleset, session } = await createTestSetup();

      const mechanic = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Overrun",
      });

      expect(mechanic.name).toBe("Overrun");
      expect(mechanic.description).toBeNull();
    });

    test("should throw ConflictError for duplicate name in same ruleset", async () => {
      const { ruleset, session } = await createTestSetup();

      await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
        description: "First",
      });

      await expect(
        MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
          name: "Trip",
          description: "Duplicate",
        }),
      ).rejects.toThrow(ConflictError);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestSetup();

      await expect(
        MechanicsMethods.createRulesetMechanic(session, "00000000-0000-0000-0000-000000000000", {
          name: "Trip",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestSetup();
      const { session: otherSession } = await createTestSetup();

      await expect(
        MechanicsMethods.createRulesetMechanic(otherSession, ruleset.id, {
          name: "Trip",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateRulesetMechanic", () => {
    test("should update a mechanic", async () => {
      const { ruleset, session } = await createTestSetup();

      const mechanic = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
        description: "Original text",
      });

      const updated = await MechanicsMethods.updateRulesetMechanic(session, ruleset.id, mechanic.id, {
        name: "Trip",
        description: "Updated text",
      });

      expect(updated.description).toBe("Updated text");
    });

    test("should throw NotFoundError for non-existent mechanic", async () => {
      const { ruleset, session } = await createTestSetup();

      await expect(
        MechanicsMethods.updateRulesetMechanic(
          session,
          ruleset.id,
          "00000000-0000-0000-0000-000000000000",
          { name: "Trip" },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestSetup();
      const { session: otherSession } = await createTestSetup();

      const mechanic = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
      });

      await expect(
        MechanicsMethods.updateRulesetMechanic(otherSession, ruleset.id, mechanic.id, {
          name: "Trip",
          description: "Hijacked",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetMechanic", () => {
    test("should delete a mechanic", async () => {
      const { ruleset, session } = await createTestSetup();

      const mechanic = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
      });

      const deleted = await MechanicsMethods.deleteRulesetMechanic(session, ruleset.id, mechanic.id);

      expect(deleted.id).toBe(mechanic.id);

      const found = await Mechanics.findOne(db, { id: mechanic.id });
      expect(found).toBeUndefined();
    });

    test("should throw NotFoundError for non-existent mechanic", async () => {
      const { ruleset, session } = await createTestSetup();

      await expect(
        MechanicsMethods.deleteRulesetMechanic(
          session,
          ruleset.id,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestSetup();
      const { session: otherSession } = await createTestSetup();

      const mechanic = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
      });

      await expect(
        MechanicsMethods.deleteRulesetMechanic(otherSession, ruleset.id, mechanic.id),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("COW fork", () => {
    test("should throw ConflictError when creating mechanic with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestSetup();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      await MechanicsMethods.createRulesetMechanic(parentSession, parentRuleset.id, {
        name: "Trip",
        description: "Parent rule",
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

      await expect(
        MechanicsMethods.createRulesetMechanic(childSession, childRuleset.id, {
          name: "Trip",
          description: "Duplicate",
        }),
      ).rejects.toThrow(ConflictError);
    });

    test("should COW an inherited mechanic on update", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestSetup();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      const parentMechanic = await MechanicsMethods.createRulesetMechanic(parentSession, parentRuleset.id, {
        name: "Trip",
        description: "Original",
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

      const updated = await MechanicsMethods.updateRulesetMechanic(
        childSession,
        childRuleset.id,
        parentMechanic.id,
        { name: "Trip", description: "Overridden in fork" },
      );

      // COW should have created a new row in the child ruleset
      expect(updated.rulesetId).toBe(childRuleset.id);
      expect(updated.description).toBe("Overridden in fork");
      expect(updated.id).not.toBe(parentMechanic.id);

      // Parent mechanic should be untouched
      const parentAfter = await Mechanics.findOne(db, { id: parentMechanic.id });
      expect(parentAfter?.description).toBe("Original");
    });
  });

  describe("archiveRuleset", () => {
    test("does not cascade-archive owned mechanics (archive is a parent status flip)", async () => {
      const { ruleset, session } = await createTestSetup();

      const mechanic = await MechanicsMethods.createRulesetMechanic(session, ruleset.id, {
        name: "Trip",
        description: "Will be archived",
      });

      await RulesetsMethods.archiveRuleset(session, ruleset.id);

      const found = await Mechanics.findOne(db, { id: mechanic.id });
      expect(found?.deletedAt).toBeNull();
    });
  });
});
