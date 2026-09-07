import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import type { InferRequestType } from "hono/client";
import { expect, describe, test } from "bun:test";

describe("rulesets classes", () => {
  const api = testClient<Application>(application);
  type CreateClassPayload = InferRequestType<(typeof api.api.rulesets)[":id"]["classes"]["$post"]>["json"];
  type UpdateClassPayload = InferRequestType<(typeof api.api.rulesets)[":id"]["classes"][":classId"]["$put"]>["json"];

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  test("should handle full class CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();

    // Get initial list
    const listResponse = await api.api.rulesets[":id"].classes.$get(
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
      throw new Error(`Failed to get classes: ${error.message}`);
    }

    const classes = await listResponse.json();
    expect(classes).toBeDefined();
    expect(Array.isArray(classes.items)).toBe(true);

    // Create a new class with explicit hd
    const newClass: CreateClassPayload = {
      name: "Test Class",
      description: "A test class for testing",
      hd: 10,
    };

    const createResponse = await api.api.rulesets[":id"].classes.$post(
      {
        param: { id: testRulesetId },
        json: newClass,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create class: ${error.message}`);
    }

    const createdClass = await createResponse.json();
    expect(createdClass).toBeDefined();
    expect(createdClass.name).toBe("Test Class");
    expect(createdClass.description).toBe("A test class for testing");
    expect(createdClass.hd).toBe(10);

    // Create a class with default hd value
    const classWithDefaultHd = {
      name: "Test Class Default HD",
      description: "A test class without hd specified",
    };

    const defaultHdResponse = await api.api.rulesets[":id"].classes.$post(
      {
        param: { id: testRulesetId },
        json: classWithDefaultHd,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!defaultHdResponse.ok) {
      const error = await defaultHdResponse.json();
      throw new Error(`Failed to create class: ${error.message}`);
    }

    const createdDefaultClass = await defaultHdResponse.json();
    expect(createdDefaultClass).toBeDefined();
    expect(createdDefaultClass.name).toBe(classWithDefaultHd.name);
    expect(createdDefaultClass.description).toBe(classWithDefaultHd.description);
    expect(createdDefaultClass.hd).toBe(8); // Default value

    // Update the class
    const updateData: UpdateClassPayload = {
      name: "Updated Test Class",
      description: "Updated description",
      hd: 12,
    };

    const updateResponse = await api.api.rulesets[":id"].classes[":classId"].$put(
      {
        param: { id: testRulesetId, classId: createdClass.id },
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
      throw new Error(`Failed to update class: ${error.message}`);
    }

    const updatedClass = await updateResponse.json();
    expect(updatedClass.name).toBe("Updated Test Class");
    expect(updatedClass.description).toBe("Updated description");
    expect(updatedClass.hd).toBe(12);

    // Delete the class
    const deleteResponse = await api.api.rulesets[":id"].classes[":classId"].$delete(
      {
        param: { id: testRulesetId, classId: createdClass.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete class: ${error.message}`);
    }

    const deletedClass = await deleteResponse.json();
    expect(deletedClass).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].classes.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidClass = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].classes.$post(
      {
        param: { id: testRulesetId },
        json: invalidClass as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);
  });

  test("should reject non-standard hit die with 400", async () => {
    const testRulesetId = await createTestRuleset();

    // Hit die 5 violates the DB CHECK constraint (only 4/6/8/10/12 allowed).
    // The Zod validator must reject it cleanly before it reaches the DB.
    const response = await api.api.rulesets[":id"].classes.$post(
      {
        param: { id: testRulesetId },
        json: { name: "Bad Class", description: "Bad", hd: 5 } as never,
      },
      { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } },
    );

    expect(response.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].classes.$get(
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

    // Test non-existent class
    const updateResponse = await api.api.rulesets[":id"].classes[":classId"].$put(
      {
        param: { id: testRulesetId, classId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test", hd: 8 },
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
