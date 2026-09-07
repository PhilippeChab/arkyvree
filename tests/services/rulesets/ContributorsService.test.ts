import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Contributors, Rulesets, Users } from "@/server/repositories/index.ts";
import { ContributorsMethods } from "@/server/services/rulesets/ContributorsService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("ContributorsService", () => {
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

  async function createTestUser(prefix = "contrib") {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const users = await Users.create(db, {
      username: `${prefix}-${uniqueId}`,
      emailAddress: `${prefix}-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];
    return { user, session: createTestSession(user.id) };
  }

  async function createTestRuleset(userId: string, options: { status?: "Draft" | "Published" | "Archived" } = {}) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset description",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId,
      status: options.status || "Draft",
    });
    return rulesets[0];
  }

  describe("inviteContributor", () => {
    test("should invite a contributor by email", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const contributor = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );

      expect(contributor.rulesetId).toBe(ruleset.id);
      expect(contributor.email).toBe(invitee.emailAddress);
      expect(contributor.role).toBe("Editor");
      expect(contributor.status).toBe("Pending");
      expect(contributor.invitedBy).toBe(owner.id);
      expect(contributor.userId).toBe(invitee.id);
    });

    test("should invite by email for unregistered user", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const ruleset = await createTestRuleset(owner.id);

      const contributor = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, "unregistered@example.com", "Viewer",
      );

      expect(contributor.email).toBe("unregistered@example.com");
      expect(contributor.userId).toBeNull();
      expect(contributor.role).toBe("Viewer");
      expect(contributor.status).toBe("Pending");
    });

    test("should throw ForbiddenError when non-owner/admin invites", async () => {
      const { user: owner } = await createTestUser("owner");
      const { session: otherSession } = await createTestUser("other");
      const ruleset = await createTestRuleset(owner.id);

      await expect(
        ContributorsMethods.inviteContributor(otherSession, ruleset.id, "test@example.com", "Editor"),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ConflictError when inviting the owner", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const ruleset = await createTestRuleset(owner.id);

      await expect(
        ContributorsMethods.inviteContributor(ownerSession, ruleset.id, owner.emailAddress, "Editor"),
      ).rejects.toThrow(ConflictError);
    });

    test("should throw ConflictError when user already has a pending invite", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Editor");

      await expect(
        ContributorsMethods.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Viewer"),
      ).rejects.toThrow(ConflictError);
    });

    test("should throw ForbiddenError when non-owner assigns Admin role", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: admin, session: adminSession } = await createTestUser("admin");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      // Make admin a contributor
      await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, admin.emailAddress, "Admin");
      await ContributorsMethods.acceptContributorInvite(adminSession, (await Contributors.findOne(db, { rulesetId: ruleset.id, userId: admin.id, status: "Pending" }))!.id);

      await expect(
        ContributorsMethods.inviteContributor(adminSession, ruleset.id, invitee.emailAddress, "Admin"),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should allow Admin to invite Editor/Viewer", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: admin, session: adminSession } = await createTestUser("admin");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, admin.emailAddress, "Admin");
      await ContributorsMethods.acceptContributorInvite(adminSession, (await Contributors.findOne(db, { rulesetId: ruleset.id, userId: admin.id, status: "Pending" }))!.id);

      const contributor = await ContributorsMethods.inviteContributor(
        adminSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      expect(contributor.role).toBe("Editor");
    });

    test("should throw ConflictError when ruleset is archived", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id, { status: "Archived" });

      await expect(
        ContributorsMethods.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Editor"),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("acceptContributorInvite", () => {
    test("should accept a pending invite", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );

      const accepted = await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);
      expect(accepted.status).toBe("Active");
    });

    test("should throw NotFoundError when accepting another user's invite", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const { session: otherSession } = await createTestUser("other");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );

      await expect(
        ContributorsMethods.acceptContributorInvite(otherSession, invite.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ConflictError when accepting an already accepted invite", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      await expect(
        ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id),
      ).rejects.toThrow(ConflictError);
    });

    test("should throw ConflictError when ruleset has been archived after invite", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await Rulesets.archive(db, { id: ruleset.id });

      await expect(
        ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("updateContributorRole", () => {
    test("should throw ConflictError when ruleset is archived", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);
      await Rulesets.archive(db, { id: ruleset.id });

      await expect(
        ContributorsMethods.updateContributorRole(ownerSession, invite.id, "Viewer"),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("getContributorInvite", () => {
    test("should return Pending invite for the right user", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );

      const fetched = await ContributorsMethods.getContributorInvite(inviteeSession, invite.id);
      expect(fetched.id).toBe(invite.id);
      expect(fetched.status).toBe("Pending");
      expect(fetched.rulesetsInRule?.name).toBe(ruleset.name);
      expect(fetched.rulesetsInRule?.status).toBe("Draft");
    });

    test("should return Active invite for the right user (stale 'Already accepted' link)", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const fetched = await ContributorsMethods.getContributorInvite(inviteeSession, invite.id);
      expect(fetched.id).toBe(invite.id);
      expect(fetched.status).toBe("Active");
    });

    test("should return Revoked invite for the right user (stale 'Revoked' link)", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);
      await ContributorsMethods.revokeContributor(ownerSession, invite.id);

      const fetched = await ContributorsMethods.getContributorInvite(inviteeSession, invite.id);
      expect(fetched.status).toBe("Revoked");
    });

    test("should surface archived ruleset status so the page can render the right copy", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await Rulesets.archive(db, { id: ruleset.id });

      const fetched = await ContributorsMethods.getContributorInvite(inviteeSession, invite.id);
      expect(fetched.rulesetsInRule?.status).toBe("Archived");
    });

    test("should throw NotFoundError when probing another user's invite id", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const { session: strangerSession } = await createTestUser("stranger");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );

      await expect(
        ContributorsMethods.getContributorInvite(strangerSession, invite.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("rejectContributorInvite", () => {
    test("should reject a pending invite", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );

      const rejected = await ContributorsMethods.rejectContributorInvite(inviteeSession, invite.id);
      expect(rejected.status).toBe("Rejected");
    });
  });

  describe("revokeContributor", () => {
    test("should revoke an active contributor", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const revoked = await ContributorsMethods.revokeContributor(ownerSession, invite.id);
      expect(revoked.status).toBe("Revoked");
    });

    test("should throw ForbiddenError when non-owner revokes Admin", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: admin1, session: admin1Session } = await createTestUser("admin1");
      const { user: admin2, session: admin2Session } = await createTestUser("admin2");
      const ruleset = await createTestRuleset(owner.id);

      // Create two admins
      const invite1 = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, admin1.emailAddress, "Admin");
      await ContributorsMethods.acceptContributorInvite(admin1Session, invite1.id);
      const invite2 = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, admin2.emailAddress, "Admin");
      await ContributorsMethods.acceptContributorInvite(admin2Session, invite2.id);

      // Admin1 tries to revoke Admin2 — should fail
      await expect(
        ContributorsMethods.revokeContributor(admin1Session, invite2.id),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should allow owner to revoke Admin contributor", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: admin, session: adminSession } = await createTestUser("admin");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, admin.emailAddress, "Admin");
      await ContributorsMethods.acceptContributorInvite(adminSession, invite.id);

      const revoked = await ContributorsMethods.revokeContributor(ownerSession, invite.id);
      expect(revoked.status).toBe("Revoked");
    });
  });

  describe("updateContributorRole", () => {
    test("should update an active contributor's role", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const updated = await ContributorsMethods.updateContributorRole(ownerSession, invite.id, "Viewer");
      expect(updated.role).toBe("Viewer");
    });

    test("should throw ForbiddenError when non-owner promotes to Admin", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: admin, session: adminSession } = await createTestUser("admin");
      const { user: editor, session: editorSession } = await createTestUser("editor");
      const ruleset = await createTestRuleset(owner.id);

      const invite1 = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, admin.emailAddress, "Admin");
      await ContributorsMethods.acceptContributorInvite(adminSession, invite1.id);
      const invite2 = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, editor.emailAddress, "Editor");
      await ContributorsMethods.acceptContributorInvite(editorSession, invite2.id);

      await expect(
        ContributorsMethods.updateContributorRole(adminSession, invite2.id, "Admin"),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ConflictError when updating role of non-active contributor", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      // Don't accept — still Pending

      await expect(
        ContributorsMethods.updateContributorRole(ownerSession, invite.id, "Viewer"),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("leaveRuleset", () => {
    test("should allow a contributor to leave", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(
        ownerSession, ruleset.id, invitee.emailAddress, "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const left = await ContributorsMethods.leaveRuleset(inviteeSession, ruleset.id);
      expect(left.status).toBe("Revoked");
    });

    test("should throw NotFoundError when non-contributor tries to leave", async () => {
      const { user: owner } = await createTestUser("owner");
      const { session: otherSession } = await createTestUser("other");
      const ruleset = await createTestRuleset(owner.id);

      await expect(
        ContributorsMethods.leaveRuleset(otherSession, ruleset.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getContributors", () => {
    test("should list contributors for owner", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Editor");

      const result = await ContributorsMethods.getContributors(
        ownerSession, ruleset.id, {}, { limit: 10, page: 1 },
      );
      expect(result.items.length).toBe(1);
      expect(result.items[0].email).toBe(invitee.emailAddress);
    });

    test("should throw ForbiddenError when non-owner/contributor lists", async () => {
      const { user: owner } = await createTestUser("owner");
      const { session: otherSession } = await createTestUser("other");
      const ruleset = await createTestRuleset(owner.id);

      await expect(
        ContributorsMethods.getContributors(otherSession, ruleset.id, {}, { limit: 10, page: 1 }),
      ).rejects.toThrow(ForbiddenError);
    });

    test("should allow active contributor to list contributors", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Viewer");
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const result = await ContributorsMethods.getContributors(
        inviteeSession, ruleset.id, {}, { limit: 10, page: 1 },
      );
      expect(result.items.length).toBe(1);
    });
  });

  describe("getUserContributorInvites", () => {
    test("should return pending invites for user", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Editor");

      const invites = await ContributorsMethods.getUserContributorInvites(invitee.id);
      expect(invites.length).toBe(1);
      expect(invites[0].rulesetId).toBe(ruleset.id);
      expect(invites[0].rulesetsInRule).toBeDefined();
      expect(invites[0].rulesetsInRule?.name).toBeDefined();
    });

    test("should not return accepted invites", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Editor");
      await ContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const invites = await ContributorsMethods.getUserContributorInvites(invitee.id);
      expect(invites.length).toBe(0);
    });
  });

  describe("contributor access to entities", () => {
    test("should allow Editor to view changes on a ruleset", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: editor, session: editorSession } = await createTestUser("editor");
      const ruleset = await createTestRuleset(owner.id);

      const invite = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, editor.emailAddress, "Editor");
      await ContributorsMethods.acceptContributorInvite(editorSession, invite.id);

      // Editor should see contributorRole when fetching ruleset
      const role = await Contributors.findActiveRole(db, { userId: editor.id, rulesetId: ruleset.id });
      expect(role).toBe("Editor");
    });

    test("should return null role for non-contributor", async () => {
      const { user: owner } = await createTestUser("owner");
      const { user: other } = await createTestUser("other");
      const ruleset = await createTestRuleset(owner.id);

      const role = await Contributors.findActiveRole(db, { userId: other.id, rulesetId: ruleset.id });
      expect(role).toBeNull();
    });
  });
});
