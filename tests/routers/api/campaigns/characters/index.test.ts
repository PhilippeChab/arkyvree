import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("campaigns characters", () => {
  const api = testClient<Application>(application);
  const headers = { cookie: "session-id=00000000-0000-4000-8000-000000000123" };

  let seedCtx: SeedContext;
  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

  // Helper to create a campaign, a character, and return all necessary IDs
  async function createTestData() {
    const ctx = await getCtx();
    const rulesetId = ctx.rulesetId;
    const raceId = ctx.raceMap.pc["Human"];

    // Build abilities from seed context
    const abilities: Record<string, number> = {};
    for (const id of Object.values(ctx.abilityMap)) {
      abilities[id] = 10;
    }

    // Create campaign (creator is automatically added as a player)
    const campaignResponse = await api.api.campaigns.$post(
      {
        json: {
          name: `Test Campaign ${Math.random().toString(36).substr(2, 9)}`,
          description: "A test campaign for characters testing",
          rulesetId,
        },
      },
      { headers },
    );

    if (!campaignResponse.ok) {
      const error = await campaignResponse.json();
      throw new Error(`Failed to create test campaign: ${error.message}`);
    }

    const { campaign } = await campaignResponse.json();

    // Create a character
    const characterResponse = await api.api.characters.$post(
      {
        json: {
          rulesetId,
          raceId,
          name: `Test Character ${Math.random().toString(36).substr(2, 9)}`,
          xp: 0,
          alignment: "True Neutral" as const,
          abilities,
          age: 25,
          gender: "Male" as const,
          height: "180",
          weight: "80",
        },
      },
      { headers },
    );

    if (!characterResponse.ok) {
      const error = await characterResponse.json();
      throw new Error(`Failed to create test character: ${error.message}`);
    }

    const character = await characterResponse.json();

    return {
      campaignId: campaign.id,
      characterId: character.id,
      rulesetId,
      raceId,
      abilities,
    };
  }

  test("should link a character to a campaign and list it", async () => {
    const { campaignId, characterId } = await createTestData();

    // Link the character to the campaign
    const linkResponse = await api.api.campaigns[":id"].characters.$post(
      {
        param: { id: campaignId },
        json: { characterId },
      },
      { headers },
    );

    if (!linkResponse.ok) {
      const error = await linkResponse.json();
      throw new Error(`Failed to link character: ${error.message}`);
    }

    expect(linkResponse.status).toBe(201);

    const linkedCharacter = await linkResponse.json();
    expect(linkedCharacter).toBeDefined();
    expect(linkedCharacter.characterId).toBe(characterId);

    // List characters in the campaign and verify it appears
    const listResponse = await api.api.campaigns[":id"].characters.$get(
      {
        param: { id: campaignId },
        query: { limit: "10", page: "1" },
      },
      { headers },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to list campaign characters: ${error.message}`);
    }

    const result = await listResponse.json();
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.page).toBe(1);
    expect(result.items.length).toBeGreaterThanOrEqual(1);

    const found = result.items.find(
      (item: { id: string }) => item.id === characterId,
    );
    expect(found).toBeDefined();
  });

  test("should link a character with explicit visibility", async () => {
    const { campaignId, characterId } = await createTestData();

    const linkResponse = await api.api.campaigns[":id"].characters.$post(
      {
        param: { id: campaignId },
        json: { characterId, visibility: "Public" as const },
      },
      { headers },
    );

    if (!linkResponse.ok) {
      const error = await linkResponse.json();
      throw new Error(`Failed to link character with visibility: ${error.message}`);
    }

    expect(linkResponse.status).toBe(201);

    const linkedCharacter = await linkResponse.json();
    expect(linkedCharacter).toBeDefined();
    expect(linkedCharacter.characterId).toBe(characterId);
    expect(linkedCharacter.visibility).toBe("Public");
  });

  test("should reject unauthenticated GET request", async () => {
    const { campaignId } = await createTestData();

    const response = await api.api.campaigns[":id"].characters.$get({
      param: { id: campaignId },
      query: { limit: "10", page: "1" },
    });

    expect(response.status).toBe(401);
  });

  test("should reject unauthenticated POST request", async () => {
    const { campaignId, characterId } = await createTestData();

    const response = await api.api.campaigns[":id"].characters.$post({
      param: { id: campaignId },
      json: { characterId },
    });

    expect(response.status).toBe(401);
  });

  test("should reject POST with missing characterId", async () => {
    const { campaignId } = await createTestData();

    const response = await api.api.campaigns[":id"].characters.$post(
      {
        param: { id: campaignId },
        json: {} as never,
      },
      { headers },
    );

    expect(response.status).toBe(400);
  });

  test("should reject POST with invalid characterId", async () => {
    const { campaignId } = await createTestData();

    const response = await api.api.campaigns[":id"].characters.$post(
      {
        param: { id: campaignId },
        json: { characterId: "not-a-uuid" },
      },
      { headers },
    );

    expect(response.status).toBe(400);
  });

  test("should handle non-existent campaign for POST", async () => {
    const { characterId } = await createTestData();

    const response = await api.api.campaigns[":id"].characters.$post(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
        json: { characterId },
      },
      { headers },
    );

    expect(response.status >= 400).toBe(true);
  });

  test("should prevent linking the same character twice", async () => {
    const { campaignId, characterId } = await createTestData();

    // Link the character the first time
    const firstLink = await api.api.campaigns[":id"].characters.$post(
      {
        param: { id: campaignId },
        json: { characterId },
      },
      { headers },
    );

    if (!firstLink.ok) {
      const error = await firstLink.json();
      throw new Error(`Failed to link character: ${error.message}`);
    }

    expect(firstLink.status).toBe(201);

    // Try to link the same character again
    const secondLink = await api.api.campaigns[":id"].characters.$post(
      {
        param: { id: campaignId },
        json: { characterId },
      },
      { headers },
    );

    expect(secondLink.status >= 400).toBe(true);
  });

  test("should handle pagination", async () => {
    const { campaignId, rulesetId, raceId, abilities } = await createTestData();

    // Create and link multiple characters
    for (let i = 0; i < 3; i++) {
      const charResponse = await api.api.characters.$post(
        {
          json: {
            rulesetId,
            raceId,
            name: `Paginated Char ${i} ${Math.random().toString(36).substr(2, 9)}`,
            xp: 0,
            alignment: "True Neutral" as const,
            abilities,
            age: 20 + i,
            gender: "Male" as const,
            height: "180",
            weight: "80",
          },
        },
        { headers },
      );

      if (!charResponse.ok) {
        const error = await charResponse.json();
        throw new Error(`Failed to create character ${i}: ${error.message}`);
      }

      const character = await charResponse.json();

      const linkResponse = await api.api.campaigns[":id"].characters.$post(
        {
          param: { id: campaignId },
          json: { characterId: character.id },
        },
        { headers },
      );

      if (!linkResponse.ok) {
        const error = await linkResponse.json();
        throw new Error(`Failed to link character ${i}: ${error.message}`);
      }
    }

    // Request with small page size
    const page1Response = await api.api.campaigns[":id"].characters.$get(
      {
        param: { id: campaignId },
        query: { limit: "2", page: "1" },
      },
      { headers },
    );

    if (!page1Response.ok) {
      const error = await page1Response.json();
      throw new Error(`Failed to get page 1: ${error.message}`);
    }

    const page1 = await page1Response.json();
    expect(page1).toBeDefined();
    expect(page1.items.length).toBeLessThanOrEqual(2);
    expect(page1.page).toBe(1);

    // If there are more items, nextPage should be defined
    if (page1.items.length === 2 && page1.nextPage) {
      const page2Response = await api.api.campaigns[":id"].characters.$get(
        {
          param: { id: campaignId },
          query: { limit: "2", page: "2" },
        },
        { headers },
      );

      if (!page2Response.ok) {
        const error = await page2Response.json();
        throw new Error(`Failed to get page 2: ${error.message}`);
      }

      const page2 = await page2Response.json();
      expect(page2).toBeDefined();
      expect(page2.page).toBe(2);
      expect(page2.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("should return empty list for campaign with no linked characters", async () => {
    const { campaignId } = await createTestData();

    const response = await api.api.campaigns[":id"].characters.$get(
      {
        param: { id: campaignId },
        query: { limit: "10", page: "1" },
      },
      { headers },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get campaign characters: ${error.message}`);
    }

    const result = await response.json();
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBe(0);
    expect(result.page).toBe(1);
  });
});
