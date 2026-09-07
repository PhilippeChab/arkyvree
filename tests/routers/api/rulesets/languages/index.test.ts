import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets languages", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  test("should handle full language CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();

    // Get initial list (should be empty or have base languages)
    const listResponse = await api.api.rulesets[":id"].languages.$get(
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
      throw new Error(`Failed to get languages: ${error.message}`);
    }

    const initialLanguages = await listResponse.json();
    expect(initialLanguages).toBeDefined();
    expect(Array.isArray(initialLanguages.items)).toBe(true);

    // Create a new language
    const newLanguage = {
      name: "Test Language",
      description: "A test language for testing",
      type: "Common",
    };

    const createResponse = await api.api.rulesets[":id"].languages.$post(
      {
        param: { id: testRulesetId },
        json: newLanguage,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create language: ${error.message}`);
    }

    const createdLanguage = await createResponse.json();
    expect(createdLanguage).toBeDefined();
    expect(createdLanguage.name).toBe(newLanguage.name);
    expect(createdLanguage.description).toBe(newLanguage.description);
    expect(createdLanguage.type).toBe(newLanguage.type);

    // Update the language
    const updateData = {
      name: "Updated Test Language",
      description: "Updated description",
      type: "Exotic",
    };

    const updateResponse = await api.api.rulesets[":id"].languages[":languageId"].$put(
      {
        param: { id: testRulesetId, languageId: createdLanguage.id },
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
      throw new Error(`Failed to update language: ${error.message}`);
    }

    const updatedLanguage = await updateResponse.json();
    expect(updatedLanguage.name).toBe(updateData.name);
    expect(updatedLanguage.description).toBe(updateData.description);
    expect(updatedLanguage.type).toBe(updateData.type);

    // Delete the language
    const deleteResponse = await api.api.rulesets[":id"].languages[":languageId"].$delete(
      {
        param: { id: testRulesetId, languageId: createdLanguage.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete language: ${error.message}`);
    }

    const deletedLanguage = await deleteResponse.json();
    expect(deletedLanguage).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].languages.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidLanguage = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].languages.$post(
      {
        param: { id: testRulesetId },
        json: invalidLanguage as never,
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
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].languages.$get(
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

    // Test non-existent language
    const updateResponse = await api.api.rulesets[":id"].languages[":languageId"].$put(
      {
        param: { id: testRulesetId, languageId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test", type: "Common" },
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
