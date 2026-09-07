import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets saves", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset and fetch an ability ID
  async function createTestRuleset(): Promise<{ rulesetId: string; abilityId: string }> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    const rulesetId = ruleset.id;

    // Fetch an auto-seeded ability from the ruleset
    const abilitiesResponse = await api.api.rulesets[":id"].abilities.$get(
      {
        param: { id: rulesetId },
        query: { limit: "100", page: "1" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!abilitiesResponse.ok) {
      throw new Error("Failed to fetch abilities");
    }

    const abilitiesData = await abilitiesResponse.json();
    const ability = abilitiesData.items[0];
    if (!ability) throw new Error("No abilities found in ruleset");

    return { rulesetId, abilityId: ability.id };
  }

  // Helper to fetch an ability ID by name
  async function getAbilityId(rulesetId: string, abilityName: string): Promise<string> {
    const response = await api.api.rulesets[":id"].abilities.$get(
      {
        param: { id: rulesetId },
        query: { limit: "100", page: "1", search: abilityName },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to fetch abilities");
    }

    const data = await response.json();
    const ability = data.items.find((a: { name: string }) => a.name === abilityName);
    if (!ability) throw new Error(`Ability ${abilityName} not found`);
    return ability.id;
  }

  test("should handle full save CRUD lifecycle", async () => {
    const { rulesetId: testRulesetId, abilityId: testAbilityId } = await createTestRuleset();

    // Get initial list (should be empty or have base saves)
    const listResponse = await api.api.rulesets[":id"].saves.$get(
      {
        param: { id: testRulesetId },
        query: { limit: "10", page: "1" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get saves: ${error.message}`);
    }

    const initialSaves = await listResponse.json();
    expect(initialSaves).toBeDefined();
    expect(Array.isArray(initialSaves.items)).toBe(true);

    // Create a new save
    const newSave = {
      name: "Test Save",
      description: "A test save for testing",
      abilityId: testAbilityId,
    };

    const createResponse = await api.api.rulesets[":id"].saves.$post(
      {
        param: { id: testRulesetId },
        json: newSave,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create save: ${error.message}`);
    }

    const createdSave = await createResponse.json();
    expect(createdSave).toBeDefined();
    expect(createdSave.name).toBe(newSave.name);
    expect(createdSave.description).toBe(newSave.description);
    expect(createdSave.abilityId).toBe(testAbilityId);

    // Verify it appears in the list
    const listAfterCreate = await api.api.rulesets[":id"].saves.$get(
      {
        param: { id: testRulesetId },
        query: { limit: "100", page: "1", search: "Test Save" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listAfterCreate.ok) {
      const error = await listAfterCreate.json();
      throw new Error(`Failed to list saves after create: ${error.message}`);
    }

    const savesAfterCreate = await listAfterCreate.json();
    const foundSave = savesAfterCreate.items.find((s: { id: string }) => s.id === createdSave.id);
    expect(foundSave).toBeDefined();

    // Update the save with a different ability
    const wisdomId = await getAbilityId(testRulesetId, "Wisdom");

    const updateData = {
      name: "Updated Test Save",
      description: "Updated description",
      abilityId: wisdomId,
    };

    const updateResponse = await api.api.rulesets[":id"].saves[":saveId"].$put(
      {
        param: { id: testRulesetId, saveId: createdSave.id },
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
      throw new Error(`Failed to update save: ${error.message}`);
    }

    const updatedSave = await updateResponse.json();
    expect(updatedSave.name).toBe(updateData.name);
    expect(updatedSave.description).toBe(updateData.description);
    expect(updatedSave.abilityId).toBe(wisdomId);

    // Delete the save
    const deleteResponse = await api.api.rulesets[":id"].saves[":saveId"].$delete(
      {
        param: { id: testRulesetId, saveId: createdSave.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete save: ${error.message}`);
    }

    const deletedSave = await deleteResponse.json();
    expect(deletedSave).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const { rulesetId: testRulesetId, abilityId: testAbilityId } = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].saves.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields (no name)
    const invalidSave = {
      description: "Missing name field",
      abilityId: testAbilityId,
    };

    const validationResponse = await api.api.rulesets[":id"].saves.$post(
      {
        param: { id: testRulesetId },
        json: invalidSave as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);

    // Test validation - missing abilityId
    const missingAbility = {
      name: "Test Save",
      description: "Missing abilityId field",
    };

    const missingAbilityResponse = await api.api.rulesets[":id"].saves.$post(
      {
        param: { id: testRulesetId },
        json: missingAbility as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(missingAbilityResponse.status).toBe(400);

    // Test validation - invalid abilityId (not a uuid)
    const invalidAbilityId = {
      name: "Test Save",
      description: "Invalid abilityId",
      abilityId: "not-a-uuid",
    };

    const invalidAbilityResponse = await api.api.rulesets[":id"].saves.$post(
      {
        param: { id: testRulesetId },
        json: invalidAbilityId as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(invalidAbilityResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const { rulesetId: testRulesetId, abilityId: testAbilityId } = await createTestRuleset();

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].saves.$get(
      {
        param: { id: "00000000-0000-0000-0000-000000000000" },
        query: { limit: "10", page: "1" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(nonExistentRulesetResponse.status).toBe(404);

    // Test non-existent save for UPDATE
    const updateResponse = await api.api.rulesets[":id"].saves[":saveId"].$put(
      {
        param: { id: testRulesetId, saveId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test", abilityId: testAbilityId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(updateResponse.status >= 400).toBe(true);

    // Test non-existent save for DELETE
    const deleteResponse = await api.api.rulesets[":id"].saves[":saveId"].$delete(
      {
        param: { id: testRulesetId, saveId: "00000000-0000-0000-0000-000000000000" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(deleteResponse.status >= 400).toBe(true);
  });
});
