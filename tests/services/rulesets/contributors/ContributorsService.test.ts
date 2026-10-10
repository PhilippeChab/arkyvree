import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Contributors, Rulesets } from "@/server/repositories/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new user invited to the ruleset with `role` by `inviterSession`; accepted unless `pending`. */
async function addContributor(
  inviterSession: Parameters<typeof ContributorsService.inviteContributor>[0],
  rulesetId: string,
  role: ContributorRole,
  pending = false,
) {
  const { user, session } = await createTestUser(role.toLowerCase());
  const invite = await ContributorsService.inviteContributor(inviterSession, rulesetId, user.emailAddress, role);
  if (!pending) await ContributorsService.acceptInvite(session, invite.id);
  return { user, session, invite };
}

/** A new user's draft ruleset. */
async function setup() {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  return { owner, ownerSession, ruleset };
}

describe("ContributorsService", () => {
  describe("inviteContributor", () => {
    test("invites a user by email, or an email without an account", async () => {
      const { owner, ownerSession, ruleset } = await setup();
      const { user, invite } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      expect(invite).toMatchObject({
        rulesetId: ruleset.id,
        email: user.emailAddress,
        userId: user.id,
        role: "Editor",
        status: "Pending",
        invitedBy: owner.id,
      });

      const unregistered = await ContributorsService.inviteContributor(
        ownerSession,
        ruleset.id,
        "unregistered@example.com",
        "Viewer",
      );
      expect(unregistered).toMatchObject({
        email: "unregistered@example.com",
        userId: null,
        role: "Viewer",
        status: "Pending",
      });
    });

    test("lets an Admin invite Editors and Viewers but not Admins", async () => {
      const { ownerSession, ruleset } = await setup();
      const { session: admin } = await addContributor(ownerSession, ruleset.id, "Admin");
      const { user: invitee } = await createTestUser("invitee");
      expect(
        (await ContributorsService.inviteContributor(admin, ruleset.id, invitee.emailAddress, "Editor")).role,
      ).toBe("Editor");
      const { user: other } = await createTestUser("other");
      expect(ContributorsService.inviteContributor(admin, ruleset.id, other.emailAddress, "Admin")).rejects.toThrow(
        ForbiddenError,
      );
    });

    test("refuses strangers, the owner's own email, a second invite and an archived ruleset", async () => {
      const { owner, ownerSession, ruleset } = await setup();
      const { session: stranger } = await createTestUser("stranger");
      expect(ContributorsService.inviteContributor(stranger, ruleset.id, "test@example.com", "Editor")).rejects.toThrow(
        ForbiddenError,
      );
      expect(
        ContributorsService.inviteContributor(ownerSession, ruleset.id, owner.emailAddress, "Editor"),
      ).rejects.toThrow(ConflictError);

      const { user } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      expect(
        ContributorsService.inviteContributor(ownerSession, ruleset.id, user.emailAddress, "Viewer"),
      ).rejects.toThrow(ConflictError);

      await Rulesets.archive(db, { id: ruleset.id });
      expect(
        ContributorsService.inviteContributor(ownerSession, ruleset.id, "late@example.com", "Editor"),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("answering an invite", () => {
    test("accepts a pending invite once", async () => {
      const { ownerSession, ruleset } = await setup();
      const { session, invite } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      expect((await ContributorsService.acceptInvite(session, invite.id)).status).toBe("Active");
      expect(ContributorsService.acceptInvite(session, invite.id)).rejects.toThrow(ConflictError);
    });

    test("rejects a pending invite", async () => {
      const { ownerSession, ruleset } = await setup();
      const { session, invite } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      expect((await ContributorsService.rejectInvite(session, invite.id)).status).toBe("Rejected");
    });

    test("refuses another user's invite, and an invite to a ruleset archived since", async () => {
      const { ownerSession, ruleset } = await setup();
      const { session, invite } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      const { session: stranger } = await createTestUser("stranger");
      expect(ContributorsService.acceptInvite(stranger, invite.id)).rejects.toThrow(NotFoundError);

      await Rulesets.archive(db, { id: ruleset.id });
      expect(ContributorsService.acceptInvite(session, invite.id)).rejects.toThrow(ConflictError);
    });
  });

  describe("getInvite", () => {
    test("shows the invitee their invite and its ruleset, whatever became of either", async () => {
      const { ownerSession, ruleset } = await setup();
      const { session, invite } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      const fetch = () => ContributorsService.getInvite(session, invite.id);

      expect(await fetch()).toMatchObject({
        id: invite.id,
        status: "Pending",
        rulesetsInRule: { name: ruleset.name, status: "Draft" },
      });
      // Stale links still resolve, so the page can say what happened.
      await ContributorsService.acceptInvite(session, invite.id);
      expect((await fetch()).status).toBe("Active");
      await ContributorsService.revokeContributor(ownerSession, invite.id);
      expect((await fetch()).status).toBe("Revoked");
      await Rulesets.archive(db, { id: ruleset.id });
      expect((await fetch()).rulesetsInRule?.status).toBe("Archived");
    });

    test("hides the invite from anyone else", async () => {
      const { ownerSession, ruleset } = await setup();
      const { invite } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      const { session: stranger } = await createTestUser("stranger");
      expect(ContributorsService.getInvite(stranger, invite.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("getUserInvites", () => {
    test("lists the invites still waiting for an answer", async () => {
      const { ownerSession, ruleset } = await setup();
      const { user, session, invite } = await addContributor(ownerSession, ruleset.id, "Editor", true);
      expect(await ContributorsService.getUserInvites(user.id)).toMatchObject([
        { rulesetId: ruleset.id, rulesetsInRule: { name: ruleset.name } },
      ]);

      await ContributorsService.acceptInvite(session, invite.id);
      expect(await ContributorsService.getUserInvites(user.id)).toEqual([]);
    });
  });

  describe("getContributors", () => {
    test("lists the contributors to the owner and to contributors, not to strangers", async () => {
      const { ownerSession, ruleset } = await setup();
      const { user, session: viewer } = await addContributor(ownerSession, ruleset.id, "Viewer");
      const list = (session: typeof viewer) =>
        ContributorsService.getContributors(session, ruleset.id, {}, { limit: 10, page: 1 });

      expect((await list(ownerSession)).items.map((c) => c.email)).toEqual([user.emailAddress]);
      expect((await list(viewer)).items).toHaveLength(1);
      const { session: stranger } = await createTestUser("stranger");
      expect(list(stranger)).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateContributorRole", () => {
    test("changes an active contributor's role", async () => {
      const { ownerSession, ruleset } = await setup();
      const { invite } = await addContributor(ownerSession, ruleset.id, "Editor");
      expect((await ContributorsService.updateContributorRole(ownerSession, invite.id, "Viewer")).role).toBe("Viewer");
    });

    test("refuses a pending invite, an archived ruleset, and an Admin promoting to Admin", async () => {
      const { ownerSession, ruleset } = await setup();
      const pending = await addContributor(ownerSession, ruleset.id, "Editor", true);
      expect(ContributorsService.updateContributorRole(ownerSession, pending.invite.id, "Viewer")).rejects.toThrow(
        ConflictError,
      );

      const { session: admin } = await addContributor(ownerSession, ruleset.id, "Admin");
      const editor = await addContributor(ownerSession, ruleset.id, "Editor");
      expect(ContributorsService.updateContributorRole(admin, editor.invite.id, "Admin")).rejects.toThrow(
        ForbiddenError,
      );

      await Rulesets.archive(db, { id: ruleset.id });
      expect(ContributorsService.updateContributorRole(ownerSession, editor.invite.id, "Viewer")).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe("revokeContributor", () => {
    test("lets the owner revoke anyone, Admins included", async () => {
      const { ownerSession, ruleset } = await setup();
      for (const role of ["Editor", "Admin"] as const) {
        const { invite } = await addContributor(ownerSession, ruleset.id, role);
        expect((await ContributorsService.revokeContributor(ownerSession, invite.id)).status).toBe("Revoked");
      }
    });

    test("refuses an Admin revoking another Admin", async () => {
      const { ownerSession, ruleset } = await setup();
      const { session: admin } = await addContributor(ownerSession, ruleset.id, "Admin");
      const other = await addContributor(ownerSession, ruleset.id, "Admin");
      expect(ContributorsService.revokeContributor(admin, other.invite.id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe("leaveRuleset", () => {
    test("lets a contributor leave, and nobody else", async () => {
      const { ownerSession, ruleset } = await setup();
      const { session } = await addContributor(ownerSession, ruleset.id, "Editor");
      expect((await ContributorsService.leaveRuleset(session, ruleset.id)).status).toBe("Revoked");

      const { session: stranger } = await createTestUser("stranger");
      expect(ContributorsService.leaveRuleset(stranger, ruleset.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("Contributors.findRole", () => {
    test("is the role of an active contributor, and null for anyone else", async () => {
      const { ownerSession, ruleset } = await setup();
      const { user } = await addContributor(ownerSession, ruleset.id, "Editor");
      const { user: stranger } = await createTestUser("stranger");
      expect(await Contributors.findRole(db, { userId: user.id, rulesetId: ruleset.id })).toBe("Editor");
      expect(await Contributors.findRole(db, { userId: stranger.id, rulesetId: ruleset.id })).toBeUndefined();
    });
  });
});
