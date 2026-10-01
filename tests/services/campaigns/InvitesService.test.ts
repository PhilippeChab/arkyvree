import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { playersInCampaign } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Invites, Players, Users } from "@/server/repositories/index.ts";
import { CampaignInvitesMethods } from "@/server/services/campaigns/InvitesService.ts";
import { createTestCampaign, createTestUser, makeSession, NIL_UUID, uniqueId } from "@/tests/helpers.ts";

async function createEmptySlot(campaignId: string) {
  const [slot] = await Players.create(db, { campaignId, role: "Player Character" });
  return slot;
}

/** A Game Master's campaign with an empty slot, and a new user invited into it. */
async function setup() {
  const { user: gm, session: gmSession } = await createTestUser("gm");
  const invitee = await createTestUser("invitee");
  const { campaign } = await createTestCampaign(gm.id);
  const slot = await createEmptySlot(campaign.id);
  const invite = await CampaignInvitesMethods.createCampaignInvite(gmSession, slot, invitee.user.emailAddress);
  return { gmSession, invitee, campaign, slot, invite };
}

/** A Game Master's campaign with an empty slot, and an invite to an email no account has. */
async function setupEmailOnly() {
  const { user: gm, session: gmSession } = await createTestUser("gm");
  const { campaign } = await createTestCampaign(gm.id);
  const slot = await createEmptySlot(campaign.id);
  const email = `email-only-${uniqueId()}@example.com`;
  const invite = await CampaignInvitesMethods.createCampaignInvite(gmSession, slot, email);
  return { gmSession, campaign, slot, email, invite };
}

/** The account a new user signs up with for `email`, and their invites backfilled to it. */
async function signUpAndBackfill(email: string) {
  const [user] = await Users.create(db, { emailAddress: email, password: "password1234" });
  const backfilled = await Invites.backfillUserId(db, email, user.id);
  return { user, backfilled };
}

describe("InvitesService", () => {
  describe("createCampaignInvite", () => {
    test("invites a user into an empty slot", async () => {
      const { invitee, slot, invite } = await setup();
      expect(invite).toMatchObject({ userId: invitee.user.id, playerId: slot.id, status: "Pending" });
    });

    test("invites an email no account has yet", async () => {
      const { slot, email, invite } = await setupEmailOnly();
      expect(invite).toMatchObject({ email, userId: null, playerId: slot.id, status: "Pending" });
    });

    test("throws NotFoundError when the campaign doesn't exist", async () => {
      const { session } = await createTestUser();
      const now = new Date().toISOString();
      const orphanSlot = {
        id: "player-id",
        campaignId: NIL_UUID,
        userId: null,
        role: "Player Character" as const,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await expect(
        CampaignInvitesMethods.createCampaignInvite(session, orphanSlot, "someone@example.com"),
      ).rejects.toThrow(NotFoundError);
    });

    test("refuses a second invite for the same user, to the same slot or another one", async () => {
      const { gmSession, invitee, campaign, slot } = await setup();
      const otherSlot = await createEmptySlot(campaign.id);
      for (const target of [slot, otherSlot]) {
        await expect(
          CampaignInvitesMethods.createCampaignInvite(gmSession, target, invitee.user.emailAddress),
        ).rejects.toThrow(ConflictError);
      }
    });

    test("refuses to invite someone who already plays in the campaign", async () => {
      const { user: gm, session: gmSession } = await createTestUser();
      const { user: player } = await createTestUser();
      const { campaign } = await createTestCampaign(gm.id);
      await Players.create(db, { userId: player.id, campaignId: campaign.id, role: "Player Character" });
      const slot = await createEmptySlot(campaign.id);
      await expect(CampaignInvitesMethods.createCampaignInvite(gmSession, slot, player.emailAddress)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe("getUserInvites", () => {
    test("lists the invites sent to a user", async () => {
      const { session } = await createTestUser();
      expect(await CampaignInvitesMethods.getUserInvites(session.userId)).toEqual([]);

      const { invitee, slot } = await setup();
      expect(await CampaignInvitesMethods.getUserInvites(invitee.user.id)).toMatchObject([
        { userId: invitee.user.id, playerId: slot.id, status: "Pending" },
      ]);
    });
  });

  describe("getCampaignInvite", () => {
    test("returns the invite to its recipient, still after it's answered", async () => {
      const { invitee, campaign, invite } = await setup();
      const pending = await CampaignInvitesMethods.getCampaignInvite(invitee.session, invite.id);
      expect(pending.status).toBe("Pending");
      expect(pending.playersInCampaign?.campaignsInCampaign?.name).toBe(campaign.name);

      await CampaignInvitesMethods.acceptCampaignInvite(invitee.session, invite.id);
      expect((await CampaignInvitesMethods.getCampaignInvite(invitee.session, invite.id)).status).toBe("Accepted");
    });

    test("shows the campaign as archived through its deletedAt", async () => {
      const { invitee, campaign, invite } = await setup();
      await Campaigns.archive(db, { id: campaign.id });
      const fetched = await CampaignInvitesMethods.getCampaignInvite(invitee.session, invite.id);
      expect(fetched.playersInCampaign?.campaignsInCampaign?.deletedAt).not.toBeNull();
    });

    test("hides the invite from anyone else", async () => {
      const { invite } = await setup();
      const { session: stranger } = await createTestUser();
      await expect(CampaignInvitesMethods.getCampaignInvite(stranger, invite.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("getCampaignInvites", () => {
    test("pages a campaign's invites", async () => {
      const { gmSession, campaign } = await setup();
      for (let i = 0; i < 2; i++) {
        const { user } = await createTestUser();
        await CampaignInvitesMethods.createCampaignInvite(
          gmSession,
          await createEmptySlot(campaign.id),
          user.emailAddress,
        );
      }

      const page1 = await CampaignInvitesMethods.getCampaignInvites(gmSession, campaign.id, {}, { limit: 2, page: 1 });
      expect(page1).toMatchObject({ page: 1, nextPage: 2 });
      expect(page1.items).toHaveLength(2);
      const page2 = await CampaignInvitesMethods.getCampaignInvites(gmSession, campaign.id, {}, { limit: 2, page: 2 });
      expect(page2).toMatchObject({ page: 2, nextPage: undefined });
      expect(page2.items).toHaveLength(1);
    });

    test("refuses non-members and throws NotFoundError for a missing campaign", async () => {
      const { campaign } = await setup();
      const { session: stranger } = await createTestUser();
      await expect(
        CampaignInvitesMethods.getCampaignInvites(stranger, campaign.id, {}, { limit: 10, page: 1 }),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        CampaignInvitesMethods.getCampaignInvites(stranger, NIL_UUID, {}, { limit: 10, page: 1 }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("acceptCampaignInvite", () => {
    test("accepts the invite and gives the slot to the invitee", async () => {
      const { invitee, slot, invite } = await setup();
      expect(await CampaignInvitesMethods.acceptCampaignInvite(invitee.session, invite.id)).toMatchObject({
        status: "Accepted",
      });
      expect((await Players.findOne(db, { id: slot.id }))?.userId).toBe(invitee.user.id);
      await expect(CampaignInvitesMethods.acceptCampaignInvite(invitee.session, invite.id)).rejects.toThrow(
        ConflictError,
      );
    });

    test("throws NotFoundError for a missing invite or someone else's", async () => {
      const { invite } = await setup();
      const { session: stranger } = await createTestUser();
      await expect(CampaignInvitesMethods.acceptCampaignInvite(stranger, NIL_UUID)).rejects.toThrow(NotFoundError);
      await expect(CampaignInvitesMethods.acceptCampaignInvite(stranger, invite.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("rejectCampaignInvite", () => {
    test("rejects the invite and leaves the slot empty", async () => {
      const { invitee, slot, invite } = await setup();
      expect(await CampaignInvitesMethods.rejectCampaignInvite(invitee.session, invite.id)).toMatchObject({
        status: "Rejected",
      });
      expect((await Players.findOne(db, { id: slot.id }))?.userId).toBeNull();
      await expect(CampaignInvitesMethods.rejectCampaignInvite(invitee.session, invite.id)).rejects.toThrow(
        ConflictError,
      );
    });

    test("throws NotFoundError for a missing invite or someone else's", async () => {
      const { invite } = await setup();
      const { session: stranger } = await createTestUser();
      await expect(CampaignInvitesMethods.rejectCampaignInvite(stranger, NIL_UUID)).rejects.toThrow(NotFoundError);
      await expect(CampaignInvitesMethods.rejectCampaignInvite(stranger, invite.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("revokeCampaignInvite", () => {
    test("revokes a pending invite, also once the campaign is archived", async () => {
      const { gmSession, campaign, invite } = await setup();
      await Campaigns.archive(db, { id: campaign.id });
      expect(await CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id)).toMatchObject({
        status: "Revoked",
      });
    });

    test("refuses an invite that was answered", async () => {
      const { gmSession, invitee, invite } = await setup();
      await CampaignInvitesMethods.acceptCampaignInvite(invitee.session, invite.id);
      await expect(CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id)).rejects.toThrow(ConflictError);
    });

    test("throws NotFoundError for a missing invite or a removed slot", async () => {
      const { gmSession, slot, invite } = await setup();
      await expect(CampaignInvitesMethods.revokeCampaignInvite(gmSession, NIL_UUID)).rejects.toThrow(NotFoundError);
      await db
        .update(playersInCampaign)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(playersInCampaign.id, slot.id));
      await expect(CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe("backfillUserId", () => {
    test("links the pending email-only invites of every campaign to the account signing up with that email", async () => {
      const { gmSession, email, invite } = await setupEmailOnly();
      const { campaign: second } = await createTestCampaign(gmSession.userId);
      const other = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        await createEmptySlot(second.id),
        email,
      );

      const { user, backfilled } = await signUpAndBackfill(email);
      expect(backfilled.map((i) => i.id).sort()).toEqual([invite.id, other.id].sort());
      expect(backfilled.every((i) => i.userId === user.id)).toBe(true);
    });

    test("leaves invites alone once they have a user or an answer", async () => {
      const { invitee } = await setup();
      const { user: other } = await createTestUser();
      expect(await Invites.backfillUserId(db, invitee.user.emailAddress, other.id)).toEqual([]);

      const { gmSession, email, invite } = await setupEmailOnly();
      await CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id);
      expect((await signUpAndBackfill(email)).backfilled).toEqual([]);
    });

    test("lets the new account list, accept or reject its backfilled invite", async () => {
      const accepted = await setupEmailOnly();
      const { user } = await signUpAndBackfill(accepted.email);
      expect(await CampaignInvitesMethods.getUserInvites(user.id)).toMatchObject([
        { playerId: accepted.slot.id, status: "Pending" },
      ]);
      expect(await CampaignInvitesMethods.acceptCampaignInvite(makeSession(user.id), accepted.invite.id)).toMatchObject(
        { status: "Accepted" },
      );
      expect((await Players.findOne(db, { id: accepted.slot.id }))?.userId).toBe(user.id);

      const rejected = await setupEmailOnly();
      const { user: rejecter } = await signUpAndBackfill(rejected.email);
      expect(
        await CampaignInvitesMethods.rejectCampaignInvite(makeSession(rejecter.id), rejected.invite.id),
      ).toMatchObject({ status: "Rejected" });
      expect((await Players.findOne(db, { id: rejected.slot.id }))?.userId).toBeNull();
    });
  });
});
