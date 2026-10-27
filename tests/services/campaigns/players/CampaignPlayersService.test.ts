import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { usersInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Campaigns, Invites, Players } from "@/server/repositories/index.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { createTestCampaign, inviteToSlot } from "@/tests/support/campaigns.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const firstPage = { limit: 10, page: 1 };

/** A new user's campaign, of which they're the only Game Master. */
async function setup() {
  const { user, session } = await createTestUser("gm");
  const { campaign, player: gmPlayer } = await createTestCampaign(user.id);
  return { user, session, campaign, gmPlayer };
}

describe("CampaignPlayersService", () => {
  describe("getPlayers", () => {
    test("lists and pages a campaign's players", async () => {
      const { user, session, campaign } = await setup();
      expect((await CampaignPlayersService.getPlayers(session, campaign.id, {}, firstPage)).items).toMatchObject([
        { userId: user.id, role: "Game Master" },
      ]);

      await CampaignPlayersService.addPlayer(session, campaign.id, "Player Character");
      await CampaignPlayersService.addPlayer(session, campaign.id, "Player Character");
      const page1 = await CampaignPlayersService.getPlayers(session, campaign.id, {}, { limit: 2, page: 1 });
      expect([page1.items.length, page1.nextPage]).toEqual([2, 2]);
      const page2 = await CampaignPlayersService.getPlayers(session, campaign.id, {}, { limit: 2, page: 2 });
      expect([page2.items.length, page2.nextPage]).toEqual([1, undefined]);
    });

    test("says when each player joined: its invite's acceptance, the first Game Master's slot's creation", async () => {
      const { session, campaign, gmPlayer } = await setup();
      const { player: slot } = await CampaignPlayersService.addPlayer(session, campaign.id, "Player Character");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const invite = await inviteToSlot(session, slot, invitee.emailAddress);
      const joinedAt = async () =>
        new Map(
          (await CampaignPlayersService.getPlayers(session, campaign.id, {}, firstPage)).items.map((p) => [
            p.id,
            p.joinedAt,
          ]),
        );
      expect((await joinedAt()).get(slot.id)).toBeNull();

      await CampaignInvitesService.acceptInvite(inviteeSession, invite.id);
      const joined = await joinedAt();
      expect(joined.get(slot.id)).toBe((await Invites.findOne(db, { id: invite.id }))?.updatedAt);
      expect(joined.get(gmPlayer.id)).toBe(gmPlayer.createdAt);
    });

    test("says which slot is its campaign's last Game Master, whom the server neither removes nor demotes", async () => {
      const { session, campaign, gmPlayer } = await setup();
      const lastGameMasters = async () =>
        (await CampaignPlayersService.getPlayers(session, campaign.id, {}, firstPage)).items
          .filter((player) => player.isLastGameMaster)
          .map((player) => player.id);
      const { player: slot } = await CampaignPlayersService.addPlayer(session, campaign.id, "Player Character");
      expect(await lastGameMasters()).toEqual([gmPlayer.id]);

      await CampaignPlayersService.updatePlayer(session, campaign.id, slot.id, "Game Master");
      expect(await lastGameMasters()).toEqual([]);
    });

    test("a slot whose user deleted their account has no Joined date, and isn't the last Game Master", async () => {
      const { session, campaign, gmPlayer } = await setup();
      const { player: slot } = await CampaignPlayersService.addPlayer(session, campaign.id, "Game Master");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const invite = await inviteToSlot(session, slot, invitee.emailAddress);
      await CampaignInvitesService.acceptInvite(inviteeSession, invite.id);
      // As deleting an account does: its slots archived, then its user gone
      await Players.archive(db, { userId: invitee.id });
      await db.delete(usersInAccount).where(eq(usersInAccount.id, invitee.id));

      const players = (await CampaignPlayersService.getPlayers(session, campaign.id, {}, firstPage)).items;
      expect(players.find((player) => player.id === slot.id)).toMatchObject({
        userId: null,
        joinedAt: null,
        isLastGameMaster: false,
      });
      expect(players.filter((player) => player.isLastGameMaster).map((player) => player.id)).toEqual([gmPlayer.id]);
    });

    test("answers a non-member as it answers a missing campaign", async () => {
      const { campaign } = await setup();
      const { session: stranger } = await createTestUser();
      expect(CampaignPlayersService.getPlayers(stranger, campaign.id, {}, firstPage)).rejects.toThrow(
        "Campaign not found",
      );
      expect(CampaignPlayersService.getPlayers(stranger, NIL_UUID, {}, firstPage)).rejects.toThrow(
        "Campaign not found",
      );
    });
  });

  describe("addPlayer", () => {
    test.each(["Game Master", "Player Character"] as const)("adds an empty %s slot", async (role) => {
      const { session, campaign } = await setup();
      const result = await CampaignPlayersService.addPlayer(session, campaign.id, role);
      expect(result).toMatchObject({ player: { campaignId: campaign.id, role, userId: null }, invite: null });
    });

    test("invites the owner of the email into the new slot", async () => {
      const { session, campaign } = await setup();
      const { user: invitee } = await createTestUser();
      const result = await CampaignPlayersService.addPlayer(
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
      const { user: member, session: memberSession } = await createTestUser();
      await Players.create(db, { campaignId: campaign.id, userId: member.id, role: "Player Character" });
      expect(CampaignPlayersService.addPlayer(memberSession, campaign.id, "Player Character")).rejects.toThrow(
        ForbiddenError,
      );
      expect(CampaignPlayersService.addPlayer(stranger, campaign.id, "Player Character")).rejects.toThrow(
        "Campaign not found",
      );
      expect(CampaignPlayersService.addPlayer(session, NIL_UUID, "Player Character")).rejects.toThrow(NotFoundError);
      await Campaigns.archive(db, { id: campaign.id });
      expect(CampaignPlayersService.addPlayer(session, campaign.id, "Player Character")).rejects.toThrow(
        "Cannot modify an archived campaign",
      );
    });
  });

  describe("updatePlayer", () => {
    test("changes a slot's role either way", async () => {
      const { session, campaign } = await setup();
      const { player } = await CampaignPlayersService.addPlayer(session, campaign.id, "Game Master");
      expect(
        (await CampaignPlayersService.updatePlayer(session, campaign.id, player.id, "Player Character")).player,
      ).toMatchObject({ id: player.id, role: "Player Character" });
      expect(
        (await CampaignPlayersService.updatePlayer(session, campaign.id, player.id, "Game Master")).player.role,
      ).toBe("Game Master");
    });

    test("demotes a Game Master while another is left, never the last", async () => {
      const { session, campaign, gmPlayer } = await setup();
      const { player } = await CampaignPlayersService.addPlayer(session, campaign.id, "Game Master");
      expect(
        (await CampaignPlayersService.updatePlayer(session, campaign.id, player.id, "Player Character")).player.role,
      ).toBe("Player Character");
      expect(
        CampaignPlayersService.updatePlayer(session, campaign.id, gmPlayer.id, "Player Character"),
      ).rejects.toThrow("Cannot demote the last Game Master");
    });

    test("invites someone into an empty slot, but not into a taken or already invited one", async () => {
      const { session, campaign } = await setup();
      const { user: invitee } = await createTestUser();
      const { user: late } = await createTestUser();
      const { player } = await CampaignPlayersService.addPlayer(session, campaign.id, "Player Character");

      const { invite } = await CampaignPlayersService.updatePlayer(
        session,
        campaign.id,
        player.id,
        "Player Character",
        invitee.emailAddress,
      );
      expect(invite).toMatchObject({ userId: invitee.id, playerId: player.id, status: "Pending" });
      expect(
        CampaignPlayersService.updatePlayer(session, campaign.id, player.id, "Player Character", late.emailAddress),
      ).rejects.toThrow(ConflictError);

      const [taken] = await Players.create(db, {
        campaignId: campaign.id,
        userId: invitee.id,
        role: "Player Character",
      });
      expect(
        CampaignPlayersService.updatePlayer(session, campaign.id, taken.id, "Player Character", late.emailAddress),
      ).rejects.toThrow("Player already has a user assigned");
    });

    test("is for the Game Master, on a slot of that live campaign", async () => {
      const { session, campaign } = await setup();
      const { campaign: other } = await createTestCampaign(session.userId);
      const { player } = await CampaignPlayersService.addPlayer(session, campaign.id, "Player Character");
      const { session: stranger } = await createTestUser();

      expect(CampaignPlayersService.updatePlayer(stranger, campaign.id, player.id, "Game Master")).rejects.toThrow(
        "Campaign not found",
      );
      expect(CampaignPlayersService.updatePlayer(session, NIL_UUID, player.id, "Game Master")).rejects.toThrow(
        NotFoundError,
      );
      expect(CampaignPlayersService.updatePlayer(session, campaign.id, NIL_UUID, "Game Master")).rejects.toThrow(
        NotFoundError,
      );
      expect(CampaignPlayersService.updatePlayer(session, other.id, player.id, "Game Master")).rejects.toThrow(
        NotFoundError,
      );
      await Campaigns.archive(db, { id: campaign.id });
      expect(CampaignPlayersService.updatePlayer(session, campaign.id, player.id, "Game Master")).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  describe("removePlayer", () => {
    test("deletes the slot and its invite, keeping their activities and logging the removal", async () => {
      const { session, campaign } = await setup();
      const { user: invitee } = await createTestUser();
      const { player } = await CampaignPlayersService.addPlayer(
        session,
        campaign.id,
        "Player Character",
        invitee.emailAddress,
      );

      expect((await CampaignPlayersService.removePlayer(session, campaign.id, player.id)).id).toBe(player.id);
      expect(await Players.findOne(db, { id: player.id })).toBeUndefined();
      expect(await Invites.findMany(db, { playerId: player.id })).toEqual([]);
      const { items } = await Activities.findPage(db, { userId: session.userId }, { limit: 100, page: 1 });
      expect(items.map((a) => `${a.targetType} ${a.type}`).sort()).toEqual([
        "invites createCampaignInvite",
        "players addCampaignPlayer",
        "players removeCampaignPlayer",
      ]);
    });

    test("lets a player leave on their own, but never removes the last Game Master", async () => {
      const { session, campaign, gmPlayer } = await setup();
      const { user, session: playerSession } = await createTestUser();
      const [seat] = await Players.create(db, { campaignId: campaign.id, userId: user.id, role: "Player Character" });
      expect((await CampaignPlayersService.removePlayer(playerSession, campaign.id, seat.id)).id).toBe(seat.id);

      expect(CampaignPlayersService.removePlayer(session, campaign.id, gmPlayer.id)).rejects.toThrow(
        "Cannot remove the last Game Master",
      );
    });

    test("is for the Game Master, on a slot of that live campaign", async () => {
      const { session, campaign } = await setup();
      const { campaign: other } = await createTestCampaign(session.userId);
      const { player } = await CampaignPlayersService.addPlayer(session, campaign.id, "Player Character");
      const { session: stranger } = await createTestUser();

      expect(CampaignPlayersService.removePlayer(stranger, campaign.id, player.id)).rejects.toThrow(
        "Campaign not found",
      );
      expect(CampaignPlayersService.removePlayer(stranger, campaign.id, NIL_UUID)).rejects.toThrow(
        "Campaign not found",
      );
      expect(CampaignPlayersService.removePlayer(session, NIL_UUID, player.id)).rejects.toThrow(NotFoundError);
      expect(CampaignPlayersService.removePlayer(session, campaign.id, NIL_UUID)).rejects.toThrow(NotFoundError);
      expect(CampaignPlayersService.removePlayer(session, other.id, player.id)).rejects.toThrow(NotFoundError);
      await Campaigns.archive(db, { id: campaign.id });
      expect(CampaignPlayersService.removePlayer(session, campaign.id, player.id)).rejects.toThrow(ForbiddenError);
    });
  });
});
