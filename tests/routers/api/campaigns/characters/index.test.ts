import { sql } from "drizzle-orm";
import { Characters, Players, Users, PlayerCharacters, Sessions } from "@/server/repositories/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { generatePdfTask } from "@/server/jobs/generatePdf.tsx";
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

  for (const visibility of ["Partial", "Public"] as const) {
    test(`${visibility} hides private notes and share tokens from other players`, async () => {
      const { campaignId, characterId } = await createTestData();
      const owner = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
      const player = (await Players.findOne(db, { campaignId, userId: owner.userId }))!;
      const viewer = (await Users.findOne(db, { emailAddress: "testuser2@example.com" }))!;
      const [viewerSession] = await Sessions.create(db, { userId: viewer.id });
      await Players.create(db, { campaignId, userId: viewer.id, role: "Player Character" });
      await PlayerCharacters.create(db, { playerId: player.id, characterId, visibility });
      const shareToken = crypto.randomUUID();
      await Characters.update(db, { privateNotes: "Secret GM notes", shareToken }, { id: characterId });
      const response = await api.api.campaigns[":id"].characters[":characterId"].$get(
        { param: { id: campaignId, characterId } },
        { headers: { cookie: `session-id=${viewerSession.id}` } },
      );
      expect(response.status).toBe(200);
      if (!response.ok) throw new Error("Campaign character request failed");
      const body = await response.json();
      expect(body.shareToken).toBeNull();
      expect(body.identity.background.privateNotes).toBe("");
      expect(JSON.stringify(body)).not.toContain("Secret GM notes");
      expect(JSON.stringify(body)).not.toContain(shareToken);
      if (visibility === "Partial") {
        expect(body.equipment).toEqual([]);
        expect(body.virtualFeats).toEqual([]);
        expect(body.virtualPowers).toEqual([]);
        expect(body.skillBudget).toEqual({ available: 0, spent: 0, total: 0 });
        expect(body.spellTags).toEqual({});
        expect(body.validation).toEqual({ valid: true, issues: [] });
        expect(body.bonded).toEqual({});
      }
      const ownResponse = await api.api.campaigns[":id"].characters[":characterId"].$get(
        { param: { id: campaignId, characterId } }, { headers },
      );
      if (!ownResponse.ok) throw new Error("Owner request failed");
      const ownBody = await ownResponse.json();
      expect(ownBody.identity.background.privateNotes).toBe("Secret GM notes");
      expect(ownBody.shareToken).toBe(shareToken);
    });
  }

  describe("POST /:id/characters/:characterId/pdf", () => {
    // Links the creator's character as a regular player's, and adds testuser2
    // to the campaign with `role`, returning a session for them.
    async function joinAs(role: "Game Master" | "Player Character") {
      const { campaignId, characterId } = await createTestData();
      const owner = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
      const ownerPlayer = (await Players.findOne(db, { campaignId, userId: owner.userId }))!;
      await Players.update(db, { role: "Player Character" }, { id: ownerPlayer.id });
      await PlayerCharacters.create(db, { playerId: ownerPlayer.id, characterId, visibility: "Private" });
      const member = (await Users.findOne(db, { emailAddress: "testuser2@example.com" }))!;
      const [memberSession] = await Sessions.create(db, { userId: member.id });
      const [memberPlayer] = await Players.create(db, { campaignId, userId: member.id, role });
      return { campaignId, characterId, member, memberPlayer, memberHeaders: { cookie: `session-id=${memberSession.id}` } };
    }

    async function requestPdf(campaignId: string, characterId: string, requestHeaders: { cookie: string }) {
      return api.api.campaigns[":id"].characters[":characterId"].pdf.$post(
        { param: { id: campaignId, characterId } },
        { headers: requestHeaders },
      );
    }

    async function getDetail(campaignId: string, characterId: string, requestHeaders: { cookie: string }) {
      const response = await api.api.campaigns[":id"].characters[":characterId"].$get(
        { param: { id: campaignId, characterId } },
        { headers: requestHeaders },
      );
      if (!response.ok) throw new Error("Campaign character request failed");
      return response.json();
    }

    async function queuedPdfPayload(characterId: string) {
      const jobs = await db.execute(
        sql`SELECT payload FROM graphile_worker._private_jobs WHERE payload->>'characterId' = ${characterId}`,
      );
      expect(jobs.rows.length).toBe(1);
      return jobs.rows[0].payload as Record<string, unknown>;
    }

    const workerHelpers = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    } as unknown as Parameters<typeof generatePdfTask>[1];

    test("lets the Game Master export a player's character", async () => {
      const { campaignId, characterId, member, memberHeaders } = await joinAs("Game Master");

      const detail = await getDetail(campaignId, characterId, memberHeaders);
      expect(detail.canEdit).toBe(false);
      expect(detail.canDownloadPdf).toBe(true);

      const response = await requestPdf(campaignId, characterId, memberHeaders);
      expect(response.status).toBe(202);
      expect(await queuedPdfPayload(characterId)).toMatchObject({ userId: member.id, characterId, campaignId });
    });

    test("lets the character's owner export it from the campaign", async () => {
      const { campaignId, characterId } = await joinAs("Game Master");

      const detail = await getDetail(campaignId, characterId, headers);
      expect(detail.canDownloadPdf).toBe(true);

      const response = await requestPdf(campaignId, characterId, headers);
      expect(response.status).toBe(202);
    });

    test("links the export's activity to the campaign character page", async () => {
      const { campaignId, characterId, member, memberHeaders } = await joinAs("Game Master");

      const response = await requestPdf(campaignId, characterId, memberHeaders);
      expect(response.status).toBe(202);

      const activity = await db.query.activitiesInAccount.findFirst({
        where: (t, { and, eq }) => and(eq(t.userId, member.id), eq(t.targetId, characterId), eq(t.type, "generatePdf")),
      });
      const resolved = await api.api.activities.resolve[":targetTable"][":targetId"].$get(
        { param: { targetTable: activity!.targetTable, targetId: characterId } },
        { headers: memberHeaders },
      );
      if (!resolved.ok) throw new Error("Activity resolve request failed");
      expect((await resolved.json()).url).toBe(`/campaigns/${campaignId}/characters/${characterId}`);
    });

    test("the worker skips the export when the Game Master left the campaign before it ran", async () => {
      const { campaignId, characterId, member, memberPlayer, memberHeaders } = await joinAs("Game Master");

      const response = await requestPdf(campaignId, characterId, memberHeaders);
      expect(response.status).toBe(202);
      await Players.delete(db, { id: memberPlayer.id });

      await generatePdfTask(await queuedPdfPayload(characterId), workerHelpers);

      const notification = await db.query.notificationsInAccount.findFirst({
        where: (t, { and, eq }) => and(eq(t.recipientId, member.id), eq(t.targetId, characterId)),
      });
      expect(notification).toMatchObject({ type: "pdfFailed", targetTable: "player_characters" });
      const exported = await db.query.exportsInAccount.findFirst({ where: (t, { eq }) => eq(t.userId, member.id) });
      expect(exported).toBeUndefined();
    });

    test("refuses other players", async () => {
      const { campaignId, characterId, memberHeaders } = await joinAs("Player Character");

      const response = await requestPdf(campaignId, characterId, memberHeaders);
      expect(response.status).toBe(404);
    });

    test("refuses non-members", async () => {
      const { campaignId, characterId } = await joinAs("Game Master");
      const outsider = (await Users.findOne(db, { emailAddress: "testuser3@example.com" }))!;
      const [outsiderSession] = await Sessions.create(db, { userId: outsider.id });

      const response = await requestPdf(campaignId, characterId, { cookie: `session-id=${outsiderSession.id}` });
      expect(response.status).toBe(404);
    });

    // Archiving makes a campaign read-only; its character pages stay viewable.
    test("still lets the Game Master export from an archived campaign", async () => {
      const { campaignId, characterId, memberHeaders } = await joinAs("Game Master");
      const archived = await api.api.campaigns[":id"].$delete({ param: { id: campaignId } }, { headers: memberHeaders });
      expect(archived.status).toBe(200);

      const response = await requestPdf(campaignId, characterId, memberHeaders);
      expect(response.status).toBe(202);
    });

    test("returns 404 for a character not linked to the campaign", async () => {
      const { campaignId, characterId } = await createTestData();

      const response = await requestPdf(campaignId, characterId, headers);
      expect(response.status).toBe(404);
    });
  });

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
