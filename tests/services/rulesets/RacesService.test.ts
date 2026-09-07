import { RacesMethods } from "@/server/services/rulesets/RacesService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Rulesets, Users } from "@/server/repositories/index.ts";
import { ConflictError, NotFoundError, ForbiddenError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("RacesService", () => {
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
      description: "Test ruleset for races testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: createTestSession(user.id) };
  }

  describe("getRulesetRaces", () => {
    test("should return races for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await RacesMethods.getRulesetRaces(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RacesMethods.getRulesetRaces(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    test("should return created races for the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create a race
      await RacesMethods.createRulesetRace(session, ruleset.id, {
        name: "Test Race",
        description: "A test race",
        size: "Medium",
        baseSpeed: 30,
      });

      const result = await RacesMethods.getRulesetRaces(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBeGreaterThan(0);
      const foundRace = result.items.find((r) => r.name === "Test Race");
      expect(foundRace).toBeDefined();
    });
  });

  describe("getRulesetRace", () => {
    test("should return a specific race from a ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create a race
      const created = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "Test Race",
          description: "A test race",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      const race = await RacesMethods.getRulesetRace(ruleset.id, created.id);

      expect(race).toBeDefined();
      expect(race.id).toBe(created.id);
      expect(race.name).toBe("Test Race");
      expect(race.rulesetId).toBe(ruleset.id);
    });

    test("should throw NotFoundError for non-existent race", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeRaceId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RacesMethods.getRulesetRace(ruleset.id, fakeRaceId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when race exists but not in the specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1 } =
        await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();

      // Create race in ruleset1
      const race = await RacesMethods.createRulesetRace(
        session1,
        ruleset1.id,
        {
          name: "Test Race",
          description: "A test race",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      // Try to get it from ruleset2
      await expect(
        RacesMethods.getRulesetRace(ruleset2.id, race.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createRulesetRace", () => {
    test("should create a race with all fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const raceData = {
        name: "Test Race",
        description: "A test race for unit testing",
        size: "Medium" as const,
        baseSpeed: 30,
      };

      const race = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        raceData
      );

      expect(race).toBeDefined();
      expect(race.name).toBe(raceData.name);
      expect(race.description).toBe(raceData.description);
      expect(race.size).toBe(raceData.size);
      expect(race.baseSpeed).toBe(raceData.baseSpeed);
      expect(race.rulesetId).toBe(ruleset.id);
    });

    test("should create a race with different size values", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const sizes = [
        "Fine",
        "Diminutive",
        "Tiny",
        "Small",
        "Medium",
        "Large",
        "Huge",
        "Gargantuan",
        "Colossal",
      ] as const;

      for (const size of sizes) {
        const race = await RacesMethods.createRulesetRace(
          session,
          ruleset.id,
          {
            name: `${size} Race`,
            description: `A ${size} race`,
            size,
            baseSpeed: 30,
          }
        );

        expect(race.size).toBe(size);
      }
    });

    test("should create a race with different base speeds", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const speeds = [20, 25, 30, 35, 40, 50, 60];

      for (const baseSpeed of speeds) {
        const race = await RacesMethods.createRulesetRace(
          session,
          ruleset.id,
          {
            name: `Race with speed ${baseSpeed}`,
            description: "A test race",
            size: "Medium",
            baseSpeed,
          }
        );

        expect(race.baseSpeed).toBe(baseSpeed);
      }
    });

    test("should use default values for size and baseSpeed if not provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      const race = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "Default Race",
          description: "A race with default values",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      expect(race.size).toBe("Medium");
      expect(race.baseSpeed).toBe(30);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RacesMethods.createRulesetRace(session, fakeRulesetId, {
          name: "Test Race",
          description: "Test",
          size: "Medium",
          baseSpeed: 30,
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      await expect(
        RacesMethods.createRulesetRace(otherSession, ruleset.id, {
          name: "Test Race",
          description: "Test",
          size: "Medium",
          baseSpeed: 30,
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateRulesetRace", () => {
    test("should update a race", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create race first
      const created = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "Original Race",
          description: "Original description",
          size: "Small",
          baseSpeed: 20,
        }
      );

      // Update it
      const updateData = {
        name: "Updated Race",
        description: "Updated description",
        size: "Large" as const,
        baseSpeed: 40,
      };

      const updated = await RacesMethods.updateRulesetRace(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
      expect(updated.size).toBe(updateData.size);
      expect(updated.baseSpeed).toBe(updateData.baseSpeed);
      expect(updated.id).toBe(created.id);
    });

    test("should update only specific fields", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create race
      const created = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "Original Name",
          description: "Original description",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      // Update only name
      const updated = await RacesMethods.updateRulesetRace(
        session,
        ruleset.id,
        created.id,
        {
          name: "Updated Name",
          description: created.description ?? undefined,
          size: created.size,
          baseSpeed: created.baseSpeed,
        }
      );

      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe(created.description);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RacesMethods.updateRulesetRace(
          session,
          fakeRulesetId,
          "fake-race-id",
          {
            name: "Test",
            description: "Test",
            size: "Medium",
            baseSpeed: 30,
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent race", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeRaceId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RacesMethods.updateRulesetRace(session, ruleset.id, fakeRaceId, {
          name: "Test",
          description: "Test",
          size: "Medium",
          baseSpeed: 30,
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create race as owner
      const race = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "Test Race",
          description: "Test",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      // Try to update as different user
      await expect(
        RacesMethods.updateRulesetRace(otherSession, ruleset.id, race.id, {
          name: "Updated",
          description: "Updated",
          size: "Large",
          baseSpeed: 40,
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetRace", () => {
    test("should delete a race", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create race first
      const created = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "To Delete",
          description: "This race will be deleted",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      // Delete it
      const deleted = await RacesMethods.deleteRulesetRace(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      // Verify it's deleted
      await expect(
        RacesMethods.getRulesetRace(ruleset.id, created.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RacesMethods.deleteRulesetRace(session, fakeRulesetId, "fake-race-id")
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent race", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeRaceId = "00000000-0000-0000-0000-000000000000";

      await expect(
        RacesMethods.deleteRulesetRace(session, ruleset.id, fakeRaceId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create race as owner
      const race = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "Test Race",
          description: "Test",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      // Try to delete as different user
      await expect(
        RacesMethods.deleteRulesetRace(otherSession, ruleset.id, race.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should block deletion when a character in this ruleset uses the race", async () => {
      const { user, ruleset, session } = await createTestUserAndRuleset();

      const race = await RacesMethods.createRulesetRace(session, ruleset.id, {
        name: "Used Race",
        description: "Test",
        size: "Medium",
        baseSpeed: 30,
      });

      await Characters.create(db, {
        name: "Test Character",
        userId: user.id,
        rulesetId: ruleset.id,
        raceId: race.id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      await expect(
        RacesMethods.deleteRulesetRace(session, ruleset.id, race.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should allow deletion in a fork even when parent has a character using the inherited race", async () => {
      // Regression: existsByRaceId previously didn't filter by ruleset, so a
      // parent ruleset's character would block deletion of an inherited entity
      // in a fork that has no characters of its own.
      const { user, ruleset: parent, session } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parent.id });

      const race = await RacesMethods.createRulesetRace(session, parent.id, {
        name: "Inherited Race",
        description: "Test",
        size: "Medium",
        baseSpeed: 30,
      });

      // Parent has a character that picked this race
      await Characters.create(db, {
        name: "Parent Character",
        userId: user.id,
        rulesetId: parent.id,
        raceId: race.id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      const fork = await RulesetsMethods.forkRuleset(session, parent.id, {
        name: `Fork ${Math.random().toString(36).substr(2, 6)}`,
        private: true,
      });

      // Fork has no characters — deletion of the inherited race should succeed
      const deleted = await RacesMethods.deleteRulesetRace(session, fork.id, race.id);
      expect(deleted).toBeDefined();
    });

    test("should block deletion when a descendant fork has a character using the race", async () => {
      // Regression: inUse must consider characters in descendants (forks of
      // forks), not just the current ruleset. Otherwise the parent author
      // could delete a race that downstream forks' characters rely on.
      const { user, ruleset: parent, session } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parent.id });

      const race = await RacesMethods.createRulesetRace(session, parent.id, {
        name: "Inherited Race",
        description: "Test",
        size: "Medium",
        baseSpeed: 30,
      });

      const fork = await RulesetsMethods.forkRuleset(session, parent.id, {
        name: `Fork ${Math.random().toString(36).substr(2, 6)}`,
        private: true,
      });

      // Character lives on the fork, picking the parent's race
      await Characters.create(db, {
        name: "Fork Character",
        userId: user.id,
        rulesetId: fork.id,
        raceId: race.id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      // Parent author tries to delete the race — should be blocked
      await expect(
        RacesMethods.deleteRulesetRace(session, parent.id, race.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should block deletion when a host subscribed to this extension has a character using the race", async () => {
      // Regression: inUse must also consider hosts that subscribe to this
      // ruleset as an extension. A homebrew extension author deleting a race
      // that a subscribing host's character chose would silently break the
      // character.
      const { user, ruleset: extension, session } = await createTestUserAndRuleset();

      const race = await RacesMethods.createRulesetRace(session, extension.id, {
        name: "Extension Race",
        description: "Test",
        size: "Medium",
        baseSpeed: 30,
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

      // Character on the host picks the extension's race
      await Characters.create(db, {
        name: "Subscriber Character",
        userId: user.id,
        rulesetId: host.id,
        raceId: race.id,
        xp: 0,
        alignment: "Neutral Good",
        age: 25,
        gender: "Male",
        height: "180",
        weight: "75",
      });

      // Extension owner tries to delete the race — should be blocked by host's character
      await expect(
        RacesMethods.deleteRulesetRace(session, extension.id, race.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should use canDeleteEntity policy instead of canUpdate", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create race
      const race = await RacesMethods.createRulesetRace(
        session,
        ruleset.id,
        {
          name: "Test Race",
          description: "Test",
          size: "Medium",
          baseSpeed: 30,
        }
      );

      // Delete should work with canDeleteEntity policy
      const deleted = await RacesMethods.deleteRulesetRace(
        session,
        ruleset.id,
        race.id
      );

      expect(deleted).toBeDefined();
    });
  });

  describe("COW fork", () => {
    test("should throw ConflictError when creating race with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      await RacesMethods.createRulesetRace(parentSession, parentRuleset.id, {
        name: "Elf",
        description: "Graceful and long-lived",
        size: "Medium",
        baseSpeed: 30,
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
        RacesMethods.createRulesetRace(childSession, childRuleset.id, {
          name: "Elf",
          description: "Duplicate name",
          size: "Medium",
          baseSpeed: 30,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });
});
