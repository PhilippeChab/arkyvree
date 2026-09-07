import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { db } from "@/server/database/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("characters", () => {
  const api = testClient<Application>(application);

  let seedCtx: SeedContext;

  async function getCtx(): Promise<SeedContext> {
    if (!seedCtx) {
      seedCtx = await getSeedContext(db);
    }
    return seedCtx;
  }

  test("should get list of characters for authenticated user", async () => {
    const response = await api.api.characters.$get(
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
      throw new Error(error.message);
    }

    const characters = await response.json() as { items: Array<{ id: string; name: string }>; page: number };
    expect(characters).toBeDefined();
    expect(characters.items).toBeDefined();
    expect(characters.page).toBe(1);
    // Bjorn should have at least one character
    expect(characters.items.length > 0).toBe(true);
  });

  test("should get specific character details", async () => {
    // First get the list to get a character ID
    const listResponse = await api.api.characters.$get(
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
      throw new Error(error.message);
    }

    const characters = await listResponse.json() as { items: Array<{ id: string }> };
    const characterId = characters.items[0].id;

    // Then get the specific character
    const response = await api.api.characters[":id"].$get(
      {
        param: { id: characterId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const character = await response.json();
    expect(character).toBeDefined();
    expect(character.id).toBe(characterId);
  });

  test("spell tags are present in API response for casters with domains/specializations", async () => {
    const listResponse = await api.api.characters.$get(
      { query: {} },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    const characters = await listResponse.json() as { items: Array<{ id: string; name: string }> };

    // Find Theron (Cleric with domains)
    const theron = characters.items.find((c) => c.name === "Theron Lightbringer");
    expect(theron).toBeDefined();

    const response = await api.api.characters[":id"].$get(
      { param: { id: theron!.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );
    const character = await response.json() as Record<string, unknown>;

    // spellTags should be in the response
    const spellTags = character.spellTags as Record<string, string[]>;
    expect(spellTags).toBeDefined();
    expect(Object.keys(spellTags).length).toBeGreaterThan(0);

    // Tags should only be for Theron's selected domains (Healing, Sun)
    const allTags = Object.values(spellTags).flat();
    const uniqueTags = [...new Set(allTags)];
    expect(uniqueTags).toContain("Healing Domain");
    expect(uniqueTags).toContain("Sun Domain");
    // Should NOT contain domains the character didn't select
    for (const tag of uniqueTags) {
      expect(tag === "Healing Domain" || tag === "Sun Domain").toBe(true);
    }

    // Verify at least some tagged power IDs exist in the class spell data
    const classes = character.classes as Record<string, { levels: Array<{ powers: Array<{ id: string }> }> }>;
    const allPowerIds = new Set(
      Object.values(classes).flatMap((klass) =>
        klass.levels.flatMap((level) => level.powers.map((p) => p.id)),
      ),
    );
    const taggedInClassData = Object.keys(spellTags).filter((id) => allPowerIds.has(id));
    expect(taggedInClassData.length).toBeGreaterThan(0);
  });

  test("should enqueue PDF generation for character", async () => {
    const listResponse = await api.api.characters.$get(
      { query: {} },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(error.message);
    }

    const characters = await listResponse.json() as { items: Array<{ id: string }> };
    const characterId = characters.items[0].id;

    const response = await api.api.characters[":characterId"].pdf.$post(
      { param: { characterId } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    expect(response.status).toBe(202);
  });

  test("should reject unauthenticated requests", async () => {
    const response = await api.api.characters.$get({ query: {} });
    expect(response.status).toBe(401);
  });

  test("should handle non-existent character", async () => {
    const response = await api.api.characters[":id"].$get(
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

  test("should handle pagination parameters", async () => {
    const response = await api.api.characters.$get(
      {
        query: {
          limit: "5",
          page: "1",
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const characters = await response.json() as { items: Array<unknown>; page: number; nextPage?: number };
    expect(characters).toBeDefined();
    expect(characters.items).toBeDefined();
    expect(characters.page).toBe(1);
    expect(characters.items.length).toBeLessThanOrEqual(5);

    // nextPage should be defined if there are more than 5 characters
    if (characters.items.length === 5) {
      expect(typeof characters.nextPage === "number" || characters.nextPage === undefined).toBe(true);
    }
  });

  // Helper to build ability scores map from seed context
  function buildAbilities(ctx: SeedContext): Record<string, number> {
    const abilities: Record<string, number> = {};
    for (const id of Object.values(ctx.abilityMap)) {
      abilities[id] = 10;
    }
    return abilities;
  }

  // Helper to create a character using seed data
  async function createCharacter(name?: string) {
    const ctx = await getCtx();
    const abilities = buildAbilities(ctx);

    const characterData = {
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
      name: name ?? `Test Character ${Math.random().toString(36).substr(2, 9)}`,
      xp: 0,
      alignment: "True Neutral" as const,
      abilities,
      age: 25,
      gender: "Male" as const,
      height: "5'10\"",
      weight: "170 lbs",
    };

    const response = await api.api.characters.$post(
      {
        json: characterData,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    return response;
  }

  test("should create a character", async () => {
    const ctx = await getCtx();

    const response = await createCharacter();

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create character: ${error.message}`);
    }

    expect(response.status).toBe(201);

    const createdCharacter = await response.json();
    expect(createdCharacter).toBeDefined();
    expect(createdCharacter.id).toBeDefined();
    expect(createdCharacter.rulesetId).toBe(ctx.rulesetId);
    expect(createdCharacter.raceId).toBe(ctx.raceMap.pc["Human"]);
  });

  test("should handle character creation validation", async () => {
    // Missing required fields (no name, no rulesetId, etc.)
    const invalidCharacter = {
      xp: 0,
    };

    const response = await api.api.characters.$post(
      {
        json: invalidCharacter as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(response.status).toBe(400);

    // Invalid alignment enum
    const invalidAlignment = {
      rulesetId: "00000000-0000-0000-0000-000000000000",
      raceId: "00000000-0000-0000-0000-000000000000",
      name: "Test",
      xp: 0,
      alignment: "Invalid Alignment",
      abilities: {},
      age: 25,
      gender: "Male",
      height: "5'10\"",
      weight: "170 lbs",
    };

    const alignmentResponse = await api.api.characters.$post(
      {
        json: invalidAlignment as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(alignmentResponse.status).toBe(400);

    // Invalid gender enum
    const invalidGender = {
      rulesetId: "00000000-0000-0000-0000-000000000000",
      raceId: "00000000-0000-0000-0000-000000000000",
      name: "Test",
      xp: 0,
      alignment: "True Neutral",
      abilities: {},
      age: 25,
      gender: "InvalidGender",
      height: "5'10\"",
      weight: "170 lbs",
    };

    const genderResponse = await api.api.characters.$post(
      {
        json: invalidGender as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(genderResponse.status).toBe(400);
  });

  test("should get unlinked characters", async () => {
    const ctx = await getCtx();

    // Create a campaign using the seed ruleset
    const campaignResponse = await api.api.campaigns.$post(
      {
        json: {
          name: "Test Campaign for Unlinked",
          description: "A test campaign for unlinked characters testing",
          rulesetId: ctx.rulesetId,
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!campaignResponse.ok) {
      const error = await campaignResponse.json();
      throw new Error(`Failed to create campaign: ${error.message}`);
    }

    const campaignResult = await campaignResponse.json();
    const campaignId = campaignResult.campaign.id;

    // Create a character (not linked to any campaign)
    const charResponse = await createCharacter();

    if (!charResponse.ok) {
      const error = await charResponse.json();
      throw new Error(`Failed to create character: ${error.message}`);
    }

    // Get unlinked characters for the campaign
    const unlinkedResponse = await api.api.characters.unlinked[":campaignId"].$get(
      {
        param: { campaignId },
        query: {},
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!unlinkedResponse.ok) {
      const error = await unlinkedResponse.json();
      throw new Error(`Failed to get unlinked characters: ${error.message}`);
    }

    const unlinkedResult = await unlinkedResponse.json();
    expect(unlinkedResult).toBeDefined();
    expect(Array.isArray(unlinkedResult.items)).toBe(true);
    // The newly created character should be among the unlinked characters
    expect(unlinkedResult.items.length > 0).toBe(true);
  });

  test("should update a character", async () => {
    // Create a character first
    const charResponse = await createCharacter();

    if (!charResponse.ok) {
      const error = await charResponse.json();
      throw new Error(`Failed to create character: ${error.message}`);
    }

    const createdCharacter = await charResponse.json();

    // Update the character
    const updateData = {
      age: 30,
      gender: "Female" as const,
      height: "5'6\"",
      weight: "130 lbs",
      xp: 1000,
      alignment: "Chaotic Good" as const,
    };

    const updateResponse = await api.api.characters[":id"].$put(
      {
        param: { id: createdCharacter.id },
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
      throw new Error(`Failed to update character: ${error.message}`);
    }

    const updatedCharacter = await updateResponse.json();
    expect(updatedCharacter).toBeDefined();
    expect(updatedCharacter.age).toBe(updateData.age);
    expect(updatedCharacter.gender).toBe(updateData.gender);
    expect(updatedCharacter.height).toBe(updateData.height);
    expect(updatedCharacter.weight).toBe(updateData.weight);
    expect(updatedCharacter.xp).toBe(updateData.xp);
    expect(updatedCharacter.alignment).toBe(updateData.alignment);
  });

  test("should archive a character", async () => {
    // Create a character first
    const charResponse = await createCharacter();

    if (!charResponse.ok) {
      const error = await charResponse.json();
      throw new Error(`Failed to create character: ${error.message}`);
    }

    const createdCharacter = await charResponse.json();

    // Archive the character
    const archiveResponse = await api.api.characters[":id"].$delete(
      {
        param: { id: createdCharacter.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!archiveResponse.ok) {
      const error = await archiveResponse.json();
      throw new Error(`Failed to archive character: ${error.message}`);
    }

    expect(archiveResponse.status).toBe(200);

    const result = await archiveResponse.json();
    expect(result.message).toBe("Character archived successfully");
  });

  test("should unarchive a character", async () => {
    // Create a character first
    const charResponse = await createCharacter();

    if (!charResponse.ok) {
      const error = await charResponse.json();
      throw new Error(`Failed to create character: ${error.message}`);
    }

    const createdCharacter = await charResponse.json();

    // Archive the character
    const archiveResponse = await api.api.characters[":id"].$delete(
      {
        param: { id: createdCharacter.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!archiveResponse.ok) {
      const error = await archiveResponse.json();
      throw new Error(`Failed to archive character: ${error.message}`);
    }

    // Unarchive the character
    const unarchiveResponse = await api.api.characters[":id"].unarchive.$post(
      {
        param: { id: createdCharacter.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!unarchiveResponse.ok) {
      const error = await unarchiveResponse.json();
      throw new Error(`Failed to unarchive character: ${error.message}`);
    }

    expect(unarchiveResponse.status).toBe(200);

    const result = await unarchiveResponse.json();
    expect(result.message).toBe("Character unarchived successfully");
  });

  test("should generate a share token", async () => {
    const charResponse = await createCharacter();
    if (!charResponse.ok) throw new Error("Failed to create character");
    const createdCharacter = await charResponse.json();

    const response = await api.api.characters[":id"].share.$post(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!response.ok) throw new Error("Failed to generate share token");

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.shareToken).toBeDefined();
  });

  test("should revoke a share token", async () => {
    const charResponse = await createCharacter();
    if (!charResponse.ok) throw new Error("Failed to create character");
    const createdCharacter = await charResponse.json();

    // Generate first
    await api.api.characters[":id"].share.$post(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    // Then revoke
    const response = await api.api.characters[":id"].share.$delete(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!response.ok) throw new Error("Failed to revoke share token");

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.shareToken).toBeNull();
  });

  test("should reject share operations without auth", async () => {
    const charResponse = await createCharacter();
    if (!charResponse.ok) throw new Error("Failed to create character");
    const createdCharacter = await charResponse.json();

    const response = await api.api.characters[":id"].share.$post(
      { param: { id: createdCharacter.id } },
    );

    expect(response.status).toBe(401);
  });

  test("should get shared character without auth", async () => {
    const charResponse = await createCharacter();
    if (!charResponse.ok) throw new Error("Failed to create character");
    const createdCharacter = await charResponse.json();

    // Generate share token
    const shareResponse = await api.api.characters[":id"].share.$post(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!shareResponse.ok) throw new Error("Failed to generate share token");
    const shareResult = await shareResponse.json();

    // Access shared character without auth
    const response = await api.api.shared.characters[":shareToken"].$get({
      param: { shareToken: shareResult.shareToken! },
    });

    if (!response.ok) throw new Error("Failed to get shared character");

    expect(response.status).toBe(200);
    const character = await response.json();
    expect(character.id).toBe(createdCharacter.id);
    // Private notes should be stripped
    expect("privateNotes" in character.identity.background).toBe(false);
  });

  test("should return 404 for invalid share token", async () => {
    const response = await api.api.shared.characters[":shareToken"].$get({
      param: { shareToken: "00000000-0000-0000-0000-000000000000" },
    });

    expect(response.status).toBe(404);
  });

  test("should return 404 after share token is revoked", async () => {
    const charResponse = await createCharacter();
    if (!charResponse.ok) throw new Error("Failed to create character");
    const createdCharacter = await charResponse.json();

    // Generate share token
    const shareResponse = await api.api.characters[":id"].share.$post(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!shareResponse.ok) throw new Error("Failed to generate share token");
    const shareResult = await shareResponse.json();
    const shareToken = shareResult.shareToken!;

    // Revoke the token
    await api.api.characters[":id"].share.$delete(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    // Try to access revoked token
    const response = await api.api.shared.characters[":shareToken"].$get({
      param: { shareToken },
    });

    expect(response.status).toBe(404);
  });

  test("should generate PDF for shared character without auth", async () => {
    const charResponse = await createCharacter();
    if (!charResponse.ok) throw new Error("Failed to create character");
    const createdCharacter = await charResponse.json();

    // Generate share token
    const shareResponse = await api.api.characters[":id"].share.$post(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!shareResponse.ok) throw new Error("Failed to generate share token");
    const shareResult = await shareResponse.json();

    // Access shared PDF without auth
    const response = await api.api.shared.characters[":shareToken"].pdf.$get({
      param: { shareToken: shareResult.shareToken! },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });

  test("should expose shareToken in character detail response", async () => {
    const charResponse = await createCharacter();
    if (!charResponse.ok) throw new Error("Failed to create character");
    const createdCharacter = await charResponse.json();

    // Generate share token
    await api.api.characters[":id"].share.$post(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    // Get character detail
    const response = await api.api.characters[":id"].$get(
      { param: { id: createdCharacter.id } },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    if (!response.ok) throw new Error("Failed to get character detail");

    expect(response.status).toBe(200);
    const character = await response.json();
    expect(character.shareToken).toBeDefined();
    expect(typeof character.shareToken).toBe("string");
  });

  test("should handle non-existent character for update/delete/unarchive", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    // Update non-existent character
    const updateResponse = await api.api.characters[":id"].$put(
      {
        param: { id: nonExistentId },
        json: { age: 30 },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(updateResponse.status).toBe(404);

    // Delete non-existent character
    const deleteResponse = await api.api.characters[":id"].$delete(
      {
        param: { id: nonExistentId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(deleteResponse.status).toBe(404);

    // Unarchive non-existent character
    const unarchiveResponse = await api.api.characters[":id"].unarchive.$post(
      {
        param: { id: nonExistentId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(unarchiveResponse.status).toBe(404);
  });

  describe("updateAbilities", () => {
    test("should update a character's ability base score", async () => {
      const ctx = await getCtx();
      const charResponse = await createCharacter();
      if (!charResponse.ok) throw new Error("Failed to create character");
      const character = await charResponse.json();

      const strAbilityId = ctx.abilityMap["Strength"];

      const response = await api.api.characters[":id"].abilities.$put(
        {
          param: { id: character.id },
          json: { [strAbilityId]: 18 },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      expect(response.status).toBe(200);

      // Verify the score was updated
      const detailResponse = await api.api.characters[":id"].$get(
        { param: { id: character.id } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );

      if (!detailResponse.ok) throw new Error("Failed to get character");
      const detail = await detailResponse.json();
      const strength = Object.values(detail.abilities).find((a) => a.abilityId === strAbilityId);
      expect(strength!.base).toBe(18);
      expect(strength!.total).toBe(18);
      expect(strength!.modifier).toBe(4);
    });

    test("should reject invalid abilityId", async () => {
      const charResponse = await createCharacter();
      if (!charResponse.ok) throw new Error("Failed to create character");
      const character = await charResponse.json();

      const response = await api.api.characters[":id"].abilities.$put(
        {
          param: { id: character.id },
          json: { "00000000-0000-0000-0000-000000000000": 15 },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      expect(response.status).toBe(404);
    });

    test("should reject unauthenticated request", async () => {
      const response = await api.api.characters[":id"].abilities.$put({
        param: { id: "00000000-0000-0000-0000-000000000000" },
        json: { "00000000-0000-0000-0000-000000000000": 15 },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /:id/languages", () => {
    test("should set character languages", async () => {
      const ctx = await getCtx();

      // Get a character
      const listResponse = await api.api.characters.$get(
        { query: {} },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      const characters = await listResponse.json() as { items: Array<{ id: string }> };
      const characterId = characters.items[0].id;

      const languageIds = [ctx.langMap["Common"], ctx.langMap["Draconic"]];

      const response = await api.api.characters[":id"].languages.$put(
        { param: { id: characterId }, json: { languageIds } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );

      expect(response.status).toBe(200);

      // Verify languages are set on the character
      const detailResponse = await api.api.characters[":id"].$get(
        { param: { id: characterId } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      const character = await detailResponse.json() as { identity: { physiology: { languages: Array<{ id: string; name: string }> } } };
      const langNames = character.identity.physiology.languages.map((l) => l.name).sort();
      expect(langNames).toContain("Common");
      expect(langNames).toContain("Draconic");
    });

    test("should replace existing languages", async () => {
      const ctx = await getCtx();

      const listResponse = await api.api.characters.$get(
        { query: {} },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      const characters = await listResponse.json() as { items: Array<{ id: string }> };
      const characterId = characters.items[0].id;

      // Set to Common + Draconic
      await api.api.characters[":id"].languages.$put(
        { param: { id: characterId }, json: { languageIds: [ctx.langMap["Common"], ctx.langMap["Draconic"]] } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );

      // Replace with just Elvish
      const response = await api.api.characters[":id"].languages.$put(
        { param: { id: characterId }, json: { languageIds: [ctx.langMap["Elven"]] } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      expect(response.status).toBe(200);

      const detailResponse = await api.api.characters[":id"].$get(
        { param: { id: characterId } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      const character = await detailResponse.json() as { identity: { physiology: { languages: Array<{ name: string }> } } };
      expect(character.identity.physiology.languages).toHaveLength(1);
      expect(character.identity.physiology.languages[0].name).toBe("Elven");
    });

    test("should clear all languages with empty array", async () => {
      const listResponse = await api.api.characters.$get(
        { query: {} },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      const characters = await listResponse.json() as { items: Array<{ id: string }> };
      const characterId = characters.items[0].id;

      const response = await api.api.characters[":id"].languages.$put(
        { param: { id: characterId }, json: { languageIds: [] } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      expect(response.status).toBe(200);

      const detailResponse = await api.api.characters[":id"].$get(
        { param: { id: characterId } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      const character = await detailResponse.json() as { identity: { physiology: { languages: Array<{ name: string }> } } };
      expect(character.identity.physiology.languages).toHaveLength(0);
    });

    test("should reject invalid language IDs", async () => {
      const listResponse = await api.api.characters.$get(
        { query: {} },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      const characters = await listResponse.json() as { items: Array<{ id: string }> };
      const characterId = characters.items[0].id;

      const response = await api.api.characters[":id"].languages.$put(
        { param: { id: characterId }, json: { languageIds: ["00000000-0000-0000-0000-000000000000"] } },
        { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
      );
      expect(response.status).toBe(400);
    });
  });
});
