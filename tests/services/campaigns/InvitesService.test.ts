import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Campaigns, Invites, Players, Users } from "@/server/repositories/index.ts";
import { CampaignInvitesMethods } from "@/server/services/campaigns/InvitesService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("InvitesService", () => {
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

  // Helper to create test campaign with GM player
  async function createTestCampaign(userId: string, rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const campaigns = await Campaigns.create(db, {
      name: `Test Campaign ${uniqueId}`,
      description: "Test campaign for invites testing",
      rulesetId,
    });
    const campaign = campaigns[0];

    const players = await Players.create(db, {
      userId,
      campaignId: campaign.id,
      role: "Game Master",
    });
    const player = players[0];

    return { campaign, player };
  }

  // Helper to create empty player slot
  async function createEmptyPlayerSlot(campaignId: string) {
    const players = await Players.create(db, {
      campaignId,
      role: "Player Character",
    });

    return players[0];
  }

  describe("getUserInvites", () => {
    test("should return empty array when user has no invites", async () => {
      const { user } = await createTestUser();

      const invites = await CampaignInvitesMethods.getUserInvites(user.id);

      expect(invites).toBeDefined();
      expect(Array.isArray(invites)).toBe(true);
      expect(invites.length).toBe(0);
    });

    test("should return invites for a user with campaign relation", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      // Create an empty player slot
      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      // Create an invite
      await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      const invites = await CampaignInvitesMethods.getUserInvites(invitedUser.id);

      expect(invites.length).toBeGreaterThan(0);
      const invite = invites[0];
      expect(invite.userId).toBe(invitedUser.id);
      expect(invite.playerId).toBe(emptySlot.id);
      expect(invite.status).toBe("Pending");
    });
  });

  describe("getCampaignInvite", () => {
    test("should return invite for the inviting user even after status changes", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser, session: invitedSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);
      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession, emptySlot, invitedUser.emailAddress,
      );

      // Pending
      const pending = await CampaignInvitesMethods.getCampaignInvite(invitedSession, invite.id);
      expect(pending.status).toBe("Pending");
      expect(pending.playersInCampaign?.campaignsInCampaign?.name).toBe(campaign.name);

      // Accepted — stale link should still resolve
      await CampaignInvitesMethods.acceptCampaignInvite(invitedSession, invite.id);
      const accepted = await CampaignInvitesMethods.getCampaignInvite(invitedSession, invite.id);
      expect(accepted.status).toBe("Accepted");
    });

    test("should surface archived campaign via deletedAt", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser, session: invitedSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);
      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession, emptySlot, invitedUser.emailAddress,
      );
      await Campaigns.archive(db, { id: campaign.id });

      const fetched = await CampaignInvitesMethods.getCampaignInvite(invitedSession, invite.id);
      expect(fetched.playersInCampaign?.campaignsInCampaign?.deletedAt).not.toBeNull();
    });

    test("should reject probing another user's invite id", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { session: strangerSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);
      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession, emptySlot, invitedUser.emailAddress,
      );

      await expect(
        CampaignInvitesMethods.getCampaignInvite(strangerSession, invite.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getCampaignInvites", () => {
    test("should return paginated invites for a campaign", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      const result = await CampaignInvitesMethods.getCampaignInvites(gmSession, campaign.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.page).toBe(1);
    });

    test("should paginate results correctly", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      // Create 3 invites
      for (let i = 0; i < 3; i++) {
        const { user: invitedUser } = await createTestUser();
        const slot = await createEmptyPlayerSlot(campaign.id);
        await CampaignInvitesMethods.createCampaignInvite(
          gmSession,
          slot,
          invitedUser.emailAddress
        );
      }

      const page1 = await CampaignInvitesMethods.getCampaignInvites(gmSession, campaign.id, {}, { limit: 2, page: 1 });
      expect(page1.items.length).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.nextPage).toBe(2);

      const page2 = await CampaignInvitesMethods.getCampaignInvites(gmSession, campaign.id, {}, { limit: 2, page: 2 });
      expect(page2.items.length).toBe(1);
      expect(page2.page).toBe(2);
      expect(page2.nextPage).toBeUndefined();
    });

    test("should throw ForbiddenError for non-member user", async () => {
      const { user: gmUser } = await createTestUser();
      const { session: nonMemberSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      await expect(
        CampaignInvitesMethods.getCampaignInvites(nonMemberSession, campaign.id, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignInvitesMethods.getCampaignInvites(session, fakeCampaignId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createCampaignInvite", () => {
    test("should create an invite for an empty player slot", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      expect(invite).toBeDefined();
      expect(invite.userId).toBe(invitedUser.id);
      expect(invite.playerId).toBe(emptySlot.id);
      expect(invite.status).toBe("Pending");
    });

    test("should throw NotFoundError when campaign does not exist", async () => {
      const { session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();

      const fakePlayer = {
        id: "player-id",
        campaignId: "00000000-0000-0000-0000-000000000000",
        userId: null,
        role: "Player Character" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await expect(
        CampaignInvitesMethods.createCampaignInvite(
          gmSession,
          fakePlayer,
          invitedUser.emailAddress
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should create an email-only invite when email does not match any user", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);
      const unknownEmail = "unknown-user@example.com";

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        unknownEmail
      );

      expect(invite).toBeDefined();
      expect(invite.email).toBe(unknownEmail);
      expect(invite.userId).toBeNull();
      expect(invite.playerId).toBe(emptySlot.id);
      expect(invite.status).toBe("Pending");
    });

    test("should throw ConflictError when user already has pending invite for player slot", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      // Create first invite
      await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      // Try to create duplicate invite
      await expect(
        CampaignInvitesMethods.createCampaignInvite(
          gmSession,
          emptySlot,
          invitedUser.emailAddress
        )
      ).rejects.toThrow(ConflictError);
    });

    test("should throw ConflictError when user already has a player slot in campaign", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: existingPlayer } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      // Create existing player for the user
      await Players.create(db, {
        userId: existingPlayer.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      await expect(
        CampaignInvitesMethods.createCampaignInvite(
          gmSession,
          emptySlot,
          existingPlayer.emailAddress
        )
      ).rejects.toThrow(ConflictError);
    });

    test("should throw ConflictError when user already has pending invite for campaign", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const firstSlot = await createEmptyPlayerSlot(campaign.id);
      const secondSlot = await createEmptyPlayerSlot(campaign.id);

      // Create first invite
      await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        firstSlot,
        invitedUser.emailAddress
      );

      // Try to create second invite for same campaign, different slot
      await expect(
        CampaignInvitesMethods.createCampaignInvite(
          gmSession,
          secondSlot,
          invitedUser.emailAddress
        )
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("acceptCampaignInvite", () => {
    test("should accept a pending invite and assign player to user", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser, session: invitedSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      const acceptedInvite = await CampaignInvitesMethods.acceptCampaignInvite(
        invitedSession,
        invite.id
      );

      expect(acceptedInvite).toBeDefined();
      expect(acceptedInvite.status).toBe("Accepted");

      // Verify player was assigned
      const updatedPlayer = await Players.findOne(db, { id: emptySlot.id });
      expect(updatedPlayer?.userId).toBe(invitedUser.id);
    });

    test("should throw NotFoundError when invite does not exist", async () => {
      const { session } = await createTestUser();
      const fakeInviteId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignInvitesMethods.acceptCampaignInvite(session, fakeInviteId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when invite belongs to different user", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      await expect(
        CampaignInvitesMethods.acceptCampaignInvite(otherSession, invite.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ConflictError when invite is not pending", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser, session: invitedSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      // Accept once
      await CampaignInvitesMethods.acceptCampaignInvite(invitedSession, invite.id);

      // Try to accept again
      await expect(
        CampaignInvitesMethods.acceptCampaignInvite(invitedSession, invite.id)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("rejectCampaignInvite", () => {
    test("should reject a pending invite", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser, session: invitedSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      const rejectedInvite = await CampaignInvitesMethods.rejectCampaignInvite(
        invitedSession,
        invite.id
      );

      expect(rejectedInvite).toBeDefined();
      expect(rejectedInvite.status).toBe("Rejected");

      // Verify player was not assigned
      const updatedPlayer = await Players.findOne(db, { id: emptySlot.id });
      expect(updatedPlayer?.userId).toBeNull();
    });

    test("should throw NotFoundError when invite does not exist", async () => {
      const { session } = await createTestUser();
      const fakeInviteId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignInvitesMethods.rejectCampaignInvite(session, fakeInviteId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when invite belongs to different user", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      await expect(
        CampaignInvitesMethods.rejectCampaignInvite(otherSession, invite.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ConflictError when invite is not pending", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser, session: invitedSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      // Reject once
      await CampaignInvitesMethods.rejectCampaignInvite(invitedSession, invite.id);

      // Try to reject again
      await expect(
        CampaignInvitesMethods.rejectCampaignInvite(invitedSession, invite.id)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("revokeCampaignInvite", () => {
    test("should revoke a pending invite", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      const revokedInvite = await CampaignInvitesMethods.revokeCampaignInvite(
        gmSession,
        invite.id
      );

      expect(revokedInvite).toBeDefined();
      expect(revokedInvite.status).toBe("Revoked");
    });

    test("should throw NotFoundError when invite does not exist", async () => {
      const { session } = await createTestUser();
      const fakeInviteId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignInvitesMethods.revokeCampaignInvite(session, fakeInviteId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when player does not exist", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      // Archive the player to simulate deletion
      await Players.archive(db, { id: emptySlot.id });

      await expect(
        CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should allow revoke when campaign is archived (cleanup of stale invites)", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      await Campaigns.archive(db, { id: campaign.id });

      const revoked = await CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id);
      expect(revoked.status).toBe("Revoked");
    });

    test("should throw ConflictError when invite is not pending", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser, session: invitedSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      // Accept the invite
      await CampaignInvitesMethods.acceptCampaignInvite(invitedSession, invite.id);

      // Try to revoke accepted invite
      await expect(
        CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("backfillUserId", () => {
    test("should set userId on pending email-only invites matching the email", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);
      const email = `backfill-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create email-only invite (no matching user exists)
      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        email
      );

      expect(invite.userId).toBeNull();

      // Simulate a new user signing up with that email
      const newUsers = await Users.create(db, {
        emailAddress: email,
        password: "password1234",
      });
      const newUser = newUsers[0];

      // Backfill
      const backfilled = await Invites.backfillUserId(db, email, newUser.id);

      expect(backfilled.length).toBe(1);
      expect(backfilled[0].userId).toBe(newUser.id);
      expect(backfilled[0].id).toBe(invite.id);
    });

    test("should not update invites that already have a userId", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const { user: invitedUser } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);

      // Create an invite for an existing user (userId is set)
      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        invitedUser.emailAddress
      );

      expect(invite.userId).toBe(invitedUser.id);

      // Try to backfill with a different user — should not change anything
      const { user: otherUser } = await createTestUser();
      const backfilled = await Invites.backfillUserId(db, invitedUser.emailAddress, otherUser.id);

      expect(backfilled.length).toBe(0);
    });

    test("should not update non-pending invites", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);
      const email = `backfill-np-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create email-only invite
      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        emptySlot,
        email
      );

      // Revoke the invite so it's no longer Pending
      await CampaignInvitesMethods.revokeCampaignInvite(gmSession, invite.id);

      // Try to backfill — should not update revoked invite
      const newUsers = await Users.create(db, {
        emailAddress: email,
        password: "password1234",
      });
      const newUser = newUsers[0];

      const backfilled = await Invites.backfillUserId(db, email, newUser.id);
      expect(backfilled.length).toBe(0);
    });

    test("should backfill multiple pending invites for the same email", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const email = `multi-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create two campaigns with email-only invites
      const { campaign: campaign1 } = await createTestCampaign(gmUser.id, ctx.rulesetId);
      const slot1 = await createEmptyPlayerSlot(campaign1.id);
      await CampaignInvitesMethods.createCampaignInvite(gmSession, slot1, email);

      const { campaign: campaign2 } = await createTestCampaign(gmUser.id, ctx.rulesetId);
      const slot2 = await createEmptyPlayerSlot(campaign2.id);
      await CampaignInvitesMethods.createCampaignInvite(gmSession, slot2, email);

      // Create user and backfill
      const newUsers = await Users.create(db, { emailAddress: email, password: "password1234" });
      const newUser = newUsers[0];

      const backfilled = await Invites.backfillUserId(db, email, newUser.id);

      expect(backfilled.length).toBe(2);
      expect(backfilled.every((inv) => inv.userId === newUser.id)).toBe(true);
    });
  });

  describe("email-only invite flow after backfill", () => {
    test("should allow accepting an email-only invite after backfill", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);
      const email = `accept-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create email-only invite
      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession, emptySlot, email
      );

      expect(invite.userId).toBeNull();

      // Simulate user creation and backfill
      const newUsers = await Users.create(db, { emailAddress: email, password: "password1234" });
      const newUser = newUsers[0];
      await Invites.backfillUserId(db, email, newUser.id);

      // Now the user can accept the invite
      const newSession = createTestSession(newUser.id);
      const accepted = await CampaignInvitesMethods.acceptCampaignInvite(newSession, invite.id);

      expect(accepted.status).toBe("Accepted");

      // Verify player was assigned
      const updatedPlayer = await Players.findOne(db, { id: emptySlot.id });
      expect(updatedPlayer?.userId).toBe(newUser.id);
    });

    test("should allow rejecting an email-only invite after backfill", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);
      const email = `reject-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create email-only invite
      const invite = await CampaignInvitesMethods.createCampaignInvite(
        gmSession, emptySlot, email
      );

      // Simulate user creation and backfill
      const newUsers = await Users.create(db, { emailAddress: email, password: "password1234" });
      const newUser = newUsers[0];
      await Invites.backfillUserId(db, email, newUser.id);

      // Now the user can reject the invite
      const newSession = createTestSession(newUser.id);
      const rejected = await CampaignInvitesMethods.rejectCampaignInvite(newSession, invite.id);

      expect(rejected.status).toBe("Rejected");

      // Verify player was NOT assigned
      const updatedPlayer = await Players.findOne(db, { id: emptySlot.id });
      expect(updatedPlayer?.userId).toBeNull();
    });

    test("should return email-only invites in getUserInvites after backfill", async () => {
      const { user: gmUser, session: gmSession } = await createTestUser();
      const ctx = await getCtx();
      const { campaign } = await createTestCampaign(gmUser.id, ctx.rulesetId);

      const emptySlot = await createEmptyPlayerSlot(campaign.id);
      const email = `visible-${Math.random().toString(36).substr(2, 9)}@example.com`;

      // Create email-only invite
      await CampaignInvitesMethods.createCampaignInvite(
        gmSession, emptySlot, email
      );

      // Create user and backfill
      const newUsers = await Users.create(db, { emailAddress: email, password: "password1234" });
      const newUser = newUsers[0];
      await Invites.backfillUserId(db, email, newUser.id);

      // User should now see the invite
      const invites = await CampaignInvitesMethods.getUserInvites(newUser.id);
      expect(invites.length).toBe(1);
      expect(invites[0].playerId).toBe(emptySlot.id);
      expect(invites[0].status).toBe("Pending");
    });
  });
});
