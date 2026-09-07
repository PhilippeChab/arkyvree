import CampaignsPolicy from "@/server/services/policies/CampaignsPolicy.ts";
import { db } from "@/server/database/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { Users, Campaigns, Players } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("CampaignsPolicy", () => {
  let seedCtx: SeedContext;
  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

  const createSession = (userId: string): Session => ({
    id: `session-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Helper to create test user
  async function createTestUser() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });

    return users[0];
  }

  // Helper to create test campaign
  async function createTestCampaign(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const campaigns = await Campaigns.create(db, {
      name: `Test Campaign ${uniqueId}`,
      description: "Test campaign",
      rulesetId,
    });

    return campaigns[0];
  }

  describe("canCreate", () => {
    test("should always return true", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      const policy = new CampaignsPolicy(session, campaign);

      expect(policy.canCreate()).toBe(true);
    });
  });

  describe("canRead", () => {
    test("should always return true", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      const policy = new CampaignsPolicy(session, campaign);

      expect(policy.canRead()).toBe(true);
    });
  });

  describe("canUpdate", () => {
    test("should return true for Game Master", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      // Add user as Game Master
      await Players.create(db, {
        userId: user.id,
        campaignId: campaign.id,
        role: "Game Master",
      });

      const policy = new CampaignsPolicy(session, campaign);

      const result = await policy.canUpdate();
      expect(result).toBe(true);
    });

    test("should throw ForbiddenError for Player Character", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      // Add user as Player Character
      await Players.create(db, {
        userId: user.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const policy = new CampaignsPolicy(session, campaign);

      await expect(policy.canUpdate()).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when user is not a player in campaign", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      // Don't add user as player

      const policy = new CampaignsPolicy(session, campaign);

      await expect(policy.canUpdate()).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when user is in different campaign", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const session = createSession(user2.id);
      const ctx = await getCtx();
      const campaign1 = await createTestCampaign(ctx.rulesetId);
      const campaign2 = await createTestCampaign(ctx.rulesetId);

      // Add user1 as GM to campaign1
      await Players.create(db, {
        userId: user1.id,
        campaignId: campaign1.id,
        role: "Game Master",
      });

      // Add user2 as GM to campaign2
      await Players.create(db, {
        userId: user2.id,
        campaignId: campaign2.id,
        role: "Game Master",
      });

      // Check if user2 can update campaign1 (should throw)
      const policy = new CampaignsPolicy(session, campaign1);

      await expect(policy.canUpdate()).rejects.toThrow(ForbiddenError);
    });
  });

  describe("canDelete", () => {
    test("should return true for Game Master", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      // Add user as Game Master
      await Players.create(db, {
        userId: user.id,
        campaignId: campaign.id,
        role: "Game Master",
      });

      const policy = new CampaignsPolicy(session, campaign);

      const result = await policy.canDelete();
      expect(result).toBe(true);
    });

    test("should throw ForbiddenError for Player Character", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      // Add user as Player Character
      await Players.create(db, {
        userId: user.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      const policy = new CampaignsPolicy(session, campaign);

      await expect(policy.canDelete()).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when user is not a player in campaign", async () => {
      const user = await createTestUser();
      const session = createSession(user.id);
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      const policy = new CampaignsPolicy(session, campaign);

      await expect(policy.canDelete()).rejects.toThrow(ForbiddenError);
    });
  });

  describe("multiple Game Masters", () => {
    test("should allow all Game Masters to update", async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const ctx = await getCtx();
      const campaign = await createTestCampaign(ctx.rulesetId);

      // Add both users as Game Masters
      await Players.create(db, {
        userId: user1.id,
        campaignId: campaign.id,
        role: "Game Master",
      });

      await Players.create(db, {
        userId: user2.id,
        campaignId: campaign.id,
        role: "Game Master",
      });

      // Check user1
      const policy1 = new CampaignsPolicy(createSession(user1.id), campaign);
      expect(await policy1.canUpdate()).toBe(true);
      expect(await policy1.canDelete()).toBe(true);

      // Check user2
      const policy2 = new CampaignsPolicy(createSession(user2.id), campaign);
      expect(await policy2.canUpdate()).toBe(true);
      expect(await policy2.canDelete()).toBe(true);
    });
  });
});
