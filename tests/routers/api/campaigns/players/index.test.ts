import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("campaigns players", () => {
  const api = testClient<Application>(application);

  let seedCtx: SeedContext;
  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

  // Helper to create test campaign
  async function createTestCampaign() {
    const ctx = await getCtx();

    // Create campaign
    const campaignResponse = await api.api.campaigns.$post(
      {
        json: {
          name: `Test Campaign ${Math.random().toString(36).substr(2, 9)}`,
          description: "A test campaign for players testing",
          rulesetId: ctx.rulesetId,
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      }
    );

    if (!campaignResponse.ok) {
      const error = await campaignResponse.json();
      throw new Error(`Failed to create test campaign: ${error.message}`);
    }

    const { campaign } = await campaignResponse.json();
    return campaign.id;
  }

  test("should get list of campaign players", async () => {
      const campaignId = await createTestCampaign();

      const response = await api.api.campaigns[":id"].players.$get(
        {
          param: { id: campaignId },
          query: { limit: "10", page: "1" },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get campaign players: ${error.message}`);
      }

      const result = await response.json();
      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.page).toBe(1);
    });

  test("should add a different player to a campaign", async () => {
      const campaignId = await createTestCampaign();

      // Use a different user ID since the campaign creator is already a player
      const playerData = {
        email: "testuser1@example.com", // Use TestUser1
        role: "Player Character" as const,
      };

      const response = await api.api.campaigns[":id"].players.$post(
        {
          param: { id: campaignId },
          json: playerData,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to add player to campaign: ${error.message}`);
      }

      const result = await response.json();
      expect(result).toBeDefined();
      // Handle new response structure - service returns { player } or { player, invite }
      if ("player" in result) {
        // Check if an invite was created
        if ("invite" in result) {
          expect(result.invite, "Should create invite when email is provided").toBeDefined();
        }
      } else {
        // This should not happen with the new structure
        throw new Error("Unexpected response structure");
      }
    });

  test("should verify player was added to campaign", async () => {
      const campaignId = await createTestCampaign();

      // First add a player
      const playerData = {
        email: "testuser1@example.com",
        role: "Player Character" as const,
      };

      const addResponse = await api.api.campaigns[":id"].players.$post(
        {
          param: { id: campaignId },
          json: playerData,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      if (!addResponse.ok) {
        const error = await addResponse.json();
        throw new Error(`Failed to add player: ${error.message}`);
      }

      const addResult = await addResponse.json();
      const playerId = addResult.player.id;

      // Now get the players list
      const response = await api.api.campaigns[":id"].players.$get(
        {
          param: { id: campaignId },
          query: { limit: "10", page: "1" },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get campaign players: ${error.message}`);
      }

      const result = await response.json();
      expect(result).toBeDefined();
      expect(result.items).toBeDefined();

      // Check if our test player slot was created (should be unlinked since we sent an invite)
      const hasTestPlayerSlot = result.items.some(
        (player: { id: string }) => player.id === playerId,
      );
      expect(hasTestPlayerSlot).toBe(true);
    });

  test("should remove a player from a campaign", async () => {
      const campaignId = await createTestCampaign();

      // First add a player
      const playerData = {
        email: "testuser1@example.com",
        role: "Player Character" as const,
      };

      const addResponse = await api.api.campaigns[":id"].players.$post(
        {
          param: { id: campaignId },
          json: playerData,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      if (!addResponse.ok) {
        const error = await addResponse.json();
        throw new Error(`Failed to add player: ${error.message}`);
      }

      const addResult = await addResponse.json();
      const playerId = addResult.player.id;

      // Now remove the player
      const response = await api.api.campaigns[":id"].players[
        ":playerId"
      ].$delete(
        {
          param: { id: campaignId, playerId },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Failed to remove player from campaign: ${error.message}`,
        );
      }

      const result = await response.json();
      expect(result).toBeDefined();
    });

  test("should reject unauthenticated requests", async () => {
      const campaignId = await createTestCampaign();

      const response = await api.api.campaigns[":id"].players.$get({
        param: { id: campaignId },
        query: { limit: "10", page: "1" },
      });
      expect(response.status).toBe(401);
    });

  test("should handle non-existent campaign", async () => {
      const response = await api.api.campaigns[":id"].players.$get(
        {
          param: { id: "00000000-0000-0000-0000-000000000000" },
          query: { limit: "10", page: "1" },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      expect(response.status).toBe(404);
    });

  test(
      "should validate player addition with missing email",
      async () => {
        const campaignId = await createTestCampaign();

        const validData = {
          role: "Player Character" as const,
          // email is now optional - this should create an empty player slot
        };

        const response = await api.api.campaigns[":id"].players.$post(
          {
            param: { id: campaignId },
            json: validData,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          });

        // Should succeed and create an empty player slot
        expect(response.status).toBe(200);

        const result = await response.json();
        expect(result).toBeDefined();
        // Should return { player } without invite
        if ("player" in result) {
          expect(result.player).toBeDefined();
          // When no email provided, invite should be null
          expect(result.invite).toBe(null);
        }
      });

  test("should create email-only invite for non-existent user email", async () => {
      const campaignId = await createTestCampaign();

      const data = {
        email: "nonexistent@example.com",
        role: "Player Character" as const,
      };

      const response = await api.api.campaigns[":id"].players.$post(
        {
          param: { id: campaignId },
          json: data,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      // Should succeed and create an email-only invite
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toBeDefined();
      if ("invite" in result) {
        expect(result.invite).toBeDefined();
        expect(result.invite!.email).toBe("nonexistent@example.com");
        expect(result.invite!.userId).toBeNull();
      }
    });

  test("should handle non-existent player removal", async () => {
      const campaignId = await createTestCampaign();

      const response = await api.api.campaigns[":id"].players[
        ":playerId"
      ].$delete(
        {
          param: {
            id: campaignId,
            playerId: "00000000-0000-0000-0000-000000000000",
          },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      expect(response.status >= 400).toBe(true);
    });

  test("should prevent duplicate player addition", async () => {
      const campaignId = await createTestCampaign();

      // First, add a user to create a pending invite
      const playerData = {
        email: "testuser2@example.com", // Use a different user email
        role: "Player Character" as const,
      };

      const firstResponse = await api.api.campaigns[":id"].players.$post(
        {
          param: { id: campaignId },
          json: playerData,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      // First addition should succeed
      expect(firstResponse.status).toBe(200);

      // Now try to add the same user again - this should fail
      const secondResponse = await api.api.campaigns[":id"].players.$post(
        {
          param: { id: campaignId },
          json: playerData,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        });

      // Should fail since this user already has a pending invite
      expect(secondResponse.status >= 400).toBe(true);
    });
  });
