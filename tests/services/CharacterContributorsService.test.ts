import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { CharacterContributors, Users } from "@/server/repositories/index.ts";
import { CharacterContributorsMethods } from "@/server/services/CharacterContributorsService.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestUser, getSeedCtx, uniqueId } from "@/tests/helpers.ts";

async function createCharacter(session: Session) {
  const ctx = await getSeedCtx();
  return await CharactersMethods.createCharacter(session, {
    rulesetId: ctx.rulesetId,
    raceId: ctx.raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 0,
    alignment: "True Neutral",
    abilities: {},
    age: 25,
    gender: "Other",
    height: "5'10\"",
    weight: "160 lbs",
  });
}

/** A new user's character and another user invited to contribute to it; accepted unless `pending`. */
async function setup(pending = false) {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
  const character = await createCharacter(ownerSession);
  const invite = await CharacterContributorsMethods.inviteContributor(ownerSession, character.id, invitee.emailAddress);
  if (!pending) await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id);
  return { owner, ownerSession, invitee, inviteeSession, character, invite };
}

describe("CharacterContributorsService", () => {
  describe("inviteContributor", () => {
    test("invites a user by email, or an email without an account, as an Editor", async () => {
      const { owner, ownerSession, invitee, character, invite } = await setup(true);
      expect(invite).toMatchObject({
        characterId: character.id,
        email: invitee.emailAddress,
        userId: invitee.id,
        role: "Editor",
        status: "Pending",
        invitedBy: owner.id,
      });

      const unregistered = await CharacterContributorsMethods.inviteContributor(
        ownerSession,
        character.id,
        "stranger@example.com",
      );
      expect(unregistered).toMatchObject({ email: "stranger@example.com", userId: null, status: "Pending" });
    });

    test("refuses strangers, the owner's own email, a second invite and an archived character", async () => {
      const { owner, ownerSession, invitee, character } = await setup(true);
      const { session: stranger } = await createTestUser("stranger");
      await expect(
        CharacterContributorsMethods.inviteContributor(stranger, character.id, "x@example.com"),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        CharacterContributorsMethods.inviteContributor(ownerSession, character.id, owner.emailAddress),
      ).rejects.toThrow(ConflictError);
      await expect(
        CharacterContributorsMethods.inviteContributor(ownerSession, character.id, invitee.emailAddress),
      ).rejects.toThrow(ConflictError);

      await CharactersMethods.archiveCharacter(ownerSession, character.id);
      await expect(
        CharacterContributorsMethods.inviteContributor(ownerSession, character.id, "late@example.com"),
      ).rejects.toThrow(ConflictError);
    });

    test("hands an email-only invite to the account that signs up with that email", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const character = await createCharacter(ownerSession);
      const email = `future-${uniqueId()}@example.com`;
      const invite = await CharacterContributorsMethods.inviteContributor(ownerSession, character.id, email);

      const [user] = await Users.create(db, {
        username: `future-${uniqueId()}`,
        emailAddress: email,
        password: "password1234",
      });
      await CharacterContributors.backfillUserId(db, email, user.id);
      expect((await CharacterContributors.findOne(db, { id: invite.id }))?.userId).toBe(user.id);
    });
  });

  describe("answering an invite", () => {
    test("accepting gives the invitee edit access", async () => {
      const { inviteeSession, character, invite } = await setup(true);
      expect(await CharacterContributorsMethods.getUserContributorInvites(inviteeSession.userId)).toMatchObject([
        { id: invite.id },
      ]);
      expect((await CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id)).status).toBe(
        "Active",
      );
      expect(await CharacterContributorsMethods.getUserContributorInvites(inviteeSession.userId)).toEqual([]);
      expect(
        (await CharactersMethods.updateCharacter(inviteeSession, character.id, { notes: "edited by contributor" }))
          .notes,
      ).toBe("edited by contributor");
    });

    test("rejects an invite", async () => {
      const { inviteeSession, invite } = await setup(true);
      expect((await CharacterContributorsMethods.rejectContributorInvite(inviteeSession, invite.id)).status).toBe(
        "Rejected",
      );
      await expect(CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id)).rejects.toThrow(
        ConflictError,
      );
    });

    test("refuses another user's invite, and an invite to a character archived since", async () => {
      const { ownerSession, inviteeSession, character, invite } = await setup(true);
      const { session: stranger } = await createTestUser("stranger");
      await expect(CharacterContributorsMethods.acceptContributorInvite(stranger, invite.id)).rejects.toThrow(
        NotFoundError,
      );

      await CharactersMethods.archiveCharacter(ownerSession, character.id);
      await expect(CharacterContributorsMethods.acceptContributorInvite(inviteeSession, invite.id)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe("getContributorInvite", () => {
    test("shows the invitee their invite whatever became of it, the character's archival included", async () => {
      const { ownerSession, inviteeSession, character, invite } = await setup();
      expect(await CharacterContributorsMethods.getContributorInvite(inviteeSession, invite.id)).toMatchObject({
        status: "Active",
        charactersInCharacter: { name: character.name },
      });
      await CharactersMethods.archiveCharacter(ownerSession, character.id);
      expect(
        (await CharacterContributorsMethods.getContributorInvite(inviteeSession, invite.id)).charactersInCharacter
          ?.deletedAt,
      ).not.toBeNull();
    });

    test("hides the invite from anyone else", async () => {
      const { invite } = await setup(true);
      const { session: stranger } = await createTestUser("stranger");
      await expect(CharacterContributorsMethods.getContributorInvite(stranger, invite.id)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("contributors", () => {
    test("lists them to the owner and to contributors, not to strangers", async () => {
      const { ownerSession, inviteeSession, invitee, character } = await setup();
      const list = (session: Session) =>
        CharacterContributorsMethods.getContributors(session, character.id, {}, { limit: 10, page: 1 });
      expect((await list(ownerSession)).items.map((c) => c.email)).toEqual([invitee.emailAddress]);
      expect((await list(inviteeSession)).items).toHaveLength(1);
      const { session: stranger } = await createTestUser("stranger");
      await expect(list(stranger)).rejects.toThrow(ForbiddenError);
    });

    test("lose edit access when revoked or when they leave", async () => {
      const revoked = await setup();
      await CharacterContributorsMethods.revokeContributor(revoked.ownerSession, revoked.invite.id);
      await expect(
        CharactersMethods.updateCharacter(revoked.inviteeSession, revoked.character.id, { notes: "after revoke" }),
      ).rejects.toThrow(NotFoundError);

      const left = await setup();
      await CharacterContributorsMethods.leaveCharacter(left.inviteeSession, left.character.id);
      await expect(
        CharactersMethods.updateCharacter(left.inviteeSession, left.character.id, { notes: "after leaving" }),
      ).rejects.toThrow(NotFoundError);
    });

    test("can edit and print, but can't archive, share or invite", async () => {
      const { inviteeSession, character } = await setup();
      await CharactersMethods.updateCharacter(inviteeSession, character.id, { notes: "ok" });
      await CharactersMethods.enqueuePdf(inviteeSession, character.id);

      await expect(CharactersMethods.archiveCharacter(inviteeSession, character.id)).rejects.toThrow(NotFoundError);
      await expect(CharactersMethods.generateShareToken(inviteeSession, character.id)).rejects.toThrow(NotFoundError);
      await expect(CharactersMethods.revokeShareToken(inviteeSession, character.id)).rejects.toThrow(NotFoundError);
      await expect(
        CharacterContributorsMethods.inviteContributor(inviteeSession, character.id, "x@example.com"),
      ).rejects.toThrow(ForbiddenError);
    });

    test("are the only ones besides the owner who can edit", async () => {
      const { character } = await setup();
      const { session: stranger } = await createTestUser("stranger");
      await expect(CharactersMethods.updateCharacter(stranger, character.id, { notes: "nope" })).rejects.toThrow(
        NotFoundError,
      );
    });

    test("see the characters shared with them among their own, and can filter by access", async () => {
      const { inviteeSession, character: shared } = await setup();
      const own = await createCharacter(inviteeSession);
      const list = async (accessRole?: "owner" | "contributor") =>
        (await CharactersMethods.getMyCharacters(inviteeSession, { accessRole }, { limit: 50, page: 1 })).items;

      const all = await list();
      expect(all.find((c) => c.id === shared.id)?.accessRole).toBe("contributor");
      expect(all.find((c) => c.id === own.id)?.accessRole).toBe("owner");
      expect((await list("owner")).map((c) => c.id)).toEqual([own.id]);
      expect((await list("contributor")).map((c) => c.id)).toEqual([shared.id]);
    });
  });
});
