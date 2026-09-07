import RulesetsPolicy from "@/server/services/policies/RulesetsPolicy.ts";
import { ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import type { Ruleset } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("RulesetsPolicy", () => {
  const createSession = (userId: string): Session => ({
    id: "session-123",
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const createRuleset = (overrides: Partial<Ruleset> = {}): Ruleset => ({
    id: "ruleset-123",
    name: "Test Ruleset",
    description: "Test description",
    private: true,
    baseRules: "Dungeons & Dragons: 3.5",
    status: "Draft",
    kind: "ruleset",
    userId: "user-123" as string | null,
    system: false,
    rulesetId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    ancestorRulesetIds: [],
    extensionRulesetIds: [],
    ...overrides,
  });

  describe("canCreate", () => {
    test("should always return true", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset();
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canCreate()).toBe(true);
    });
  });

  describe("canRead", () => {
    test("should always return true", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset();
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canRead()).toBe(true);
    });
  });

  describe("canUpdate", () => {
    test("should allow updating own draft ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canUpdate()).toBe(true);
    });

    test("should allow updating own published ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Published" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canUpdate()).toBe(true);
    });

    test("should throw ForbiddenError for base rulesets (no userId)", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: null });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canUpdate()).toThrow(ForbiddenError);
      expect(() => policy.canUpdate()).toThrow("Cannot edit a base ruleset");
    });

    test("should throw ForbiddenError when editing another user's ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canUpdate()).toThrow(ForbiddenError);
      expect(() => policy.canUpdate()).toThrow("Cannot edit another user's ruleset");
    });

    test("should throw UnprocessableEntityError for archived rulesets", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Archived" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canUpdate()).toThrow(UnprocessableEntityError);
      expect(() => policy.canUpdate()).toThrow("Archived rulesets are read-only");
    });
  });

  describe("canDelete", () => {
    test("should always return false", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset();
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canDelete()).toBe(false);
    });
  });

  describe("canPublish", () => {
    test("should allow publishing own draft ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canPublish()).toBe(true);
    });

    test("should throw ForbiddenError for base rulesets", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: null, status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canPublish()).toThrow(ForbiddenError);
      expect(() => policy.canPublish()).toThrow("Cannot publish a base ruleset");
    });

    test("should throw ForbiddenError when publishing another user's ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canPublish()).toThrow(ForbiddenError);
      expect(() => policy.canPublish()).toThrow("Cannot publish another user's ruleset");
    });

    test("should throw UnprocessableEntityError when publishing already published ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Published" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canPublish()).toThrow(UnprocessableEntityError);
      expect(() => policy.canPublish()).toThrow("Can only publish draft rulesets");
    });

    test("should throw UnprocessableEntityError when publishing archived ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Archived" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canPublish()).toThrow(UnprocessableEntityError);
      expect(() => policy.canPublish()).toThrow("Can only publish draft rulesets");
    });
  });

  describe("canFork", () => {
    test("should allow forking a published base ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: null, rulesetId: null, status: "Published" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canFork()).toBe(true);
    });

    test("should throw UnprocessableEntityError for non-published rulesets", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: null, rulesetId: null, status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canFork()).toThrow(UnprocessableEntityError);
      expect(() => policy.canFork()).toThrow("Can only fork published rulesets");
    });

    test("should reject forking a system extension (rulesetId set, userId null)", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: null, rulesetId: "base-123", status: "Published" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canFork()).toThrow(UnprocessableEntityError);
      expect(() => policy.canFork()).toThrow("Cannot fork a non-base ruleset");
    });

    test("should reject forking a user fork (rulesetId set, userId set) — no fork-of-fork", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", rulesetId: "base-123", status: "Published" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canFork()).toThrow(UnprocessableEntityError);
      expect(() => policy.canFork()).toThrow("Cannot fork a non-base ruleset");
    });
  });

  describe("canDeleteEntity", () => {
    test("should allow deleting entity from own draft ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canDeleteEntity()).toBe(true);
    });

    test("should throw ForbiddenError for base rulesets", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: null, status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canDeleteEntity()).toThrow(ForbiddenError);
      expect(() => policy.canDeleteEntity()).toThrow("Cannot edit a base ruleset");
    });

    test("should throw ForbiddenError when deleting from another user's ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canDeleteEntity()).toThrow(ForbiddenError);
      expect(() => policy.canDeleteEntity()).toThrow("Cannot edit another user's ruleset");
    });

    test("should throw UnprocessableEntityError for archived rulesets", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Archived" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canDeleteEntity()).toThrow(UnprocessableEntityError);
      expect(() => policy.canDeleteEntity()).toThrow("Archived rulesets are read-only");
    });

    test("should allow deleting from published ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Published" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canDeleteEntity()).toBe(true);
    });

    test("should still block archived rulesets", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Archived" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canDeleteEntity()).toThrow(UnprocessableEntityError);
      expect(() => policy.canDeleteEntity()).toThrow("Archived rulesets are read-only");
    });
  });

  describe("contributor roles", () => {
    test("canUpdate should allow Admin contributor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Admin");

      expect(policy.canUpdate()).toBe(true);
    });

    test("canUpdate should throw for Editor contributor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Editor");

      expect(() => policy.canUpdate()).toThrow(ForbiddenError);
    });

    test("canUpdate should throw for Viewer contributor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Viewer");

      expect(() => policy.canUpdate()).toThrow(ForbiddenError);
    });

    test("canUpdateEntity should allow Admin contributor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Admin");

      expect(policy.canUpdateEntity()).toBe(true);
    });

    test("canUpdateEntity should allow Editor contributor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Editor");

      expect(policy.canUpdateEntity()).toBe(true);
    });

    test("canUpdateEntity should throw for Viewer contributor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Viewer");

      expect(() => policy.canUpdateEntity()).toThrow(ForbiddenError);
    });

    test("canDeleteEntity should allow Editor on draft ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Editor");

      expect(policy.canDeleteEntity()).toBe(true);
    });

    test("canDeleteEntity should throw for Viewer contributor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Viewer");

      expect(() => policy.canDeleteEntity()).toThrow(ForbiddenError);
    });

    test("canManageContributors should allow Admin", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Admin");

      expect(policy.canManageContributors()).toBe(true);
    });

    test("canManageContributors should throw for Editor", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Editor");

      expect(() => policy.canManageContributors()).toThrow(ForbiddenError);
    });

    test("canManageContributors should allow owner", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-123", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(policy.canManageContributors()).toBe(true);
    });

    test("canPublish should throw for Admin contributor (owner-only)", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });
      const policy = new RulesetsPolicy(session, ruleset, "Admin");

      expect(() => policy.canPublish()).toThrow(ForbiddenError);
    });

    test("contributor roles on archived ruleset should still throw archived error", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Archived" });
      const policy = new RulesetsPolicy(session, ruleset, "Admin");

      expect(() => policy.canUpdate()).toThrow(UnprocessableEntityError);
      expect(() => policy.canUpdateEntity()).toThrow(UnprocessableEntityError);
    });

    test("backward compatibility — null role behaves like before", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: "user-456", status: "Draft" });

      // No role arg — same as before
      const policy1 = new RulesetsPolicy(session, ruleset);
      expect(() => policy1.canUpdate()).toThrow(ForbiddenError);

      // Explicit null — same behavior
      const policy2 = new RulesetsPolicy(session, ruleset, null);
      expect(() => policy2.canUpdate()).toThrow(ForbiddenError);
    });
  });

  describe("edge cases", () => {
    test("should handle null userId as base ruleset", () => {
      const session = createSession("user-123");
      const ruleset = createRuleset({ userId: null });
      const policy = new RulesetsPolicy(session, ruleset);

      expect(() => policy.canUpdate()).toThrow(ForbiddenError);
      expect(() => policy.canPublish()).toThrow(ForbiddenError);
      expect(() => policy.canDeleteEntity()).toThrow(ForbiddenError);
    });

    test("should handle all status values correctly", () => {
      const session = createSession("user-123");

      // Draft - should work
      const draftRuleset = createRuleset({ userId: "user-123", status: "Draft" });
      expect(new RulesetsPolicy(session, draftRuleset).canUpdate()).toBe(true);

      // Published - update works, publish doesn't
      const publishedRuleset = createRuleset({ userId: "user-123", status: "Published" });
      expect(new RulesetsPolicy(session, publishedRuleset).canUpdate()).toBe(true);
      expect(() => new RulesetsPolicy(session, publishedRuleset).canPublish()).toThrow();

      // Archived - nothing works
      const archivedRuleset = createRuleset({ userId: "user-123", status: "Archived" });
      expect(() => new RulesetsPolicy(session, archivedRuleset).canUpdate()).toThrow(UnprocessableEntityError);
    });
  });
});
