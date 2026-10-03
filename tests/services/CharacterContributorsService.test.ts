import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { CharacterContributors, Users } from "@/server/repositories/index.ts";
import CharacterContributorsService from "@/server/services/CharacterContributorsService.ts";
import CharactersService from "@/server/services/CharactersService.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestUser, getSeedCtx, uniqueId } from "@/tests/helpers.ts";

async function createCharacter(session: Session) {
  const ctx = await getSeedCtx();
  return await CharactersService.createCharacter(session, {
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
  const invite = await CharacterContributorsService.inviteContributor(ownerSession, character.id, invitee.emailAddress);
  if (!pending) await CharacterContributorsService.acceptContributorInvite(inviteeSession, invite.id);
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

      const unregistered = await CharacterContributorsService.inviteContributor(
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
        CharacterContributorsService.inviteContributor(stranger, character.id, "x@example.com"),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        CharacterContributorsService.inviteContributor(ownerSession, character.id, owner.emailAddress),
      ).rejects.toThrow(ConflictError);
      await expect(
        CharacterContributorsService.inviteContributor(ownerSession, character.id, invitee.emailAddress),
      ).rejects.toThrow(ConflictError);

      await CharactersService.archiveCharacter(ownerSession, character.id);
      await expect(
        CharacterContributorsService.inviteContributor(ownerSession, character.id, "late@example.com"),
      ).rejects.toThrow(ConflictError);
    });

    test("hands an email-only invite to the account that signs up with that email", async () => {
      const { session: ownerSession } = await createTestUser("owner");
      const character = await createCharacter(ownerSession);
      const email = `future-${uniqueId()}@example.com`;
      const invite = await CharacterContributorsService.inviteContributor(ownerSession, character.id, email);

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
      expect(await CharacterContributorsService.getUserContributorInvites(inviteeSession.userId)).toMatchObject([
        { id: invite.id },
      ]);
      expect((await CharacterContributorsService.acceptContributorInvite(inviteeSession, invite.id)).status).toBe(
        "Active",
      );
      expect(await CharacterContributorsService.getUserContributorInvites(inviteeSession.userId)).toEqual([]);
      expect(
        (await CharactersService.updateCharacter(inviteeSession, character.id, { notes: "edited by contributor" }))
          .notes,
      ).toBe("edited by contributor");
    });

    test("rejects an invite", async () => {
      const { inviteeSession, invite } = await setup(true);
      expect((await CharacterContributorsService.rejectContributorInvite(inviteeSession, invite.id)).status).toBe(
        "Rejected",
      );
      await expect(CharacterContributorsService.acceptContributorInvite(inviteeSession, invite.id)).rejects.toThrow(
        ConflictError,
      );
    });

    test("refuses another user's invite, and an invite to a character archived since", async () => {
      const { ownerSession, inviteeSession, character, invite } = await setup(true);
      const { session: stranger } = await createTestUser("stranger");
      await expect(CharacterContributorsService.acceptContributorInvite(stranger, invite.id)).rejects.toThrow(
        NotFoundError,
      );

      await CharactersService.archiveCharacter(ownerSession, character.id);
      await expect(CharacterContributorsService.acceptContributorInvite(inviteeSession, invite.id)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe("getContributorInvite", () => {
    test("shows the invitee their invite whatever became of it, the character's archival included", async () => {
      const { ownerSession, inviteeSession, character, invite } = await setup();
      expect(await CharacterContributorsService.getContributorInvite(inviteeSession, invite.id)).toMatchObject({
        status: "Active",
        charactersInCharacter: { name: character.name },
      });
      await CharactersService.archiveCharacter(ownerSession, character.id);
      expect(
        (await CharacterContributorsService.getContributorInvite(inviteeSession, invite.id)).charactersInCharacter
          ?.deletedAt,
      ).not.toBeNull();
    });

    test("hides the invite from anyone else", async () => {
      const { invite } = await setup(true);
      const { session: stranger } = await createTestUser("stranger");
      await expect(CharacterContributorsService.getContributorInvite(stranger, invite.id)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("contributors", () => {
    test("lists them to the owner and to contributors, not to strangers", async () => {
      const { ownerSession, inviteeSession, invitee, character } = await setup();
      const list = (session: Session) =>
        CharacterContributorsService.getContributors(session, character.id, {}, { limit: 10, page: 1 });
      expect((await list(ownerSession)).items.map((c) => c.email)).toEqual([invitee.emailAddress]);
      expect((await list(inviteeSession)).items).toHaveLength(1);
      const { session: stranger } = await createTestUser("stranger");
      await expect(list(stranger)).rejects.toThrow(ForbiddenError);
    });

    test("lose edit access when revoked or when they leave", async () => {
      const revoked = await setup();
      await CharacterContributorsService.revokeContributor(revoked.ownerSession, revoked.invite.id);
      await expect(
        CharactersService.updateCharacter(revoked.inviteeSession, revoked.character.id, { notes: "after revoke" }),
      ).rejects.toThrow(NotFoundError);

      const left = await setup();
      await CharacterContributorsService.leaveCharacter(left.inviteeSession, left.character.id);
      await expect(
        CharactersService.updateCharacter(left.inviteeSession, left.character.id, { notes: "after leaving" }),
      ).rejects.toThrow(NotFoundError);
    });

    test("can edit and print, but can't archive, share or invite", async () => {
      const { inviteeSession, character } = await setup();
      await CharactersService.updateCharacter(inviteeSession, character.id, { notes: "ok" });
      await CharactersService.enqueuePdf(inviteeSession, character.id);

      await expect(CharactersService.archiveCharacter(inviteeSession, character.id)).rejects.toThrow(NotFoundError);
      await expect(CharactersService.generateShareToken(inviteeSession, character.id)).rejects.toThrow(NotFoundError);
      await expect(CharactersService.revokeShareToken(inviteeSession, character.id)).rejects.toThrow(NotFoundError);
      await expect(
        CharacterContributorsService.inviteContributor(inviteeSession, character.id, "x@example.com"),
      ).rejects.toThrow(ForbiddenError);
    });

    test("are the only ones besides the owner who can edit", async () => {
      const { character } = await setup();
      const { session: stranger } = await createTestUser("stranger");
      await expect(CharactersService.updateCharacter(stranger, character.id, { notes: "nope" })).rejects.toThrow(
        NotFoundError,
      );
    });

    test("see the characters shared with them among their own, and can filter by access", async () => {
      const { inviteeSession, character: shared } = await setup();
      const own = await createCharacter(inviteeSession);
      const list = async (accessRole?: "owner" | "contributor") =>
        (await CharactersService.getMyCharacters(inviteeSession, { accessRole }, { limit: 50, page: 1 })).items;

      const all = await list();
      expect(all.find((c) => c.id === shared.id)?.accessRole).toBe("contributor");
      expect(all.find((c) => c.id === own.id)?.accessRole).toBe("owner");
      expect((await list("owner")).map((c) => c.id)).toEqual([own.id]);
      expect((await list("contributor")).map((c) => c.id)).toEqual([shared.id]);
    });
  });
});
