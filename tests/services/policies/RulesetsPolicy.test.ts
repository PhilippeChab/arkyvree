import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Campaigns, Players } from "@/server/repositories/index.ts";
import RulesetsPolicy from "@/server/services/policies/RulesetsPolicy.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { Ruleset } from "@/shared/relations.ts";
import { createTestRuleset, createTestUser, makeSession } from "@/tests/helpers.ts";

const OWNER = "owner-id";
const OTHER = "other-id";

type Actor = "Owner" | ContributorRole | "Stranger";
const ACTORS: Actor[] = ["Owner", "Admin", "Editor", "Viewer", "Stranger"];

function rulesetOf(overrides: Partial<Ruleset> = {}): Ruleset {
  const now = new Date().toISOString();
  return {
    id: "ruleset-id",
    name: "Test Ruleset",
    description: "",
    private: true,
    baseRules: "Dungeons & Dragons: 3.5",
    status: "Draft",
    kind: "ruleset",
    userId: OWNER,
    system: false,
    rulesetId: "base-id",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ancestorRulesetIds: ["base-id"],
    extensionRulesetIds: [],
    ...overrides,
  };
}

/** The policy `actor` gets on a draft fork owned by OWNER, adjusted by `overrides`. */
function policyOf(actor: Actor, overrides: Partial<Ruleset> = {}) {
  const role: ContributorRole | null = actor === "Owner" || actor === "Stranger" ? null : actor;
  return new RulesetsPolicy(makeSession(actor === "Owner" ? OWNER : OTHER), rulesetOf(overrides), role);
}

/** Which actors may act; everyone else gets `error`. */
function expectOnly(
  allowed: Actor[],
  check: (policy: RulesetsPolicy) => unknown,
  error: typeof ForbiddenError,
  overrides: Partial<Ruleset> = {},
) {
  for (const actor of ACTORS) {
    const run = () => check(policyOf(actor, overrides));
    if (allowed.includes(actor)) expect(run()).toBe(true);
    else expect(run).toThrow(error);
  }
}

describe("RulesetsPolicy", () => {
  test("canUpdate: the owner and Admin contributors, on a ruleset that isn't archived", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canUpdate(), ForbiddenError);
    expectOnly(["Owner", "Admin"], (p) => p.canUpdate(), ForbiddenError, { status: "Published" });
    expect(() => policyOf("Owner", { status: "Archived" }).canUpdate()).toThrow("Archived rulesets are read-only");
    expect(() => policyOf("Admin", { status: "Archived" }).canUpdate()).toThrow(UnprocessableEntityError);
    expect(() => policyOf("Owner", { userId: null }).canUpdate()).toThrow("Cannot edit a base ruleset");
  });

  test("canUpdateEntity and canDeleteEntity: the owner, Admins and Editors", () => {
    expectOnly(["Owner", "Admin", "Editor"], (p) => p.canUpdateEntity(), ForbiddenError);
    expectOnly(["Owner", "Admin", "Editor"], (p) => p.canDeleteEntity(), ForbiddenError);
    expectOnly(["Owner", "Admin", "Editor"], (p) => p.canDeleteEntity(), ForbiddenError, { status: "Published" });
    for (const check of [(p: RulesetsPolicy) => p.canUpdateEntity(), (p: RulesetsPolicy) => p.canDeleteEntity()]) {
      expect(() => check(policyOf("Editor", { status: "Archived" }))).toThrow(UnprocessableEntityError);
      expect(() => check(policyOf("Owner", { userId: null }))).toThrow("Cannot edit a base ruleset");
    }
  });

  test("canDeleteEntity refuses an entity characters use", () => {
    expect(() => policyOf("Owner").canDeleteEntity({ inUse: true })).toThrow(ConflictError);
  });

  test("canPublish: the owner, on a draft", () => {
    expectOnly(["Owner"], (p) => p.canPublish(), ForbiddenError);
    for (const status of ["Published", "Archived"] as const) {
      expect(() => policyOf("Owner", { status }).canPublish()).toThrow("Can only publish draft rulesets");
    }
    expect(() => policyOf("Owner", { userId: null }).canPublish()).toThrow("Cannot publish a base ruleset");
  });

  test("canFork: published base rulesets only", () => {
    expect(policyOf("Stranger", { userId: null, rulesetId: null, status: "Published" }).canFork()).toBe(true);
    expect(() => policyOf("Stranger", { userId: null, rulesetId: null }).canFork()).toThrow(
      "Can only fork published rulesets",
    );
    // A system extension, or a user fork: no fork of a fork.
    for (const userId of [null, OWNER]) {
      expect(() => policyOf("Stranger", { userId, status: "Published" }).canFork()).toThrow(
        "Cannot fork a non-base ruleset",
      );
    }
  });

  test("canSubscribeExtension and canUnsubscribeExtension: the owner of a live fork that isn't an extension", () => {
    expectOnly(["Owner"], (p) => p.canSubscribeExtension(), ForbiddenError);
    expect(() => policyOf("Owner", { userId: null }).canSubscribeExtension()).toThrow(ForbiddenError);
    expect(() => policyOf("Owner", { status: "Archived" }).canSubscribeExtension()).toThrow(UnprocessableEntityError);
    expect(() => policyOf("Owner", { rulesetId: null }).canSubscribeExtension()).toThrow(
      "Only forked rulesets can subscribe to extensions",
    );
    expect(() => policyOf("Owner", { kind: "extension" }).canSubscribeExtension()).toThrow(
      "Extensions cannot subscribe to other extensions",
    );

    expect(policyOf("Owner").canUnsubscribeExtension()).toBe(true);
    expect(() => policyOf("Owner").canUnsubscribeExtension({ inUse: true })).toThrow(ConflictError);
    expect(() => policyOf("Admin").canUnsubscribeExtension()).toThrow(ForbiddenError);
  });

  test("canManageContributors: the owner and Admins; Admin contributors themselves only by the owner", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canManageContributors(), ForbiddenError);
    expect(() => policyOf("Owner", { userId: null }).canManageContributors()).toThrow(ForbiddenError);
    expectOnly(["Owner"], (p) => p.canManageAdminContributors(), ForbiddenError);
  });

  test("canUnarchive: the owner, on an archived ruleset", () => {
    expectOnly(["Owner"], (p) => p.canUnarchive(), ForbiddenError, { status: "Archived" });
    expect(() => policyOf("Owner").canUnarchive()).toThrow("Ruleset is not archived");
    expect(() => policyOf("Owner", { userId: null, status: "Archived" }).canUnarchive()).toThrow(ForbiddenError);
  });

  test("canViewChanges: anyone on a public ruleset, the owner and contributors on a private one", () => {
    expectOnly(["Owner", "Admin", "Editor", "Viewer"], (p) => p.canViewChanges(), ForbiddenError);
    expectOnly(ACTORS, (p) => p.canViewChanges(), ForbiddenError, { private: false });
  });

  describe("canCreateCharacter", () => {
    test("allows public published rulesets, and the owner's and contributors' own", async () => {
      expect(await policyOf("Stranger", { private: false, status: "Published" }).canCreateCharacter(db)).toBe(true);
      for (const actor of ["Owner", "Admin", "Editor", "Viewer"] as const) {
        expect(await policyOf(actor).canCreateCharacter(db)).toBe(true);
      }
    });

    test("refuses extensions and archived rulesets", async () => {
      for (const overrides of [{ kind: "extension" as const }, { status: "Archived" as const }]) {
        await expect(policyOf("Owner", overrides).canCreateCharacter(db)).rejects.toThrow(
          "Choose an active playable ruleset",
        );
      }
    });

    test("allows members of a campaign using a private ruleset, and nobody else", async () => {
      const { user: owner } = await createTestUser();
      const ruleset = await createTestRuleset(owner.id);
      const { user: member, session: memberSession } = await createTestUser();
      const { session: strangerSession } = await createTestUser();
      const [campaign] = await Campaigns.create(db, { name: "Private Ruleset Campaign", rulesetId: ruleset.id });
      await Players.create(db, { campaignId: campaign.id, userId: member.id, role: "Player Character" });

      expect(await new RulesetsPolicy(memberSession, ruleset).canCreateCampaign(db)).toBe(true);
      await expect(new RulesetsPolicy(strangerSession, ruleset).canCreateCharacter(db)).rejects.toThrow(ForbiddenError);
    });
  });
});
