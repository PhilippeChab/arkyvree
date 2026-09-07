import { db } from "@/server/database/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { Campaigns, Characters, Players, Rulesets, Users } from "@/server/repositories/index.ts";
import { DashboardMethods } from "@/server/services/DashboardService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("DashboardService", () => {
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

  async function createTestRuleset(userId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for dashboard testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId,
    });

    return rulesets[0];
  }

  async function createTestCharacter(userId: string) {
    const c = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const characters = await Characters.create(db, {
      name: `Test Character ${uniqueId}`,
      userId,
      rulesetId: c.rulesetId,
      raceId: c.raceMap.pc["Human"],
      xp: 0,
      alignment: "Neutral Good",
      age: 25,
      gender: "Male",
      height: "180",
      weight: "75",
    });

    return characters[0];
  }

  async function createTestCampaign(userId: string) {
    const c = await getCtx();
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const campaigns = await Campaigns.create(db, {
      name: `Test Campaign ${uniqueId}`,
      description: "Test campaign for dashboard testing",
      rulesetId: c.rulesetId,
    });

    const campaign = campaigns[0];

    await Players.create(db, {
      userId,
      campaignId: campaign.id,
      role: "Game Master",
    });

    return campaign;
  }

  describe("getMyStats", () => {
    test("should return zero stats for new user with no data", async () => {
      const { session } = await createTestUser();

      const stats = await DashboardMethods.getMyStats(session);

      expect(stats).toBeDefined();
      expect(stats.totalCharacters).toBe(0);
      expect(stats.totalCampaigns).toBe(0);
      expect(stats.totalRulesets).toBeGreaterThanOrEqual(0); // System may have existing rulesets
    });

    test("should count user's characters correctly", async () => {
      const { user, session } = await createTestUser();

      // Get initial stats
      const initialStats = await DashboardMethods.getMyStats(session);
      const initialCharacterCount = initialStats.totalCharacters;

      // Create characters
      await createTestCharacter(user.id);
      await createTestCharacter(user.id);
      await createTestCharacter(user.id);

      const stats = await DashboardMethods.getMyStats(session);

      expect(stats.totalCharacters).toBe(initialCharacterCount + 3);
    });

    test("should count user's campaigns correctly", async () => {
      const { user, session } = await createTestUser();

      // Get initial stats
      const initialStats = await DashboardMethods.getMyStats(session);
      const initialCampaignCount = initialStats.totalCampaigns;

      // Create campaigns
      await createTestCampaign(user.id);
      await createTestCampaign(user.id);

      const stats = await DashboardMethods.getMyStats(session);

      expect(stats.totalCampaigns).toBe(initialCampaignCount + 2);
    });

    test("should count all rulesets in the system", async () => {
      const { user, session } = await createTestUser();

      // Get initial ruleset count
      const initialStats = await DashboardMethods.getMyStats(session);
      const initialRulesetCount = initialStats.totalRulesets;

      // Create a ruleset
      await createTestRuleset(user.id);

      const stats = await DashboardMethods.getMyStats(session);

      expect(stats.totalRulesets).toBe(initialRulesetCount + 1);
    });

    test("should return correct stats with mixed data", async () => {
      const { user, session } = await createTestUser();

      // Get initial stats
      const initialStats = await DashboardMethods.getMyStats(session);

      // Create mixed data
      await createTestCharacter(user.id);
      await createTestCharacter(user.id);
      await createTestCampaign(user.id);
      await createTestRuleset(user.id);

      const stats = await DashboardMethods.getMyStats(session);

      expect(stats.totalCharacters).toBe(initialStats.totalCharacters + 2);
      expect(stats.totalCampaigns).toBe(initialStats.totalCampaigns + 1);
      expect(stats.totalRulesets).toBe(initialStats.totalRulesets + 1);
    });

    test("should only count user's own characters and campaigns", async () => {
      const { user: user1, session: session1 } = await createTestUser();
      const { user: user2, session: session2 } = await createTestUser();

      // Create data for user 1
      await createTestCharacter(user1.id);
      await createTestCampaign(user1.id);

      // Create data for user 2
      await createTestCharacter(user2.id);
      await createTestCharacter(user2.id);
      await createTestCampaign(user2.id);
      await createTestCampaign(user2.id);

      const stats1 = await DashboardMethods.getMyStats(session1);
      const stats2 = await DashboardMethods.getMyStats(session2);

      // User 1 should have 1 character and 1 campaign
      expect(stats1.totalCharacters).toBeGreaterThanOrEqual(1);
      expect(stats1.totalCampaigns).toBeGreaterThanOrEqual(1);

      // User 2 should have 2 characters and 2 campaigns
      expect(stats2.totalCharacters).toBeGreaterThanOrEqual(2);
      expect(stats2.totalCampaigns).toBeGreaterThanOrEqual(2);

      // Both should see the same total rulesets (system-wide count)
      expect(stats1.totalRulesets).toBe(stats2.totalRulesets);
    });

    test("should handle archived campaigns correctly", async () => {
      const { user, session } = await createTestUser();

      // Create campaigns
      const campaign1 = await createTestCampaign(user.id);

      // Get stats before archiving
      const statsBeforeArchive = await DashboardMethods.getMyStats(session);

      // Archive one campaign and its players
      await Campaigns.archive(db, { id: campaign1.id });
      await Players.archive(db, { campaignId: campaign1.id });

      // Get stats after archiving
      const statsAfterArchive = await DashboardMethods.getMyStats(session);

      // Should have one less campaign after archiving
      expect(statsAfterArchive.totalCampaigns).toBe(
        statsBeforeArchive.totalCampaigns - 1
      );
    });

    test("should handle archived characters correctly", async () => {
      const { user, session } = await createTestUser();

      // Create characters
      const character1 = await createTestCharacter(user.id);

      // Get stats before archiving
      const statsBeforeArchive = await DashboardMethods.getMyStats(session);

      // Archive one character
      await Characters.archive(db, { id: character1.id });

      // Get stats after archiving
      const statsAfterArchive = await DashboardMethods.getMyStats(session);

      // Should have one less character after archiving
      expect(statsAfterArchive.totalCharacters).toBe(
        statsBeforeArchive.totalCharacters - 1
      );
    });

    test("should return stats with all valid types", async () => {
      const { session } = await createTestUser();

      const stats = await DashboardMethods.getMyStats(session);

      expect(typeof stats.totalCharacters).toBe("number");
      expect(typeof stats.totalCampaigns).toBe("number");
      expect(typeof stats.totalRulesets).toBe("number");
      expect(stats.totalCharacters).toBeGreaterThanOrEqual(0);
      expect(stats.totalCampaigns).toBeGreaterThanOrEqual(0);
      expect(stats.totalRulesets).toBeGreaterThanOrEqual(0);
    });

    test("should handle multiple sequential calls consistently", async () => {
      const { user, session } = await createTestUser();

      await createTestCharacter(user.id);
      await createTestCampaign(user.id);

      const stats1 = await DashboardMethods.getMyStats(session);
      const stats2 = await DashboardMethods.getMyStats(session);

      expect(stats1.totalCharacters).toBe(stats2.totalCharacters);
      expect(stats1.totalCampaigns).toBe(stats2.totalCampaigns);
      expect(stats1.totalRulesets).toBe(stats2.totalRulesets);
    });
  });
});
