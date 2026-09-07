import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("campaigns", () => {
  const api = testClient<Application>(application);

  test("should get list of campaigns for authenticated user", async () => {
    const response = await api.api.campaigns.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123", // Bjorn's session
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get campaigns: ${error.message}`);
    }

    const result = await response.json();
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  test("should get specific campaign details", async () => {
    // First get the list to get a campaign ID
    const listResponse = await api.api.campaigns.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get campaigns: ${error.message}`);
    }

    const result = await listResponse.json();

    if (result.items.length === 0) {
      // Create a campaign first if none exist
      const rulesetsResponse = await api.api.rulesets.$get(
        {
          query: {},
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!rulesetsResponse.ok) {
        const error = await rulesetsResponse.json();
        throw new Error(`Failed to get rulesets: ${error.message}`);
      }

      const rulesets = await rulesetsResponse.json();
      const rulesetId = rulesets.items[0].id;

      const newCampaign = {
        name: "Test Campaign for Details",
        description: "A test campaign for details testing",
        rulesetId: rulesetId,
      };

      const createResponse = await api.api.campaigns.$post(
        {
          json: newCampaign,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(`Failed to create campaign: ${error.message}`);
      }

      const creationResult = await createResponse.json();

      // Now get the specific campaign
      const response = await api.api.campaigns[":id"].$get(
        {
          param: { id: creationResult.campaign.id },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!response.ok) {
        const error = await response.json() as { message?: string; error?: string };
        throw new Error(`Failed to get campaign: ${error.message || error.error}`);
      }

      const campaign = await response.json();
      expect(campaign).toBeDefined();
      expect(campaign.id).toBe(creationResult.campaign.id);
      expect(campaign.name).toBeDefined();
    } else {
      const campaignId = result.items[0].id;

      // Then get the specific campaign
      const response = await api.api.campaigns[":id"].$get(
        {
          param: { id: campaignId },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get campaign: ${error.message}`);
      }

      const campaign = await response.json();
      expect(campaign).toBeDefined();
      expect(campaign.id).toBe(campaignId);
      expect(campaign.name).toBeDefined();
    }
  });

  test("should create a new campaign", async () => {
    // First get a ruleset ID to use for the campaign
    const rulesetsResponse = await api.api.rulesets.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!rulesetsResponse.ok) {
      const error = await rulesetsResponse.json();
      throw new Error(`Failed to get rulesets: ${error.message}`);
    }

    const rulesets = await rulesetsResponse.json();
    const rulesetId = rulesets.items[0].id;

    const newCampaign = {
      name: "Test Campaign",
      description: "A test campaign for automated testing",
      rulesetId: rulesetId,
    };

    const response = await api.api.campaigns.$post(
      {
        json: newCampaign,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create campaign: ${error.message}`);
    }

    const creationResult = await response.json();
    expect(creationResult).toBeDefined();
    expect(creationResult.campaign.name).toBe(newCampaign.name);
    expect(creationResult.campaign.description).toBe(newCampaign.description);
    expect(creationResult.campaign.rulesetId).toBe(newCampaign.rulesetId);
  });

  test("should update a campaign", async () => {
    // First get a ruleset ID to use for the campaign
    const rulesetsResponse = await api.api.rulesets.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!rulesetsResponse.ok) {
      const error = await rulesetsResponse.json();
      throw new Error(`Failed to get rulesets: ${error.message}`);
    }

    const rulesets = await rulesetsResponse.json();
    const rulesetId = rulesets.items[0].id;

    // First create a campaign to update
    const newCampaign = {
      name: "Test Campaign for Update",
      description: "A test campaign for update testing",
      rulesetId: rulesetId,
    };

    const createResponse = await api.api.campaigns.$post(
      {
        json: newCampaign,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create campaign: ${error.message}`);
    }

    const creationResult = await createResponse.json();

    // Now update it
    const updateData = {
      name: "Updated Test Campaign",
      description: "Updated description",
    };

    const updateResponse = await api.api.campaigns[":id"].$put(
      {
        param: { id: creationResult.campaign.id },
        json: updateData,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      throw new Error(`Failed to update campaign: ${error.message}`);
    }

    const updatedCampaign = await updateResponse.json();
    expect(updatedCampaign).toBeDefined();
    expect(updatedCampaign.name).toBe(updateData.name);
    expect(updatedCampaign.description).toBe(updateData.description);
  });

  test("should archive a campaign", async () => {
    // First get a ruleset ID to use for the campaign
    const rulesetsResponse = await api.api.rulesets.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!rulesetsResponse.ok) {
      const error = await rulesetsResponse.json();
      throw new Error(`Failed to get rulesets: ${error.message}`);
    }

    const rulesets = await rulesetsResponse.json();
    const rulesetId = rulesets.items[0].id;

    // First create a campaign to archive
    const newCampaign = {
      name: "Test Campaign for Archive",
      description: "A test campaign for archive testing",
      rulesetId: rulesetId,
    };

    const createResponse = await api.api.campaigns.$post(
      {
        json: newCampaign,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create campaign: ${error.message}`);
    }

    const creationResult = await createResponse.json();

    // Now archive it
    const archiveResponse = await api.api.campaigns[":id"].$delete(
      {
        param: { id: creationResult.campaign.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!archiveResponse.ok) {
      const error = await archiveResponse.json();
      throw new Error(`Failed to archive campaign: ${error.message}`);
    }

    const result = await archiveResponse.json();
    expect(result.message).toBe("Campaign archived successfully");

    // Verify the campaign is no longer in the active list
    const listResponse = await api.api.campaigns.$get(
      {
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get campaigns: ${error.message}`);
    }

    const listResult = await listResponse.json();
    const archivedCampaign = listResult.items.find((c) => c.id === creationResult.campaign.id);
    expect(archivedCampaign).toBe(undefined);
  });

  test("should reject unauthenticated requests", async () => {
    const response = await api.api.campaigns.$get({ query: {} });
    expect(response.status).toBe(401);
  });

  test("should handle non-existent campaign", async () => {
    const response = await api.api.campaigns[":id"].$get(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(response.status).toBe(404);
  });

  test("should validate campaign creation with missing fields", async () => {
    const invalidCampaign = {
      description: "Missing name field",
    };

    const response = await api.api.campaigns.$post(
      {
        json: invalidCampaign as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(response.status).toBe(400);
  });

  test("should validate campaign creation with invalid ruleset ID", async () => {
    const invalidCampaign = {
      name: "Test Campaign",
      description: "Test description",
      rulesetId: "invalid-uuid",
    };

    const response = await api.api.campaigns.$post(
      {
        json: invalidCampaign,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(response.status).toBe(400);
  });
});
