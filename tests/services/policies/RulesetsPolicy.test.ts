import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Campaigns, Contributors, Players } from "@/server/repositories/index.ts";
import { isAllowed, RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import type { Ruleset } from "@/shared/relations.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { measure } from "@/tests/support/database.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { thrownBy } from "@/tests/support/errors.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

type Actor = "Owner" | ContributorRole | "Stranger";

const ACTORS: Actor[] = ["Owner", "Admin", "Editor", "Viewer", "Stranger"];
/** A publish as a playable ruleset of one that subscribes to no extension, and that no ruleset subscribes to. */
const AS_RULESET = { hasExtensions: false, kind: "ruleset", usedAsExtension: false } as const;
/** An orphaned ruleset: its owner's account deleted, its contributors kept. */
const ORPHANED: Partial<Ruleset> = { userId: null };
const OTHER = "other-id";
const OWNER = "owner-id";
/** A fork subscribing to an extension, which subscribes to none yet. */
const SUBSCRIBER = { extensionIds: [] as string[], id: "subscriber-id" };
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
    expect(() => policyOf("Owner", { status: "Archived" }).canUpdate()).toThrow("This ruleset is archived");
    expect(thrownBy(() => policyOf("Admin", { status: "Archived" }).canUpdate())).toEqual(
      new ConflictError("This ruleset is archived"),
    );
    expect(() => policyOf("Owner", SYSTEM).canUpdate()).toThrow("Cannot edit a base ruleset");
    // A private ruleset becomes public, a public one stays so
    expect(policyOf("Owner").canUpdate({ private: false })).toBe(true);
    expect(policyOf("Owner", { private: false }).canUpdate({ private: false })).toBe(true);
    expect(thrownBy(() => policyOf("Owner", { private: false }).canUpdate({ private: true }))).toEqual(
      new ConflictError("Cannot make a public ruleset private"),
    );
  });

  test("refuses every change to a ruleset nobody owns: a system one, and an orphaned one, frozen as it was left", () => {
    const changes: [string, (p: RulesetsPolicy) => unknown][] = [
      ["edit", (p) => p.canUpdate()],
      ["edit", (p) => p.canUpdateEntity()],
      ["edit", (p) => p.canDeleteEntity()],
      ["publish", (p) => p.canPublish(AS_RULESET)],
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
      expect(thrownBy(() => check(policyOf("Editor", { status: "Archived" })))).toEqual(
        new ConflictError("This ruleset is archived"),
      );
      expect(() => check(policyOf("Owner", SYSTEM))).toThrow("Cannot edit a base ruleset");
    }
  });

  test("canDeleteEntity refuses an entity characters use", () => {
    expect(thrownBy(() => policyOf("Owner").canDeleteEntity({ inUse: true }))).toEqual(
      new ConflictError("Cannot delete entities from a ruleset in use by characters"),
    );
  });

  test("canPublish: the owner, on a draft", () => {
    expectOnly(["Owner"], (p) => p.canPublish(AS_RULESET), ForbiddenError);
    for (const status of ["Published", "Archived"] as const)
      expect(() => policyOf("Owner", { status }).canPublish(AS_RULESET)).toThrow("Can only publish draft rulesets");

    expect(() => policyOf("Owner", SYSTEM).canPublish(AS_RULESET)).toThrow("Cannot publish a base ruleset");
  });

  test("refuses a demo its ruleset's publishing and its contributors' management, not its edits", () => {
    const demo = new RulesetsPolicy({ ...makeSession(OWNER), isDemo: true }, rulesetOf());
    const signUp = new ForbiddenError("Sign up to use this feature");
    for (const check of ["canManageContributors", "canInviteContributors", "canUpdateContributorRole"] as const)
      expect(thrownBy(() => demo[check]())).toEqual(signUp);
    expect(thrownBy(() => demo.canPublish(AS_RULESET))).toEqual(signUp);
    expect(thrownBy(() => demo.canRevokeContributor({ role: "Editor", status: "Active" }))).toEqual(signUp);
    expect([demo.canUpdate(), demo.canReadContributors()]).toEqual([true, true]);
  });

  test("canFork: published base rulesets only", () => {
    expect(policyOf("Stranger", { userId: null, rulesetId: null, status: "Published" }).canFork()).toBe(true);
    expect(() => policyOf("Stranger", { userId: null, rulesetId: null }).canFork()).toThrow(
      "Can only fork published rulesets",
    );
    // A system extension, or a user fork: no fork of a fork, whatever its state (a 422 on its kind, not a 409).
    for (const userId of [null, OWNER]) {
      for (const status of ["Published", "Draft"] as const) {
        expect(thrownBy(() => policyOf("Stranger", { userId, status }).canFork())).toEqual(
          new UnprocessableEntityError("Cannot fork a non-base ruleset — only base rulesets can be forked"),
        );
      }
    }
  });

  test("who, then kind or another record (422), then state (409): subscribing, publishing, editing, reverting, creating", () => {
    const archived = { status: "Archived" } as const;
    const subscribes = { hasExtensions: true, usedAsExtension: false };
    // Used as an extension, archived: its kind first
    expect(thrownBy(() => policyOf("Owner", archived).canSubscribeExtension({ usedAsExtension: true }))).toEqual(
      new UnprocessableEntityError("Cannot subscribe to extensions while this ruleset is being used as an extension"),
    );
    // Published as an extension it can't be, already published: its kind first, then its state
    const published = policyOf("Owner", { status: "Published" });
    expect(thrownBy(() => published.canPublish({ ...subscribes, kind: "extension" }))).toEqual(
      new UnprocessableEntityError("A ruleset that subscribes to extensions cannot itself be an extension"),
    );
    expect(thrownBy(() => published.canPublish({ ...subscribes, kind: "ruleset" }))).toEqual(
      new ConflictError("Can only publish draft rulesets"),
    );
    // Edited into an extension it can't be, archived: its kind first; who before both
    expect(
      thrownBy(() => policyOf("Owner", archived).canUpdate({ kind: { ...subscribes, kind: "extension" } })),
    ).toEqual(new UnprocessableEntityError("A ruleset that subscribes to extensions cannot itself be an extension"));
    expect(
      thrownBy(() => policyOf("Editor", archived).canUpdate({ kind: { ...subscribes, kind: "extension" } })),
    ).toEqual(new ForbiddenError("Cannot edit another user's ruleset"));
    // A base's change reverted, archived: a base has none (422) before its state; an editor's own, archived, a 409
    expect(thrownBy(() => policyOf("Owner", { ...archived, rulesetId: null }).canRevertChange())).toEqual(
      new UnprocessableEntityError("Only forked rulesets have local changes"),
    );
    expect(thrownBy(() => policyOf("Editor", archived).canRevertChange())).toEqual(
      new ConflictError("This ruleset is archived"),
    );
    expect(thrownBy(() => policyOf("Stranger", { rulesetId: null }).canRevertChange())).toEqual(
      new ForbiddenError("Cannot edit another user's ruleset"),
    );
    // A character on a private archived ruleset: who first; on a public one, whose only refusal is its state, its 422;
    // on a public draft, whom it isn't open to yet, a 403
    expect(thrownBy(() => policyOf("Stranger", archived).canCreateCharacter())).toEqual(
      new ForbiddenError("You do not have access to this ruleset"),
    );
    expect(thrownBy(() => policyOf("Stranger", { ...archived, private: false }).canCreateCharacter())).toEqual(
      new UnprocessableEntityError("Choose an active playable ruleset"),
    );
    expect(thrownBy(() => policyOf("Stranger", { private: false }).canCreateCharacter())).toEqual(
      new ForbiddenError("You do not have access to this ruleset"),
    );
    // The extensions a subscribe names, archived: who and its kind first, then an unknown one's 404 and each one's
    // refusal (other records), then the host's state
    const draft = policyOf("Stranger", { id: "extension-id", kind: "extension", private: false });
    const naming = (policies: (RulesetsPolicy | undefined)[]) => ({
      extensions: { policies, subscribed: [] },
      usedAsExtension: false,
    });
    expect(thrownBy(() => policyOf("Owner", archived).canSubscribeExtension(naming([draft])))).toEqual(
      new UnprocessableEntityError("Extension must be published"),
    );
    expect(thrownBy(() => policyOf("Owner", archived).canSubscribeExtension(naming([undefined])))).toEqual(
      new NotFoundError("Extension not found"),
    );
    expect(thrownBy(() => policyOf("Admin", archived).canSubscribeExtension(naming([undefined])))).toEqual(
      new ForbiddenError("Cannot subscribe to extensions on another user's ruleset"),
    );
    expect(
      thrownBy(() => policyOf("Owner", { ...archived, rulesetId: null }).canSubscribeExtension(naming([draft]))),
    ).toEqual(new UnprocessableEntityError("Only forked rulesets can subscribe to extensions"));
    // An extension it doesn't subscribe to, archived: the extension's 404 before its state
    expect(thrownBy(() => policyOf("Owner", archived).canUnsubscribeExtension({ isSubscribed: false }))).toEqual(
      new NotFoundError("Not subscribed to this extension"),
    );
    // An Admin's role changed by an Admin, archived: who (the owner only) before its state
    expect(
      thrownBy(() => policyOf("Admin", archived).canUpdateContributorRole({ from: "Admin", to: "Editor" })),
    ).toEqual(new ForbiddenError("Only the owner can manage Admin contributors"));
  });

  test("canSubscribeExtension and canUnsubscribeExtension: the owner of a live fork that isn't an extension", () => {
    expectOnly(["Owner"], (p) => p.canSubscribeExtension({ usedAsExtension: false }), ForbiddenError);
    expect(thrownBy(() => policyOf("Owner", SYSTEM).canSubscribeExtension({ usedAsExtension: false }))).toEqual(
      new ForbiddenError("Cannot subscribe to extensions on a base ruleset"),
    );
    expect(
      thrownBy(() => policyOf("Owner", { status: "Archived" }).canSubscribeExtension({ usedAsExtension: false })),
    ).toEqual(new ConflictError("This ruleset is archived"));
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
    expect(thrownBy(() => policyOf("Owner").canUnsubscribeExtension({ inUse: true }))).toEqual(
      new ConflictError("Cannot unsubscribe from extensions on a ruleset in use by characters"),
    );
    expect(thrownBy(() => policyOf("Admin").canUnsubscribeExtension())).toEqual(
      new ForbiddenError("Cannot subscribe to extensions on another user's ruleset"),
    );
    expect(thrownBy(() => policyOf("Owner", { status: "Archived" }).canUnsubscribeExtension())).toEqual(
      new ConflictError("This ruleset is archived"),
    );
    // A base subscribes to none, archived or not: its kind is checked before its state
    expect(
      thrownBy(() =>
        policyOf("Owner", { rulesetId: null, status: "Archived" }).canSubscribeExtension({ usedAsExtension: false }),
      ),
    ).toEqual(new UnprocessableEntityError("Only forked rulesets can subscribe to extensions"));
  });

  test("canBeSubscribed: a published, public extension of the subscriber's base, whoever asks, never by itself", () => {
    const extension = { kind: "extension" as const, status: "Published" as const, private: false };
    expectOnly(
      ACTORS,
      (p) => p.canBeSubscribed({ ...SUBSCRIBER, parentId: "base-id" }),
      UnprocessableEntityError,
      extension,
    );
    // A system extension is public whatever its flag says
    expect(
      policyOf("Stranger", { ...extension, ...SYSTEM, private: true }).canBeSubscribed({
        ...SUBSCRIBER,
        parentId: "base-id",
      }),
    ).toBe(true);
    for (const [overrides, message] of [
      [{ kind: "ruleset" }, "Ruleset is not published as an extension"],
      [{ status: "Draft" }, "Extension must be published"],
      [{ private: true }, "Extension must be public"],
    ] as const) {
      expect(
        thrownBy(() =>
          policyOf("Owner", { ...extension, ...overrides }).canBeSubscribed({ ...SUBSCRIBER, parentId: "base-id" }),
        ),
      ).toEqual(new UnprocessableEntityError(message));
    }
    expect(
      thrownBy(() => policyOf("Owner", extension).canBeSubscribed({ ...SUBSCRIBER, parentId: "other-base" })),
    ).toEqual(new UnprocessableEntityError("Extension must share a common ancestor ruleset"));
    // Itself, even one read as an extension it would take (its kind changed between the reads)
    expect(
      thrownBy(() =>
        policyOf("Owner", extension).canBeSubscribed({ extensionIds: [], id: "ruleset-id", parentId: "base-id" }),
      ),
    ).toEqual(new UnprocessableEntityError("A ruleset can't subscribe to itself"));
    // One the subscriber subscribes to already: a 409 on its subscriptions, after what makes it no extension to take
    expect(
      thrownBy(() =>
        policyOf("Owner", extension).canBeSubscribed({
          ...SUBSCRIBER,
          extensionIds: ["ruleset-id"],
          parentId: "base-id",
        }),
      ),
    ).toEqual(new ConflictError("Already subscribed to this extension"));
    expect(
      thrownBy(() =>
        policyOf("Owner", { ...extension, status: "Draft" }).canBeSubscribed({
          ...SUBSCRIBER,
          extensionIds: ["ruleset-id"],
          parentId: "base-id",
        }),
      ),
    ).toEqual(new UnprocessableEntityError("Extension must be published"));
  });

  test("canStar: a public base or extension, whoever asks", () => {
    const published = { status: "Published" as const, private: false };
    expectOnly(ACTORS, (p) => p.canStar(), ForbiddenError, { ...published, rulesetId: null });
    expectOnly(ACTORS, (p) => p.canStar(), ForbiddenError, { ...published, kind: "extension" });
    // A fork for play is no bookmark, whatever its state; a draft base and a private one aren't, yet
    expect(thrownBy(() => policyOf("Owner", published).canStar())).toEqual(
      new UnprocessableEntityError("Only base rulesets and extensions can be starred"),
    );
    for (const overrides of [
      { ...published, rulesetId: null, status: "Draft" as const },
      { ...published, rulesetId: null, private: true },
    ]) {
      expect(thrownBy(() => policyOf("Owner", overrides).canStar())).toEqual(
        new ConflictError("Only public published rulesets can be starred"),
      );
    }
  });

  test("canAcceptInvite: a ruleset that isn't archived, whoever asks", () => {
    expectOnly(ACTORS, (p) => p.canAcceptInvite({ status: "Pending" }), ConflictError);
    expect(thrownBy(() => policyOf("Stranger", { status: "Archived" }).canAcceptInvite({ status: "Pending" }))).toEqual(
      new ConflictError("This ruleset is archived"),
    );
    // An answered or revoked invite is refused before its ruleset's state
    for (const status of ["Active", "Rejected", "Revoked"]) {
      expect(thrownBy(() => policyOf("Stranger", { status: "Archived" }).canAcceptInvite({ status }))).toEqual(
        new ConflictError("Invite is no longer pending"),
      );
    }
  });

  test("refuses an archived ruleset in one wording: an invite's accept, an edit, an archive, an entity's edit, a revert", () => {
    const archived = { status: "Archived" } as const;
    const refusal = new ConflictError("This ruleset is archived");

    expect(thrownBy(() => policyOf("Stranger", archived).canAcceptInvite({ status: "Pending" }))).toEqual(refusal);
    // Its edit and its archive both ask canUpdate
    for (const check of [
      (p: RulesetsPolicy) => p.canUpdate(),
      (p: RulesetsPolicy) => p.canUpdateEntity(),
      (p: RulesetsPolicy) => p.canRevertChange(),
    ])
      expect(thrownBy(() => check(policyOf("Owner", archived)))).toEqual(refusal);
  });

  test("canChangeKind: anything but an extension a ruleset subscribes to, whoever asks", () => {
    expectOnly(ACTORS, (p) => p.canChangeKind({ usedAsExtension: true }), UnprocessableEntityError);
    expectOnly(ACTORS, (p) => p.canChangeKind({ usedAsExtension: false }), UnprocessableEntityError, {
      kind: "extension",
    });
    expect(thrownBy(() => policyOf("Owner", { kind: "extension" }).canChangeKind({ usedAsExtension: true }))).toEqual(
      new UnprocessableEntityError("Cannot change the kind of an extension other rulesets subscribe to"),
    );
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

  test("the kind a publish or an edit leaves it in: one check on what the write read, the kind changed or not", () => {
    const free = { hasExtensions: false, usedAsExtension: false };
    // A fork that subscribes to no extension takes either kind, whoever asks (`canTakeKind`)
    for (const kind of ["ruleset", "extension"] as const)
      expectOnly(ACTORS, (p) => p.canTakeKind({ ...free, kind }), UnprocessableEntityError);
    // An extension other rulesets subscribe to keeps its kind; a base is no extension
    const used = { ...free, usedAsExtension: true };
    expect(policyOf("Stranger", { kind: "extension" }).canTakeKind({ ...used, kind: "extension" })).toBe(true);
    expect(
      thrownBy(() => policyOf("Stranger", { kind: "extension" }).canTakeKind({ ...used, kind: "ruleset" })),
    ).toEqual(new UnprocessableEntityError("Cannot change the kind of an extension other rulesets subscribe to"));
    expect(
      thrownBy(() => policyOf("Stranger", { rulesetId: null }).canTakeKind({ ...free, kind: "extension" })),
    ).toEqual(new UnprocessableEntityError("Only forks can be published as extensions"));
    // An extension read as subscribing to extensions: neither its publish nor its edit leaves it one
    const extension = policyOf("Owner", { kind: "extension" });
    const subscribes = { hasExtensions: true, kind: "extension", usedAsExtension: false } as const;
    const refusal = new UnprocessableEntityError(
      "A ruleset that subscribes to extensions cannot itself be an extension",
    );
    expect(thrownBy(() => extension.canPublish(subscribes))).toEqual(refusal);
    expect(thrownBy(() => extension.canUpdate({ kind: subscribes }))).toEqual(refusal);
  });

  test("canLeave: an active contributor alone; its owner and a stranger contribute as no one", () => {
    expectOnly(["Admin", "Editor", "Viewer"], (p) => p.canLeave(), NotFoundError);
  });

  test("canInviteContributors: who manages contributors, on a ruleset that isn't archived; an Admin, the owner", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canInviteContributors(), ForbiddenError);
    expectOnly(["Owner", "Admin"], (p) => p.canInviteContributors({ role: "Editor" }), ForbiddenError);
    expectOnly(["Owner"], (p) => p.canInviteContributors({ role: "Admin" }), ForbiddenError);
    expect(thrownBy(() => policyOf("Owner", SYSTEM).canInviteContributors())).toEqual(
      new ForbiddenError("Cannot manage contributors on a base ruleset"),
    );
    expect(thrownBy(() => policyOf("Owner", { status: "Archived" }).canInviteContributors())).toEqual(
      new ConflictError("This ruleset is archived"),
    );
    // Its owner contributes as no one: a 422, before the ruleset's state, after who's asking
    const owner = { id: OWNER };
    for (const status of ["Draft", "Archived"] as const) {
      expect(thrownBy(() => policyOf("Admin", { status }).canInviteContributors({ invitee: owner }))).toEqual(
        new UnprocessableEntityError("Cannot invite the ruleset owner as a contributor"),
      );
    }
    expect(thrownBy(() => policyOf("Editor").canInviteContributors({ invitee: owner }))).toEqual(
      new ForbiddenError("Only the owner or Admin contributors can manage contributors"),
    );
    expect(policyOf("Owner").canInviteContributors({ invitee: { id: OTHER } })).toBe(true);
  });

  test("canManageContributors: the owner and Admins; Admin contributors themselves only by the owner", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canManageContributors(), ForbiddenError);
    expect(thrownBy(() => policyOf("Owner", SYSTEM).canManageContributors())).toEqual(
      new ForbiddenError("Cannot manage contributors on a base ruleset"),
    );
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
    for (const status of ["Revoked", "Rejected"]) {
      expect(thrownBy(() => policyOf("Owner").canRevokeContributor({ role: "Editor", status }))).toEqual(
        new ConflictError("Contributor is not active or pending"),
      );
    }
  });

  test("canUpdateContributorRole: who manages contributors, and to or from Admin the owner, on a ruleset that isn't archived", () => {
    expectOnly(["Owner", "Admin"], (p) => p.canUpdateContributorRole(), ForbiddenError);
    expectOnly(["Owner", "Admin"], (p) => p.canUpdateContributorRole({ from: "Editor", to: "Viewer" }), ForbiddenError);
    expectOnly(["Owner"], (p) => p.canUpdateContributorRole({ from: "Editor", to: "Admin" }), ForbiddenError);
    expectOnly(["Owner"], (p) => p.canUpdateContributorRole({ from: "Admin", to: "Viewer" }), ForbiddenError);
    expect(() => policyOf("Owner", { status: "Archived" }).canUpdateContributorRole()).toThrow(
      "This ruleset is archived",
    );
    // An invite's role is its invite's
    expect(() =>
      policyOf("Owner").canUpdateContributorRole({ from: "Editor", status: "Pending", to: "Viewer" }),
    ).toThrow("Can only update role of active contributors");
  });

  test("canUnarchive: the owner, on an archived ruleset", () => {
    expectOnly(["Owner"], (p) => p.canUnarchive(), ForbiddenError, { status: "Archived" });
    expect(() => policyOf("Owner").canUnarchive()).toThrow("Ruleset is not archived");
    expect(thrownBy(() => policyOf("Owner", { ...SYSTEM, status: "Archived" }).canUnarchive())).toEqual(
      new ForbiddenError("Cannot unarchive a base ruleset"),
    );
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
    expect(thrownBy(() => member.canCreateCharacter())).toEqual(
      new ForbiddenError("You do not have access to this ruleset"),
    );
    expect(new RulesetsPolicy(stranger, rulesetOf(), undefined, { isCharacterEditor: true }).canRead()).toBe(true);
  });

  test("canViewChanges: anyone on a public ruleset, the owner and contributors on a private one", () => {
    expectOnly(["Owner", "Admin", "Editor", "Viewer"], (p) => p.canViewChanges(), ForbiddenError);
    expectOnly(ACTORS, (p) => p.canViewChanges(), ForbiddenError, { private: false });
    // A base inherits nothing: no one views its changes, whatever its state, after who's asking
    for (const status of ["Draft", "Published"] as const) {
      expect(thrownBy(() => policyOf("Owner", { rulesetId: null, status }).canViewChanges())).toEqual(
        new UnprocessableEntityError("Only forked rulesets have local changes"),
      );
    }
    expect(thrownBy(() => policyOf("Stranger", { rulesetId: null }).canViewChanges())).toEqual(
      new ForbiddenError("Only the owner or contributors can view overrides"),
    );
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
      expect(thrownBy(() => stranger.canCreateCharacter())).toEqual(
        new ForbiddenError("You do not have access to this ruleset"),
      );
    });
  });

  test("forMany: a page's policies, each standing read once for the page", async () => {
    const { user: owner } = await createTestUser("owner");
    const { user, session } = await createTestUser();
    const seatIn = async (rulesetId: string, archived: boolean) => {
      const [campaign] = await Campaigns.create(db, { name: "Seated", rulesetId });
      await Players.create(db, { campaignId: campaign.id, role: "Player Character", userId: user.id });
      if (archived) await Campaigns.archive(db, { id: campaign.id });
    };
    const owned = await createTestRuleset(user.id);
    const open = await createTestRuleset(owner.id, { private: false, status: "Published" });
    const contributed = await createTestRuleset(owner.id);
    await addRulesetContributor(contributed.id, user, owner.id, "Viewer");
    const invited = await createTestRuleset(owner.id);
    await Contributors.create(db, {
      email: user.emailAddress,
      invitedBy: owner.id,
      role: "Editor",
      rulesetId: invited.id,
      userId: user.id,
    });
    // An orphaned ruleset keeps its contributors; a system one has none, whatever its rows say
    const orphaned = await createTestRuleset(null, { system: false });
    await addRulesetContributor(orphaned.id, user, owner.id);
    const system = await createTestRuleset(null);
    await addRulesetContributor(system.id, user, owner.id, "Admin");
    const seated = await createTestRuleset(owner.id);
    await seatIn(seated.id, false);
    const archivedSeat = await createTestRuleset(owner.id);
    await seatIn(archivedSeat.id, true);
    const edited = await createTestRuleset(owner.id);
    await createTestCharacter(user.id, { rulesetId: edited.id });
    const stranger = await createTestRuleset(owner.id);
    const page = [owned, open, contributed, invited, orphaned, system, seated, archivedSeat, edited, stranger];

    const { result: policies, timing } = await measure(() => RulesetsPolicy.forMany(db, session, page));
    // Its role, whether it reads it, and whether it creates a character on it
    expect(
      page.map(({ id }) => {
        const policy = policies.get(id)!;
        return [policy.contributorRole, policy.isReadable(), isAllowed(() => policy.canCreateCharacter())];
      }),
    ).toEqual([
      [undefined, true, true],
      [undefined, true, true],
      ["Viewer", true, true],
      // An invite gives nothing until it's accepted
      [undefined, false, false],
      ["Editor", true, true],
      [undefined, false, false],
      [undefined, true, true],
      // A seat in an archived campaign reads it alone, as a character's editor does
      [undefined, true, false],
      [undefined, true, false],
      [undefined, false, false],
    ]);
    // Its contributions, its seats and its characters' editors: a query each, whatever the page's size
    expect(timing.queryCount).toBe(3);

    // A public ruleset reads as one whatever its seats, which aren't read: its contributions alone are
    const openSeated = await createTestRuleset(owner.id, { private: false, status: "Published" });
    await seatIn(openSeated.id, false);
    const { result: open1, timing: openTiming } = await measure(() =>
      RulesetsPolicy.forMany(db, session, [openSeated]),
    );
    const openPolicy = open1.get(openSeated.id)!;
    expect([openPolicy.isReadable(), isAllowed(() => openPolicy.canCreateCharacter())]).toEqual([true, true]);
    expect(openTiming.queryCount).toBe(1);
  });
});
