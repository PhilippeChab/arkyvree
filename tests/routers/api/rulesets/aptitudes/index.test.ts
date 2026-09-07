import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets aptitudes", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  test("should handle full aptitude CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();

    // Get initial list (should be empty or have base aptitudes)
    const listResponse = await api.api.rulesets[":id"].aptitudes.$get(
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
      throw new Error(`Failed to get aptitudes: ${error.message}`);
    }

    const initialAptitudes = await listResponse.json();
    expect(initialAptitudes).toBeDefined();
    expect(Array.isArray(initialAptitudes.items)).toBe(true);

    // Create a new aptitude
    const newAptitude = {
      name: "Test Aptitude",
      description: "A test aptitude for testing",
    };

    const createResponse = await api.api.rulesets[":id"].aptitudes.$post(
      {
        param: { id: testRulesetId },
        json: newAptitude,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create aptitude: ${error.message}`);
    }

    const createdAptitude = await createResponse.json();
    expect(createdAptitude).toBeDefined();
    expect(createdAptitude.name).toBe(newAptitude.name);
    expect(createdAptitude.description).toBe(newAptitude.description);

    // Update the aptitude
    const updateData = {
      name: "Updated Test Aptitude",
      description: "Updated description",
    };

    const updateResponse = await api.api.rulesets[":id"].aptitudes[":aptitudeId"].$put(
      {
        param: { id: testRulesetId, aptitudeId: createdAptitude.id },
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
      throw new Error(`Failed to update aptitude: ${error.message}`);
    }

    const updatedAptitude = await updateResponse.json();
    expect(updatedAptitude.name).toBe(updateData.name);
    expect(updatedAptitude.description).toBe(updateData.description);

    // Delete the aptitude
    const deleteResponse = await api.api.rulesets[":id"].aptitudes[":aptitudeId"].$delete(
      {
        param: { id: testRulesetId, aptitudeId: createdAptitude.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete aptitude: ${error.message}`);
    }

    const deletedAptitude = await deleteResponse.json();
    expect(deletedAptitude).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].aptitudes.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidAptitude = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].aptitudes.$post(
      {
        param: { id: testRulesetId },
        json: invalidAptitude as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].aptitudes.$get(
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

    // Test non-existent aptitude
    const updateResponse = await api.api.rulesets[":id"].aptitudes[":aptitudeId"].$put(
      {
        param: { id: testRulesetId, aptitudeId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(updateResponse.status >= 400).toBe(true);
  });
});
