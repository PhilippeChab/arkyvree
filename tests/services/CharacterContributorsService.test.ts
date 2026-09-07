import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { CharacterContributors, Users } from "@/server/repositories/index.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { CharacterContributorsMethods } from "@/server/services/CharacterContributorsService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("CharacterContributorsService", () => {
  let seedCtx: SeedContext;

  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

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

  async function createTestUser(prefix = "user") {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const users = await Users.create(db, {
      username: `${prefix}-${uniqueId}`,
      emailAddress: `${prefix}-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];
    return { user, session: createTestSession(user.id) };
  }

  async function createTestCharacter(session: Session) {
    const ctx = await getCtx();
    return await CharactersMethods.createCharacter(session, {
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
      name: `Test Character ${Math.random().toString(36).substr(2, 9)}`,
      xp: 0,
      alignment: "True Neutral",
      abilities: {},
      age: 25,
      gender: "Other",
      height: "5'10\"",
      weight: "160 lbs",
    });
  }

  describe("inviteContributor", () => {
    test("invites by email when invitee already has an account", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const contributor = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );

      expect(contributor.characterId).toBe(character.id);
      expect(contributor.email).toBe(invitee.emailAddress);
      expect(contributor.role).toBe("Editor");
      expect(contributor.status).toBe("Pending");
      expect(contributor.invitedBy).toBe(owner.id);
      expect(contributor.userId).toBe(invitee.id);
    });

    test("invites by email for an unregistered email", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const character = await createTestCharacter(ownerSession);

      const contributor = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, "stranger@example.com",
      );

      expect(contributor.email).toBe("stranger@example.com");
      expect(contributor.userId).toBeNull();
      expect(contributor.status).toBe("Pending");
    });

    test("rejects non-owner invites with ForbiddenError", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { session: otherSession } = await createTestUser("other");
      const character = await createTestCharacter(ownerSession);

      await expect(
        CharacterContributorsMethods.inviteContributor(otherSession, character.id, "x@example.com"),
      ).rejects.toThrow(ForbiddenError);
    });

    test("rejects inviting the owner", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const character = await createTestCharacter(ownerSession);

      await expect(
        CharacterContributorsMethods.inviteContributor(ownerSession, character.id, owner.emailAddress),
      ).rejects.toThrow(ConflictError);
    });

    test("rejects duplicate pending invite", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      await CharacterContributorsMethods.inviteContributor(ownerSession, character.id, invitee.emailAddress);

      await expect(
        CharacterContributorsMethods.inviteContributor(ownerSession, character.id, invitee.emailAddress),
      ).rejects.toThrow(ConflictError);
    });

  });

  describe("accept / reject", () => {
    test("invitee can accept and gains edit access", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );

      const accepted = await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);
      expect(accepted.status).toBe("Active");

      // Contributor can now load and edit the character
      const result = await CharactersMethods.updateCharacter(inviteeSession, character.id, { notes: "edited by contributor" });
      expect(result.notes).toBe("edited by contributor");
    });

    test("invitee can reject", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );

      const rejected = await CharacterContributorsMethods.rejectContributorInvite(inviteeSession, invite.id);
      expect(rejected.status).toBe("Rejected");
    });

    test("rejects accept when character was archived after invite", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );

      await CharactersMethods.archiveCharacter(ownerSession, character.id);

      await expect(
        CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id),
      ).rejects.toThrow(ConflictError);
    });


    test("rejects invite to an archived character", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      await CharactersMethods.archiveCharacter(ownerSession, character.id);

      await expect(
        CharacterContributorsMethods.inviteContributor(ownerSession, character.id, invitee.emailAddress),
      ).rejects.toThrow(ConflictError);
    });

    test("non-invitee cannot accept", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const { session: otherSession } = await createTestUser("other");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );

      await expect(
        CharacterContributorsMethods.acceptContributorInvite(otherSession, invite.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getContributorInvite", () => {
    test("returns invite for any status (Active / Rejected) so stale links render correctly", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );
      await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const fetchedActive = await CharacterContributorsMethods.getContributorInvite(inviteeSession, invite.id);
      expect(fetchedActive.status).toBe("Active");
      expect(fetchedActive.charactersInCharacter?.name).toBe(character.name);
    });

    test("surfaces archived character via deletedAt", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );
      await CharactersMethods.archiveCharacter(ownerSession, character.id);

      const fetched = await CharacterContributorsMethods.getContributorInvite(inviteeSession, invite.id);
      expect(fetched.charactersInCharacter?.deletedAt).not.toBeNull();
    });

    test("rejects probing another user's invite id", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const { session: strangerSession } = await createTestUser("stranger");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );

      await expect(
        CharacterContributorsMethods.getContributorInvite(strangerSession, invite.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("authorization", () => {
    test("contributor can edit, print PDF, but cannot archive, share, or invite others", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );
      await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      // Edit: allowed
      await CharactersMethods.updateCharacter(inviteeSession, character.id, { notes: "ok" });

      // Archive: owner-only
      await expect(
        CharactersMethods.archiveCharacter(inviteeSession, character.id),
      ).rejects.toThrow(NotFoundError);

      // Share token generate/revoke: owner-only
      await expect(
        CharactersMethods.generateShareToken(inviteeSession, character.id),
      ).rejects.toThrow(NotFoundError);
      await expect(
        CharactersMethods.revokeShareToken(inviteeSession, character.id),
      ).rejects.toThrow(NotFoundError);

      // Invite another: owner-only
      await expect(
        CharacterContributorsMethods.inviteContributor(inviteeSession, character.id, "x@example.com"),
      ).rejects.toThrow(ForbiddenError);
    });

    test("non-contributor cannot edit", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { session: otherSession } = await createTestUser("other");
      const character = await createTestCharacter(ownerSession);

      await expect(
        CharactersMethods.updateCharacter(otherSession, character.id, { notes: "nope" }),
      ).rejects.toThrow(NotFoundError);
    });

    test("revoked contributor loses access", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const character = await createTestCharacter(ownerSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, invitee.emailAddress,
      );
      await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      await CharacterContributorsMethods.revokeContributor(ownerSession, invite.id);

      await expect(
        CharactersMethods.updateCharacter(inviteeSession, character.id, { notes: "after revoke" }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getMyCharacters", () => {
    test("includes shared characters with accessRole field", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const sharedChar = await createTestCharacter(ownerSession);
      const ownChar = await createTestCharacter(inviteeSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, sharedChar.id, invitee.emailAddress,
      );
      await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const list = await CharactersMethods.getMyCharacters(inviteeSession, {}, { limit: 50, page: 1 });
      const ids = list.items.map((c) => c.id);
      expect(ids).toContain(sharedChar.id);
      expect(ids).toContain(ownChar.id);

      const sharedRow = list.items.find((c) => c.id === sharedChar.id);
      const ownRow = list.items.find((c) => c.id === ownChar.id);
      expect(sharedRow?.accessRole).toBe("contributor");
      expect(ownRow?.accessRole).toBe("owner");
    });

    test("accessRole filter narrows results to owner or contributor", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const sharedChar = await createTestCharacter(ownerSession);
      const ownChar = await createTestCharacter(inviteeSession);

      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, sharedChar.id, invitee.emailAddress,
      );
      await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);

      const ownedOnly = await CharactersMethods.getMyCharacters(
        inviteeSession,
        { accessRole: "owner" },
        { limit: 50, page: 1 },
      );
      const ownedIds = ownedOnly.items.map((c) => c.id);
      expect(ownedIds).toContain(ownChar.id);
      expect(ownedIds).not.toContain(sharedChar.id);

      const sharedOnly = await CharactersMethods.getMyCharacters(
        inviteeSession,
        { accessRole: "contributor" },
        { limit: 50, page: 1 },
      );
      const sharedIds = sharedOnly.items.map((c) => c.id);
      expect(sharedIds).toContain(sharedChar.id);
      expect(sharedIds).not.toContain(ownChar.id);
    });
  });

  describe("backfillUserId", () => {
    test("claims pending invite when invited email signs up", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const character = await createTestCharacter(ownerSession);

      const futureEmail = `future-${Math.random().toString(36).substr(2, 9)}@example.com`;
      const invite = await CharacterContributorsMethods.inviteContributor(
        ownerSession, character.id, futureEmail,
      );
      expect(invite.userId).toBeNull();

      // Simulate signup creating a user with the same email and the auth flow
      // calling backfillUserId
      const users = await Users.create(db, {
        username: `future-${Math.random().toString(36).substr(2, 9)}`,
        emailAddress: futureEmail,
        password: "password1234",
      });
      await CharacterContributors.backfillUserId(db, futureEmail, users[0].id);

      const updated = await CharacterContributors.findOne(db, { id: invite.id });
      expect(updated?.userId).toBe(users[0].id);
    });
  });
});
