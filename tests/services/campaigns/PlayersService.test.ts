import { db } from "@/server/database/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Campaigns, Invites, Players, Users } from "@/server/repositories/index.ts";
import { playersInCampaign } from "@/drizzle/schema.ts";
import { getTableName } from "drizzle-orm";
import { CampaignPlayersMethods } from "@/server/services/campaigns/PlayersService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("PlayersService", () => {
  let seedCtx: SeedContext;

  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

  // Helper to create test session
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

  // Helper to create test user
  async function createTestUser() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    return { user, session: createTestSession(user.id) };
  }

  // Helper to create test campaign
  async function createTestCampaign(userId: string) {
    const ctx = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const campaigns = await Campaigns.create(db, {
      name: `Test Campaign ${uniqueId}`,
      description: "Test campaign for players testing",
      rulesetId: ctx.rulesetId,
    });
    const campaign = campaigns[0];

    // Create GM player for the campaign
    const players = await Players.create(db, {
      campaignId: campaign.id,
      userId,
      role: "Game Master",
    });
    const player = players[0];

    return { campaign, player };
  }

  describe("getCampaignPlayers", () => {
    test("should return paginated players for a valid campaign", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const result = await CampaignPlayersMethods.getCampaignPlayers(session, campaign.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      const foundPlayer = result.items.find((p) => p.userId === user.id);
      expect(foundPlayer).toBeDefined();
      expect(foundPlayer?.role).toBe("Game Master");
    });

    test("should throw ForbiddenError for non-member", async () => {
      const { user } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      await expect(
        CampaignPlayersMethods.getCampaignPlayers(otherSession, campaign.id, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should paginate results correctly", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      // Add extra players (campaign already has 1 GM)
      await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character");
      await CampaignPlayersMethods.addCampaignPlayer(session, campaign.id, "Player Character");

      // Fetch with limit 2 - should have nextPage since there are 3 players
      const page1 = await CampaignPlayersMethods.getCampaignPlayers(session, campaign.id, {}, { limit: 2, page: 1 });
      expect(page1.items.length).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.nextPage).toBe(2);

      // Fetch page 2
      const page2 = await CampaignPlayersMethods.getCampaignPlayers(session, campaign.id, {}, { limit: 2, page: 2 });
      expect(page2.items.length).toBe(1);
      expect(page2.page).toBe(2);
      expect(page2.nextPage).toBeUndefined();
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignPlayersMethods.getCampaignPlayers(session, fakeCampaignId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("addCampaignPlayer", () => {
    test("should add a Game Master player without email", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const result = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Game Master"
      );

      expect(result.player).toBeDefined();
      expect(result.player.campaignId).toBe(campaign.id);
      expect(result.player.role).toBe("Game Master");
      expect(result.player.userId).toBeNull();
      expect(result.invite).toBeNull();
    });

    test("should add a Player Character without email", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const result = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character"
      );

      expect(result.player).toBeDefined();
      expect(result.player.campaignId).toBe(campaign.id);
      expect(result.player.role).toBe("Player Character");
      expect(result.player.userId).toBeNull();
      expect(result.invite).toBeNull();
    });

    test("should add a player and create an invite when email is provided", async () => {
      const { user, session } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const result = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character",
        invitedUser.emailAddress
      );

      expect(result.player).toBeDefined();
      expect(result.player.campaignId).toBe(campaign.id);
      expect(result.player.role).toBe("Player Character");
      expect(result.player.userId).toBeNull(); // Player not assigned until invite is accepted

      expect(result.invite).toBeDefined();
      expect(result.invite?.userId).toBe(invitedUser.id);
      expect(result.invite?.playerId).toBe(result.player.id);
      expect(result.invite?.status).toBe("Pending");
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignPlayersMethods.addCampaignPlayer(
          session,
          fakeCampaignId,
          "Game Master"
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateCampaignPlayer", () => {
    test("should update player role from Game Master to Player Character", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const { player: createdPlayer } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Game Master"
      );

      const result = await CampaignPlayersMethods.updateCampaignPlayer(
        session,
        campaign.id,
        createdPlayer.id,
        "Player Character"
      );

      expect(result.player).toBeDefined();
      expect(result.player.id).toBe(createdPlayer.id);
      expect(result.player.role).toBe("Player Character");
    });

    test("should update player role from Player Character to Game Master", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const { player: createdPlayer } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character"
      );

      const result = await CampaignPlayersMethods.updateCampaignPlayer(
        session,
        campaign.id,
        createdPlayer.id,
        "Game Master"
      );

      expect(result.player).toBeDefined();
      expect(result.player.id).toBe(createdPlayer.id);
      expect(result.player.role).toBe("Game Master");
    });

    test("should create invite when updating player with email", async () => {
      const { user, session } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const { player: createdPlayer } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character"
      );

      const result = await CampaignPlayersMethods.updateCampaignPlayer(
        session,
        campaign.id,
        createdPlayer.id,
        "Player Character",
        invitedUser.emailAddress
      );

      expect(result.player).toBeDefined();
      expect(result.invite).toBeDefined();
      expect(result.invite?.userId).toBe(invitedUser.id);
      expect(result.invite?.playerId).toBe(createdPlayer.id);
      expect(result.invite?.status).toBe("Pending");
    });

    test("should throw ConflictError when player already has a user assigned", async () => {
      const { user, session } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      // Create player with user already assigned
      const players = await Players.create(db, {
        campaignId: campaign.id,
        userId: invitedUser.id,
        role: "Player Character",
      });
      const playerWithUser = players[0];

      const { user: anotherUser } = await createTestUser();

      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(
          session,
          campaign.id,
          playerWithUser.id,
          "Player Character",
          anotherUser.emailAddress
        )
      ).rejects.toThrow(ConflictError);
    });

    test("should throw ConflictError when player already has a pending invite", async () => {
      const { user, session } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const { player } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character",
        invitedUser.emailAddress
      );

      const { user: anotherUser } = await createTestUser();

      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(
          session,
          campaign.id,
          player.id,
          "Player Character",
          anotherUser.emailAddress
        )
      ).rejects.toThrow(ConflictError);
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";
      const fakePlayerId = "00000000-0000-0000-0000-000000000001";

      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(
          session,
          fakeCampaignId,
          fakePlayerId,
          "Game Master"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent player in campaign", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const fakePlayerId = "00000000-0000-0000-0000-000000000001";

      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(
          session,
          campaign.id,
          fakePlayerId,
          "Game Master"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when player belongs to different campaign", async () => {
      const { user, session } = await createTestUser();
      const { campaign: campaign1 } = await createTestCampaign(user.id);
      const { campaign: campaign2 } = await createTestCampaign(user.id);

      const { player } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign1.id,
        "Player Character"
      );

      await expect(
        CampaignPlayersMethods.updateCampaignPlayer(
          session,
          campaign2.id,
          player.id,
          "Game Master"
        )
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("removeCampaignPlayer", () => {
    test("should remove a player from campaign", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const { player } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character"
      );

      const removedPlayer = await CampaignPlayersMethods.removeCampaignPlayer(
        session,
        campaign.id,
        player.id
      );

      expect(removedPlayer).toBeDefined();
      expect(removedPlayer.id).toBe(player.id);

      // Verify player is hard deleted
      const deletedPlayer = await Players.findOne(db, { id: player.id });
      expect(deletedPlayer).toBeUndefined();
    });

    test("should archive associated invites when removing player", async () => {
      const { user, session } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const { player } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character",
        invitedUser.emailAddress
      );

      await CampaignPlayersMethods.removeCampaignPlayer(
        session,
        campaign.id,
        player.id
      );

      // Verify invite is archived
      const invites = await Invites.findMany(db, { playerId: player.id });
      expect(invites.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";
      const fakePlayerId = "00000000-0000-0000-0000-000000000001";

      await expect(
        CampaignPlayersMethods.removeCampaignPlayer(
          session,
          fakeCampaignId,
          fakePlayerId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent player", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);
      const fakePlayerId = "00000000-0000-0000-0000-000000000001";

      await expect(
        CampaignPlayersMethods.removeCampaignPlayer(
          session,
          campaign.id,
          fakePlayerId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when player belongs to different campaign", async () => {
      const { user, session } = await createTestUser();
      const { campaign: campaign1 } = await createTestCampaign(user.id);
      const { campaign: campaign2 } = await createTestCampaign(user.id);

      const { player } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign1.id,
        "Player Character"
      );

      await expect(
        CampaignPlayersMethods.removeCampaignPlayer(
          session,
          campaign2.id,
          player.id
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should cascade delete activities for the player", async () => {
      const { user, session } = await createTestUser();
      const { campaign } = await createTestCampaign(user.id);

      const { player } = await CampaignPlayersMethods.addCampaignPlayer(
        session,
        campaign.id,
        "Player Character"
      );

      // Verify addCampaignPlayer activity exists
      const activitiesBefore = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(playersInCampaign) },
        { limit: 100, page: 1 },
      );
      const addActivity = activitiesBefore.items.find(
        (a) => a.targetId === player.id && a.type === "addCampaignPlayer",
      );
      expect(addActivity).toBeDefined();

      await CampaignPlayersMethods.removeCampaignPlayer(session, campaign.id, player.id);

      // Verify add activity was deleted but remove activity was created
      const activitiesAfter = await Activities.findMany(
        db,
        { userId: session.userId, targetTable: getTableName(playersInCampaign) },
        { limit: 100, page: 1 },
      );
      const remaining = activitiesAfter.items.filter((a) => a.targetId === player.id);
      expect(remaining.length).toBe(1);
      expect(remaining[0].type).toBe("removeCampaignPlayer");
    });
  });
});
