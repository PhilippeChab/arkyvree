import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Campaigns, Players } from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { Ruleset } from "@/shared/relations.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

type Actor = "Owner" | ContributorRole | "Stranger";

const ACTORS: Actor[] = ["Owner", "Admin", "Editor", "Viewer", "Stranger"];
/** An orphaned ruleset: its owner's account deleted, its contributors kept. */
const ORPHANED: Partial<Ruleset> = { userId: null };
const OTHER = "other-id";
const OWNER = "owner-id";
/** A system ruleset: nobody owns it. */
const SYSTEM: Partial<Ruleset> = { userId: null, system: true };

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

/** The policy `actor` gets on a draft fork owned by OWNER, adjusted by `overrides`. */
function policyOf(actor: Actor, overrides: Partial<Ruleset> = {}) {
  const role: ContributorRole | undefined = actor === "Owner" || actor === "Stranger" ? undefined : actor;
  return new RulesetsPolicy(makeSession(actor === "Owner" ? OWNER : OTHER), rulesetOf(overrides), role);
}

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
    ...overrides,
  };
}

describe("RulesetsPolicy", () => {
  test("canUpdate: the owner and Admin contributors, on a ruleset that isn't archived", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canUpdate(), ForbiddenError);
    expectOnly(["Owner", "Admin"], (p) => p.canUpdate(), ForbiddenError, { status: "Published" });
    expect(() => policyOf("Owner", { status: "Archived" }).canUpdate()).toThrow("Archived rulesets are read-only");
    expect(() => policyOf("Admin", { status: "Archived" }).canUpdate()).toThrow(UnprocessableEntityError);
    expect(() => policyOf("Owner", SYSTEM).canUpdate()).toThrow("Cannot edit a base ruleset");
    // A private ruleset becomes public, a public one stays so
    expect(policyOf("Owner").canUpdate({ private: false })).toBe(true);
    expect(policyOf("Owner", { private: false }).canUpdate({ private: false })).toBe(true);
    expect(() => policyOf("Owner", { private: false }).canUpdate({ private: true })).toThrow(
      "Cannot make a public ruleset private",
    );
  });

  test("refuses every change to a ruleset nobody owns: a system one, and an orphaned one, frozen as it was left", () => {
    const changes: [string, (p: RulesetsPolicy) => unknown][] = [
      ["edit", (p) => p.canUpdate()],
      ["edit", (p) => p.canUpdateEntity()],
      ["edit", (p) => p.canDeleteEntity()],
      ["publish", (p) => p.canPublish()],
      ["manage contributors on", (p) => p.canManageContributors()],
      ["manage contributors on", (p) => p.canInviteContributors()],
      ["manage contributors on", (p) => p.canRevokeContributor({ role: "Viewer", status: "Active" })],
      ["manage contributors on", (p) => p.canUpdateContributorRole()],
      ["subscribe to extensions on", (p) => p.canSubscribeExtension({ usedAsExtension: false })],
      ["subscribe to extensions on", (p) => p.canUnsubscribeExtension()],
    ];
    for (const [what, check] of changes) {
      expect(() => check(policyOf("Admin", SYSTEM))).toThrow(`Cannot ${what} a base ruleset`);
      for (const actor of ["Admin", "Editor"] as const)
        expect(() => check(policyOf(actor, ORPHANED))).toThrow(`Cannot ${what} a ruleset without an owner`);
    }
    expect(() => policyOf("Admin", { ...ORPHANED, status: "Archived" }).canUnarchive()).toThrow(
      "Cannot unarchive a ruleset without an owner",
    );
    // Its contributors still read it, see its changes and contributors, and build on it
    expect(policyOf("Viewer", ORPHANED).canRead()).toBe(true);
    expect(policyOf("Viewer", ORPHANED).canReadContributors()).toBe(true);
    expect(policyOf("Viewer", ORPHANED).canCreateCharacter()).toBe(true);
  });

  test("canUpdateEntity and canDeleteEntity: the owner, Admins and Editors", () => {
    expectOnly(["Owner", "Admin", "Editor"], (p) => p.canUpdateEntity(), ForbiddenError);
    expectOnly(["Owner", "Admin", "Editor"], (p) => p.canDeleteEntity(), ForbiddenError);
    expectOnly(["Owner", "Admin", "Editor"], (p) => p.canDeleteEntity(), ForbiddenError, { status: "Published" });
    for (const check of [(p: RulesetsPolicy) => p.canUpdateEntity(), (p: RulesetsPolicy) => p.canDeleteEntity()]) {
      expect(() => check(policyOf("Editor", { status: "Archived" }))).toThrow(UnprocessableEntityError);
      expect(() => check(policyOf("Owner", SYSTEM))).toThrow("Cannot edit a base ruleset");
    }
  });

  test("canDeleteEntity refuses an entity characters use", () => {
    expect(() => policyOf("Owner").canDeleteEntity({ inUse: true })).toThrow(ConflictError);
  });

  test("canPublish: the owner, on a draft", () => {
    expectOnly(["Owner"], (p) => p.canPublish(), ForbiddenError);
    for (const status of ["Published", "Archived"] as const)
      expect(() => policyOf("Owner", { status }).canPublish()).toThrow("Can only publish draft rulesets");

    expect(() => policyOf("Owner", SYSTEM).canPublish()).toThrow("Cannot publish a base ruleset");
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
    expectOnly(["Owner"], (p) => p.canSubscribeExtension({ usedAsExtension: false }), ForbiddenError);
    expect(() => policyOf("Owner", SYSTEM).canSubscribeExtension({ usedAsExtension: false })).toThrow(ForbiddenError);
    expect(() => policyOf("Owner", { status: "Archived" }).canSubscribeExtension({ usedAsExtension: false })).toThrow(
      UnprocessableEntityError,
    );
    expect(() => policyOf("Owner", { rulesetId: null }).canSubscribeExtension({ usedAsExtension: false })).toThrow(
      "Only forked rulesets can subscribe to extensions",
    );
    expect(() => policyOf("Owner", { kind: "extension" }).canSubscribeExtension({ usedAsExtension: false })).toThrow(
      "Extensions cannot subscribe to other extensions",
    );

    // Not while another ruleset subscribes to it, which unsubscribing doesn't ask
    expect(() => policyOf("Owner").canSubscribeExtension({ usedAsExtension: true })).toThrow(
      "Cannot subscribe to extensions while this ruleset is being used as an extension",
    );

    expect(policyOf("Owner").canUnsubscribeExtension()).toBe(true);
    expect(() => policyOf("Owner").canUnsubscribeExtension({ inUse: true })).toThrow(ConflictError);
    expect(() => policyOf("Admin").canUnsubscribeExtension()).toThrow(ForbiddenError);
    expect(() => policyOf("Owner", { status: "Archived" }).canUnsubscribeExtension()).toThrow(UnprocessableEntityError);
  });

  test("canBeSubscribed: a published, public extension of the subscriber's base, whoever asks, never by itself", () => {
    const extension = { kind: "extension" as const, status: "Published" as const, private: false };
    expectOnly(
      ACTORS,
      (p) => p.canBeSubscribed({ id: "subscriber-id", parentId: "base-id" }),
      UnprocessableEntityError,
      extension,
    );
    // A system extension is public whatever its flag says
    expect(
      policyOf("Stranger", { ...extension, ...SYSTEM, private: true }).canBeSubscribed({
        id: "subscriber-id",
        parentId: "base-id",
      }),
    ).toBe(true);
    for (const [overrides, message] of [
      [{ kind: "ruleset" }, "Ruleset is not published as an extension"],
      [{ status: "Draft" }, "Extension must be published"],
      [{ private: true }, "Extension must be public"],
    ] as const) {
      expect(() =>
        policyOf("Owner", { ...extension, ...overrides }).canBeSubscribed({ id: "subscriber-id", parentId: "base-id" }),
      ).toThrow(message);
    }
    expect(() => policyOf("Owner", extension).canBeSubscribed({ id: "subscriber-id", parentId: "other-base" })).toThrow(
      "Extension must share a common ancestor ruleset",
    );
    // Itself, even one read as an extension it would take (its kind changed between the reads)
    expect(() => policyOf("Owner", extension).canBeSubscribed({ id: "ruleset-id", parentId: "base-id" })).toThrow(
      "A ruleset can't subscribe to itself",
    );
  });

  test("canStar: a public base or extension, whoever asks", () => {
    const published = { status: "Published" as const, private: false };
    expectOnly(ACTORS, (p) => p.canStar(), ForbiddenError, { ...published, rulesetId: null });
    expectOnly(ACTORS, (p) => p.canStar(), ForbiddenError, { ...published, kind: "extension" });
    // A fork for play, a draft base and a private base are no bookmarks
    for (const overrides of [
      published,
      { ...published, rulesetId: null, status: "Draft" as const },
      { ...published, rulesetId: null, private: true },
    ])
      expect(() => policyOf("Owner", overrides).canStar()).toThrow("Only base rulesets and extensions can be starred");
  });

  test("canAcceptInvite: a ruleset that isn't archived, whoever asks", () => {
    expectOnly(ACTORS, (p) => p.canAcceptInvite(), ConflictError);
    expect(() => policyOf("Stranger", { status: "Archived" }).canAcceptInvite()).toThrow(ConflictError);
  });

  test("canBeExtension: a fork that subscribes to none, whoever asks", () => {
    expectOnly(ACTORS, (p) => p.canBeExtension({ hasExtensions: false }), UnprocessableEntityError);
    expect(() => policyOf("Owner", { rulesetId: null }).canBeExtension({ hasExtensions: false })).toThrow(
      "Only forks can be published as extensions",
    );
    expect(() => policyOf("Owner").canBeExtension({ hasExtensions: true })).toThrow(
      "A ruleset that subscribes to extensions cannot itself be an extension",
    );
  });

  test("canInviteContributors: who manages contributors, on a ruleset that isn't archived; an Admin, the owner", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canInviteContributors(), ForbiddenError);
    expectOnly(["Owner", "Admin"], (p) => p.canInviteContributors({ role: "Editor" }), ForbiddenError);
    expectOnly(["Owner"], (p) => p.canInviteContributors({ role: "Admin" }), ForbiddenError);
    expect(() => policyOf("Owner", SYSTEM).canInviteContributors()).toThrow(ForbiddenError);
    expect(() => policyOf("Owner", { status: "Archived" }).canInviteContributors()).toThrow(ConflictError);
  });

  test("canManageContributors: the owner and Admins; Admin contributors themselves only by the owner", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canManageContributors(), ForbiddenError);
    expect(() => policyOf("Owner", SYSTEM).canManageContributors()).toThrow(ForbiddenError);
    expectOnly(["Owner"], (p) => p.canManageAdminContributors(), ForbiddenError);
  });

  test("canRevokeContributor: who manages contributors, archived or not; an Admin, the owner; one who contributes or is invited", () => {
    for (const status of ["Draft", "Archived"] as const) {
      expectOnly(
        ["Owner", "Admin"],
        (p) => p.canRevokeContributor({ role: "Editor", status: "Active" }),
        ForbiddenError,
        { status },
      );
      expectOnly(["Owner"], (p) => p.canRevokeContributor({ role: "Admin", status: "Active" }), ForbiddenError, {
        status,
      });
    }
    // A revoked or rejected contributor is gone already
    expect(policyOf("Owner").canRevokeContributor({ role: "Editor", status: "Pending" })).toBe(true);
    for (const status of ["Revoked", "Rejected"])
      expect(() => policyOf("Owner").canRevokeContributor({ role: "Editor", status })).toThrow(ConflictError);
  });

  test("canUpdateContributorRole: who manages contributors, on a ruleset that isn't archived; to or from Admin, the owner", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canUpdateContributorRole(), ForbiddenError);
    expectOnly(["Owner", "Admin"], (p) => p.canUpdateContributorRole({ from: "Editor", to: "Viewer" }), ForbiddenError);
    expectOnly(["Owner"], (p) => p.canUpdateContributorRole({ from: "Editor", to: "Admin" }), ForbiddenError);
    expectOnly(["Owner"], (p) => p.canUpdateContributorRole({ from: "Admin", to: "Viewer" }), ForbiddenError);
    expect(() => policyOf("Owner", { status: "Archived" }).canUpdateContributorRole()).toThrow(
      "Cannot modify roles on an archived ruleset",
    );
    // An invite's role is its invite's
    expect(() =>
      policyOf("Owner").canUpdateContributorRole({ from: "Editor", status: "Pending", to: "Viewer" }),
    ).toThrow("Can only update role of active contributors");
  });

  test("canUnarchive: the owner, on an archived ruleset", () => {
    expectOnly(["Owner"], (p) => p.canUnarchive(), ForbiddenError, { status: "Archived" });
    expect(() => policyOf("Owner").canUnarchive()).toThrow("Ruleset is not archived");
    expect(() => policyOf("Owner", { ...SYSTEM, status: "Archived" }).canUnarchive()).toThrow(ForbiddenError);
  });

  test("canRead: anyone, a ruleset that isn't private; a private one, its members and its characters' editors", () => {
    expectOnly(["Owner", "Admin", "Editor", "Viewer"], (p) => p.canRead(), NotFoundError);
    expectOnly(ACTORS, (p) => p.canRead(), NotFoundError, { private: false });
    expect(policyOf("Stranger").isReadable()).toBe(false);

    const stranger = makeSession(OTHER);
    expect(new RulesetsPolicy(stranger, rulesetOf(), undefined, { isCampaignPlayer: true }).canRead()).toBe(true);
    // A member of a campaign archived or not reads it, and creates on it only from a live seat in a live campaign
    const member = new RulesetsPolicy(stranger, rulesetOf(), undefined, { isCampaignMember: true });
    expect(member.canRead()).toBe(true);
    expect(() => member.canCreateCharacter()).toThrow(ForbiddenError);
    expect(new RulesetsPolicy(stranger, rulesetOf(), undefined, { isCharacterEditor: true }).canRead()).toBe(true);
  });

  test("canViewChanges: anyone on a public ruleset, the owner and contributors on a private one", () => {
    expectOnly(["Owner", "Admin", "Editor", "Viewer"], (p) => p.canViewChanges(), ForbiddenError);
    expectOnly(ACTORS, (p) => p.canViewChanges(), ForbiddenError, { private: false });
  });

  describe("canCreateCharacter", () => {
    test("allows public published rulesets, and the owner's and contributors' own", () => {
      expect(policyOf("Stranger", { private: false, status: "Published" }).canCreateCharacter()).toBe(true);
      for (const actor of ["Owner", "Admin", "Editor", "Viewer"] as const)
        expect(policyOf(actor).canCreateCharacter()).toBe(true);
    });

    test("refuses extensions and archived rulesets", () => {
      for (const overrides of [{ kind: "extension" as const }, { status: "Archived" as const }])
        expect(() => policyOf("Owner", overrides).canCreateCharacter()).toThrow("Choose an active playable ruleset");
    });

    test("allows members of a campaign using a private ruleset, and nobody else", async () => {
      const { user: owner } = await createTestUser();
      const ruleset = await createTestRuleset(owner.id);
      const { user: member, session: memberSession } = await createTestUser();
      const { session: strangerSession } = await createTestUser();
      const [campaign] = await Campaigns.create(db, { name: "Private Ruleset Campaign", rulesetId: ruleset.id });
      await Players.create(db, { campaignId: campaign.id, userId: member.id, role: "Player Character" });

      expect((await RulesetsPolicy.for(db, memberSession, ruleset)).canCreateCampaign()).toBe(true);
      const stranger = await RulesetsPolicy.for(db, strangerSession, ruleset);
      expect(() => stranger.canCreateCharacter()).toThrow(ForbiddenError);
    });
  });
});
