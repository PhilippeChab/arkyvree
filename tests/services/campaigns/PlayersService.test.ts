import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Campaigns, Invites, Players } from "@/server/repositories/index.ts";
import { CampaignPlayersMethods } from "@/server/services/campaigns/PlayersService.ts";
import { createTestCampaign, createTestUser, NIL_UUID } from "@/tests/helpers.ts";

const firstPage = { limit: 10, page: 1 };

/** A new user's campaign, of which they're the only Game Master. */
async function setup() {
  const { user, session } = await createTestUser("gm");
  const { campaign, player: gmPlayer } = await createTestCampaign(user.id);
  return { user, session, campaign, gmPlayer };
}

describe("PlayersService", () => {
  describe("getCampaignPlayers", () => {
    test("lists and pages a campaign's players", async () => {
      const { user, session, campaign } = await setup();
      expect(
        (await CampaignPlayersMethods.getCampaignPlayers(session, campaign.id, {}, firstPage)).items,
      ).toMatchObject([{ userId: user.id, role: "Game Master" }]);

      await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character");
      await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character");
      const page1 = await CampaignPlayersMethods.getCampaignPlayers(session, campaign.id, {}, { limit: 2, page: 1 });
      expect([page1.items.length, page1.nextPage]).toEqual([2, 2]);
      const page2 = await CampaignPlayersMethods.getCampaignPlayers(session, campaign.id, {}, { limit: 2, page: 2 });
      expect([page2.items.length, page2.nextPage]).toEqual([1, undefined]);
    });

    test("refuses non-members and throws NotFoundError for a missing campaign", async () => {
      const { campaign } = await setup();
      const { session: stranger } = await createTestUser();
      await expect(CampaignPlayersMethods.getCampaignPlayers(stranger, campaign.id, {}, firstPage)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(CampaignPlayersMethods.getCampaignPlayers(stranger, NIL_UUID, {}, firstPage)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("addCampaignPlayer", () => {
    test.each(["Game Master", "Player Character"] as const)("adds an empty %s slot", async (role) => {
      const { session, campaign } = await setup();
      const result = await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, role);
      expect(result).toMatchObject({ player: { campaignId: campaign.id, role, userId: null }, invite: null });
    });

    test("invites the owner of the email into the new slot", async () => {
      const { session, campaign } = await setup();
      const { user: invitee } = await createTestUser();
      const result = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character",
        invitee.emailAddress,
      );
      // The slot stays empty until the invite is accepted.
      expect(result.player.userId).toBeNull();
      expect(result.invite).toMatchObject({ userId: invitee.id, playerId: result.player.id, status: "Pending" });
    });

    test("is for the Game Master of a live campaign", async () => {
      const { session, campaign } = await setup();
      const { session: stranger } = await createTestUser();
      await expect(CampaignPlayersMethods.addCampaignPlayer(stranger, campaign.id, "Player Character")).rejects.toThrow(
        ForbiddenError,
      );
      await expect(CampaignPlayersMethods.addCampaignPlayer(session, NIL_UUID, "Player Character")).rejects.toThrow(
        NotFoundError,
      );
      await Campaigns.archive(db, { id: campaign.id });
      await expect(CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character")).rejects.toThrow(
        "Cannot modify an archived campaign",
      );
    });
  });

  describe("updateCampaignPlayer", () => {
    test("changes a slot's role either way", async () => {
      const { session, campaign } = await setup();
      const { player } = await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Game Master");
      expect(
        (await CampaignPlayersMethods.updateCampaignPlayer(session, campaign.id, player.id, "Player Character")).player,
      ).toMatchObject({ id: player.id, role: "Player Character" });
      expect(
        (await CampaignPlayersMethods.updateCampaignPlayer(session, campaign.id, player.id, "Game Master")).player.role,
      ).toBe("Game Master");
    });

    test("never demotes the last Game Master", async () => {
      const { session, campaign, gmPlayer } = await setup();
      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(session, campaign.id, gmPlayer.id, "Player Character"),
      ).rejects.toThrow("Cannot demote the last Game Master");
    });

    test("invites someone into an empty slot, but not into a taken or already invited one", async () => {
      const { session, campaign } = await setup();
      const { user: invitee } = await createTestUser();
      const { user: late } = await createTestUser();
      const { player } = await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character");

      const { invite } = await CampaignPlayersMethods.updateCampaignPlayer(
        session,
        campaign.id,
        player.id,
        "Player Character",
        invitee.emailAddress,
      );
      expect(invite).toMatchObject({ userId: invitee.id, playerId: player.id, status: "Pending" });
      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(
          session,
          campaign.id,
          player.id,
          "Player Character",
          late.emailAddress,
        ),
      ).rejects.toThrow(ConflictError);

      const [taken] = await Players.create(db, {
        campaignId: campaign.id,
        userId: invitee.id,
        role: "Player Character",
      });
      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(
          session,
          campaign.id,
          taken.id,
          "Player Character",
          late.emailAddress,
        ),
      ).rejects.toThrow("Player already has a user assigned");
    });

    test("is for the Game Master, on a slot of that live campaign", async () => {
      const { session, campaign } = await setup();
      const { campaign: other } = await createTestCampaign(session.userId);
      const { player } = await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character");
      const { session: stranger } = await createTestUser();

      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(stranger, campaign.id, player.id, "Game Master"),
      ).rejects.toThrow(ForbiddenError);
      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(session, NIL_UUID, player.id, "Game Master"),
      ).rejects.toThrow(NotFoundError);
      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(session, campaign.id, NIL_UUID, "Game Master"),
      ).rejects.toThrow(NotFoundError);
      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(session, other.id, player.id, "Game Master"),
      ).rejects.toThrow(NotFoundError);
      await Campaigns.archive(db, { id: campaign.id });
      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(session, campaign.id, player.id, "Game Master"),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("removeCampaignPlayer", () => {
    test("deletes the slot and its invite, keeping their activities and logging the removal", async () => {
      const { session, campaign } = await setup();
      const { user: invitee } = await createTestUser();
      const { player } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character",
        invitee.emailAddress,
      );

      expect((await CampaignPlayersMethods.removeCampaignPlayer(session, campaign.id, player.id)).id).toBe(player.id);
      expect(await Players.findOne(db, { id: player.id })).toBeUndefined();
      expect(await Invites.findMany(db, { playerId: player.id })).toEqual([]);
      const { items } = await Activities.findMany(db, { userId: session.userId }, { limit: 100, page: 1 });
      expect(items.map((a) => `${a.targetTable} ${a.type}`).sort()).toEqual([
        "invites createCampaignInvite",
        "players addCampaignPlayer",
        "players removeCampaignPlayer",
      ]);
    });

    test("lets a player leave on their own, but never removes the last Game Master", async () => {
      const { session, campaign, gmPlayer } = await setup();
      const { user, session: playerSession } = await createTestUser();
      const [seat] = await Players.create(db, { campaignId: campaign.id, userId: user.id, role: "Player Character" });
      expect((await CampaignPlayersMethods.removeCampaignPlayer(playerSession, campaign.id, seat.id)).id).toBe(seat.id);

      await expect(CampaignPlayersMethods.removeCampaignPlayer(session, campaign.id, gmPlayer.id)).rejects.toThrow(
        "Cannot remove the last Game Master",
      );
    });

    test("is for the Game Master, on a slot of that live campaign", async () => {
      const { session, campaign } = await setup();
      const { campaign: other } = await createTestCampaign(session.userId);
      const { player } = await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character");
      const { session: stranger } = await createTestUser();

      await expect(CampaignPlayersMethods.removeCampaignPlayer(stranger, campaign.id, player.id)).rejects.toThrow(
        ForbiddenError,
      );
      await expect(CampaignPlayersMethods.removeCampaignPlayer(session, NIL_UUID, player.id)).rejects.toThrow(
        NotFoundError,
      );
      await expect(CampaignPlayersMethods.removeCampaignPlayer(session, campaign.id, NIL_UUID)).rejects.toThrow(
        NotFoundError,
      );
      await expect(CampaignPlayersMethods.removeCampaignPlayer(session, other.id, player.id)).rejects.toThrow(
        NotFoundError,
      );
      await Campaigns.archive(db, { id: campaign.id });
      await expect(CampaignPlayersMethods.removeCampaignPlayer(session, campaign.id, player.id)).rejects.toThrow(
        ForbiddenError,
      );
    });
  });
});
