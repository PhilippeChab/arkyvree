import { CampaignsMethods } from "@/server/services/CampaignsService.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { db } from "@/server/database/index.ts";
import { Campaigns, Players, Users } from "@/server/repositories/index.ts";
import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { campaignsInCampaign } from "@/drizzle/schema.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import type { Session } from "@/shared/relations.ts";
import { eq } from "drizzle-orm";
import { describe, test, expect } from "bun:test";

describe("CampaignsService", () => {
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

  const defaultWhere = {};
  const defaultPagination = { limit: 10, page: 1 };

  test("creates and restores campaigns beyond the former two-campaign limit", async () => {
    const { session } = await createTestUser();
    const ctx = await getCtx();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: `Capacity campaign ${i}`,
        description: "Test",
        rulesetId: ctx.rulesetId,
      });
      ids.push(campaign.id);
    }
    await CampaignsMethods.archiveCampaign(session, ids[0]);
    await CampaignsMethods.unarchiveCampaign(session, ids[0]);
    expect(await Campaigns.count(db, { userId: session.userId })).toBe(3);
  });

  describe("getMyCampaigns", () => {
    test("should return empty items when user has no campaigns", async () => {
      const { session } = await createTestUser();

      const result = await CampaignsMethods.getMyCampaigns(session, defaultWhere, defaultPagination);

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(result.items.length).toBe(0);
      expect(result.page).toBe(1);
      expect(result.nextPage).toBeUndefined();
    });

    test("should return campaigns where user is a player", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      // Create a campaign (automatically makes user a GM)
      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: "Test Campaign",
        description: "Test description",
        rulesetId: ctx.rulesetId,
      });

      const result = await CampaignsMethods.getMyCampaigns(session, defaultWhere, defaultPagination);

      expect(result.items.length).toBeGreaterThan(0);
      const foundCampaign = result.items.find((c) => c.id === campaign.id);
      expect(foundCampaign).toBeDefined();
      expect(foundCampaign?.name).toBe("Test Campaign");
    });

    test("should return correct player count with multiple players", async () => {
      const { session } = await createTestUser();
      const { user: user2 } = await createTestUser();
      const { user: user3 } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: "Multi Player Campaign",
        description: "Test player count",
        rulesetId: ctx.rulesetId,
      });

      // Add two more players
      await Players.create(db, { userId: user2.id, campaignId: campaign.id, role: "Player Character" });
      await Players.create(db, { userId: user3.id, campaignId: campaign.id, role: "Player Character" });

      const result = await CampaignsMethods.getMyCampaigns(session, defaultWhere, defaultPagination);
      const foundCampaign = result.items.find((c) => c.id === campaign.id);

      expect(foundCampaign).toBeDefined();
      expect(foundCampaign!.currentPlayers).toBe(3);
    });

    test("should paginate results", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      // Create 3 campaigns
      for (let i = 0; i < 3; i++) {
        await CampaignsMethods.createCampaign(session, {
          name: `Campaign ${i}`,
          description: `Description ${i}`,
          rulesetId: ctx.rulesetId,
        });
      }

      // Request page 1 with limit 2
      const page1 = await CampaignsMethods.getMyCampaigns(session, defaultWhere, { limit: 2, page: 1 });
      expect(page1.items.length).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.nextPage).toBe(2);

      // Request page 2
      const page2 = await CampaignsMethods.getMyCampaigns(session, defaultWhere, { limit: 2, page: 2 });
      expect(page2.items.length).toBe(1);
      expect(page2.page).toBe(2);
      expect(page2.nextPage).toBeUndefined();
    });

    test("should filter by search", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      await CampaignsMethods.createCampaign(session, {
        name: "Dragon Quest",
        description: "A quest about dragons",
        rulesetId: ctx.rulesetId,
      });

      await CampaignsMethods.createCampaign(session, {
        name: "Goblin Wars",
        description: "A war with goblins",
        rulesetId: ctx.rulesetId,
      });

      const result = await CampaignsMethods.getMyCampaigns(
        session,
        { search: "Dragon" },
        defaultPagination,
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe("Dragon Quest");
    });

    test("should filter by visibility (active only)", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: "Active Campaign",
        description: "Still active",
        rulesetId: ctx.rulesetId,
      });

      const { campaign: archivedCampaign } = await CampaignsMethods.createCampaign(session, {
        name: "Archived Campaign",
        description: "Will be archived",
        rulesetId: ctx.rulesetId,
      });

      await CampaignsMethods.archiveCampaign(session, archivedCampaign.id);

      // Active only (default)
      const activeResult = await CampaignsMethods.getMyCampaigns(
        session,
        { visibility: Visibility.UnarchivedOnly },
        defaultPagination,
      );

      expect(activeResult.items.length).toBe(1);
      expect(activeResult.items[0].id).toBe(campaign.id);
    });

    test("should filter by visibility (archived only)", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      await CampaignsMethods.createCampaign(session, {
        name: "Active Campaign",
        description: "Still active",
        rulesetId: ctx.rulesetId,
      });

      const { campaign: archivedCampaign } = await CampaignsMethods.createCampaign(session, {
        name: "Archived Campaign",
        description: "Will be archived",
        rulesetId: ctx.rulesetId,
      });

      await CampaignsMethods.archiveCampaign(session, archivedCampaign.id);

      const archivedResult = await CampaignsMethods.getMyCampaigns(
        session,
        { visibility: Visibility.ArchivedOnly },
        defaultPagination,
      );

      expect(archivedResult.items.length).toBe(1);
      expect(archivedResult.items[0].id).toBe(archivedCampaign.id);
    });
  });

  describe("getCampaignById", () => {
    test("should return campaign by id", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const { campaign: created } = await CampaignsMethods.createCampaign(
        session,
        {
          name: "Test Campaign",
          description: "Test description",
          rulesetId: ctx.rulesetId,
        }
      );

      const campaign = await CampaignsMethods.getCampaignById(session, created.id);

      expect(campaign).toBeDefined();
      expect(campaign.id).toBe(created.id);
      expect(campaign.name).toBe("Test Campaign");
      expect(campaign.description).toBe("Test description");
      expect(campaign.currentUserRole).toBe("Game Master");
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignsMethods.getCampaignById(session, fakeCampaignId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createCampaign", () => {
    test("should create a campaign and make creator a Game Master", async () => {
      const { user, session } = await createTestUser();
      const ctx = await getCtx();

      const campaignData = {
        name: "New Campaign",
        description: "A new test campaign",
        rulesetId: ctx.rulesetId,
      };

      const result = await CampaignsMethods.createCampaign(
        session,
        campaignData
      );

      expect(result.campaign).toBeDefined();
      expect(result.campaign.name).toBe(campaignData.name);
      expect(result.campaign.description).toBe(campaignData.description);
      expect(result.campaign.rulesetId).toBe(campaignData.rulesetId);

      expect(result.player).toBeDefined();
      expect(result.player.userId).toBe(user.id);
      expect(result.player.campaignId).toBe(result.campaign.id);
      expect(result.player.role).toBe("Game Master");
    });

    test("should create campaign with minimal data", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const result = await CampaignsMethods.createCampaign(session, {
        name: "Minimal Campaign",
        description: "",
        rulesetId: ctx.rulesetId,
      });

      expect(result.campaign).toBeDefined();
      expect(result.campaign.name).toBe("Minimal Campaign");
      expect(result.player).toBeDefined();
      expect(result.player.role).toBe("Game Master");
    });
  });

  describe("updateCampaign", () => {
    test("should update campaign name and description", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      // Create campaign first
      const { campaign: created } = await CampaignsMethods.createCampaign(
        session,
        {
          name: "Original Name",
          description: "Original description",
          rulesetId: ctx.rulesetId,
        }
      );

      // Update it
      const updated = await CampaignsMethods.updateCampaign(
        session,
        created.id,
        {
          name: "Updated Name",
          description: "Updated description",
        }
      );

      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe("Updated description");
      expect(updated.id).toBe(created.id);
    });

    test("should update only name when description not provided", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const { campaign: created } = await CampaignsMethods.createCampaign(
        session,
        {
          name: "Original Name",
          description: "Original description",
          rulesetId: ctx.rulesetId,
        }
      );

      const updated = await CampaignsMethods.updateCampaign(
        session,
        created.id,
        {
          name: "Updated Name",
        }
      );

      expect(updated.name).toBe("Updated Name");
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignsMethods.updateCampaign(session, fakeCampaignId, {
          name: "Test",
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError for non-member user", async () => {
      const { session: ownerSession } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
        name: "GM Only",
        description: "Test",
        rulesetId: ctx.rulesetId,
      });

      await expect(
        CampaignsMethods.updateCampaign(otherSession, campaign.id, { name: "Hacked" })
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError for Player Character role", async () => {
      const { session: ownerSession } = await createTestUser();
      const { user: player, session: playerSession } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
        name: "GM Only",
        description: "Test",
        rulesetId: ctx.rulesetId,
      });

      await Players.create(db, {
        userId: player.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      await expect(
        CampaignsMethods.updateCampaign(playerSession, campaign.id, { name: "Hacked" })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("archiveCampaign", () => {
    test("should archive a campaign", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      // Create campaign first
      const { campaign: created } = await CampaignsMethods.createCampaign(
        session,
        {
          name: "To Archive",
          description: "Will be archived",
          rulesetId: ctx.rulesetId,
        }
      );

      // Archive it
      const archived = await CampaignsMethods.archiveCampaign(
        session,
        created.id
      );

      expect(archived).toBeDefined();
      expect(archived.id).toBe(created.id);
      expect(archived.deletedAt).toBeDefined();
      expect(archived.deletedAt).not.toBeNull();
    });

    test("does not cascade-archive players when archiving campaign", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: "Campaign with Players",
        description: "Will be archived",
        rulesetId: ctx.rulesetId,
      });

      await CampaignsMethods.archiveCampaign(session, campaign.id);

      // Players stay live — they're unreachable from the list view but
      // membership lookups on direct navigation still resolve them.
      const players = await Players.findMany(db, { campaignId: campaign.id });
      expect(players.length).toBeGreaterThan(0);
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignsMethods.archiveCampaign(session, fakeCampaignId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError for non-member user", async () => {
      const { session: ownerSession } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
        name: "GM Only",
        description: "Test",
        rulesetId: ctx.rulesetId,
      });

      await expect(
        CampaignsMethods.archiveCampaign(otherSession, campaign.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError for Player Character role", async () => {
      const { session: ownerSession } = await createTestUser();
      const { user: player, session: playerSession } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
        name: "GM Only",
        description: "Test",
        rulesetId: ctx.rulesetId,
      });

      await Players.create(db, {
        userId: player.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      await expect(
        CampaignsMethods.archiveCampaign(playerSession, campaign.id)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("hardDeleteCampaign", () => {
    test("hard-deletes an archived campaign and cascades players", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: "To Delete",
        description: "Will be hard-deleted",
        rulesetId: ctx.rulesetId,
      });
      await CampaignsMethods.archiveCampaign(session, campaign.id);

      await CampaignsMethods.hardDeleteCampaign(session, campaign.id);

      const stillThere = await db
        .select({ id: campaignsInCampaign.id })
        .from(campaignsInCampaign)
        .where(eq(campaignsInCampaign.id, campaign.id));
      expect(stillThere.length).toBe(0);

      // Players cascade via FK on campaign delete.
      const players = await Players.findMany(db, { campaignId: campaign.id });
      expect(players.length).toBe(0);
    });

    test("throws NotFoundError when campaign is not archived", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: "Active",
        description: "Not archived",
        rulesetId: ctx.rulesetId,
      });

      await expect(
        CampaignsMethods.hardDeleteCampaign(session, campaign.id),
      ).rejects.toThrow(NotFoundError);
    });

    test("throws ForbiddenError when caller is not the GM", async () => {
      const { session: ownerSession } = await createTestUser();
      const { user: player, session: playerSession } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
        name: "GM Only Hard Delete",
        description: "Test",
        rulesetId: ctx.rulesetId,
      });
      await Players.create(db, {
        userId: player.id,
        campaignId: campaign.id,
        role: "Player Character",
      });
      await CampaignsMethods.archiveCampaign(ownerSession, campaign.id);

      await expect(
        CampaignsMethods.hardDeleteCampaign(playerSession, campaign.id),
      ).rejects.toThrow(ForbiddenError);

      const stillThere = await Campaigns.findOne(db, { id: campaign.id }, Visibility.All);
      expect(stillThere).toBeDefined();
    });
  });

  describe("unarchiveCampaign", () => {
    test("unarchive flips deletedAt back and shows campaign in active list", async () => {
      const { session } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(session, {
        name: "To Unarchive",
        description: "Will be unarchived",
        rulesetId: ctx.rulesetId,
      });

      await CampaignsMethods.archiveCampaign(session, campaign.id);

      const archivedResult = await CampaignsMethods.getMyCampaigns(
        session,
        { visibility: Visibility.ArchivedOnly },
        defaultPagination,
      );
      expect(archivedResult.items.find((c) => c.id === campaign.id)).toBeDefined();

      const unarchived = await CampaignsMethods.unarchiveCampaign(session, campaign.id);

      expect(unarchived).toBeDefined();
      expect(unarchived.id).toBe(campaign.id);
      expect(unarchived.deletedAt).toBeNull();

      const activeResult = await CampaignsMethods.getMyCampaigns(
        session,
        { visibility: Visibility.UnarchivedOnly },
        defaultPagination,
      );
      expect(activeResult.items.find((c) => c.id === campaign.id)).toBeDefined();
    });

    test("should throw NotFoundError for non-existent campaign", async () => {
      const { session } = await createTestUser();
      const fakeCampaignId = "00000000-0000-0000-0000-000000000000";

      await expect(
        CampaignsMethods.unarchiveCampaign(session, fakeCampaignId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError for non-member user", async () => {
      const { session: ownerSession } = await createTestUser();
      const { session: otherSession } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
        name: "GM Only",
        description: "Test",
        rulesetId: ctx.rulesetId,
      });

      await CampaignsMethods.archiveCampaign(ownerSession, campaign.id);

      await expect(
        CampaignsMethods.unarchiveCampaign(otherSession, campaign.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError for Player Character role", async () => {
      const { session: ownerSession } = await createTestUser();
      const { user: player, session: playerSession } = await createTestUser();
      const ctx = await getCtx();

      const { campaign } = await CampaignsMethods.createCampaign(ownerSession, {
        name: "GM Only",
        description: "Test",
        rulesetId: ctx.rulesetId,
      });

      await Players.create(db, {
        userId: player.id,
        campaignId: campaign.id,
        role: "Player Character",
      });

      await CampaignsMethods.archiveCampaign(ownerSession, campaign.id);

      await expect(
        CampaignsMethods.unarchiveCampaign(playerSession, campaign.id)
      ).rejects.toThrow(ForbiddenError);
    });
  });

});
