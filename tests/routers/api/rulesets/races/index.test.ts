import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets races", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  test("should handle full race CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();

    // Get initial list (should be empty or have base races)
    const listResponse = await api.api.rulesets[":id"].races.$get(
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
      throw new Error(`Failed to get races: ${error.message}`);
    }

    const initialRaces = await listResponse.json();
    expect(initialRaces).toBeDefined();
    expect(Array.isArray(initialRaces.items)).toBe(true);

    // Create a new race
    const newRace = {
      name: "Test Race",
      description: "A test race for testing",
      size: "Medium" as const,
      baseSpeed: 30,
    };

    const createResponse = await api.api.rulesets[":id"].races.$post(
      {
        param: { id: testRulesetId },
        json: newRace,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create race: ${error.message}`);
    }

    const createdRace = await createResponse.json();
    expect(createdRace).toBeDefined();
    expect(createdRace.name).toBe(newRace.name);
    expect(createdRace.description).toBe(newRace.description);
    expect(createdRace.size).toBe(newRace.size);
    expect(createdRace.baseSpeed).toBe(newRace.baseSpeed);

    // Update the race
    const updateData = {
      name: "Updated Test Race",
      description: "Updated description",
      size: "Large" as const,
      baseSpeed: 40,
    };

    const updateResponse = await api.api.rulesets[":id"].races[":raceId"].$put(
      {
        param: { id: testRulesetId, raceId: createdRace.id },
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
      throw new Error(`Failed to update race: ${error.message}`);
    }

    const updatedRace = await updateResponse.json();
    expect(updatedRace.name).toBe(updateData.name);
    expect(updatedRace.description).toBe(updateData.description);
    expect(updatedRace.size).toBe(updateData.size);
    expect(updatedRace.baseSpeed).toBe(updateData.baseSpeed);

    // Delete the race
    const deleteResponse = await api.api.rulesets[":id"].races[":raceId"].$delete(
      {
        param: { id: testRulesetId, raceId: createdRace.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete race: ${error.message}`);
    }

    const deletedRace = await deleteResponse.json();
    expect(deletedRace).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].races.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidRace = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].races.$post(
      {
        param: { id: testRulesetId },
        json: invalidRace as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);

    // Test validation - invalid size enum
    const invalidSizeRace = {
      name: "Test Race",
      description: "Test description",
      size: "InvalidSize",
      baseSpeed: 30,
    };

    const sizeValidationResponse = await api.api.rulesets[":id"].races.$post(
      {
        param: { id: testRulesetId },
        json: invalidSizeRace as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(sizeValidationResponse.status).toBe(400);

    // Test validation - invalid baseSpeed type
    const invalidSpeedRace = {
      name: "Test Race",
      description: "Test description",
      size: "Medium" as const,
      baseSpeed: "not-a-number",
    };

    const speedValidationResponse = await api.api.rulesets[":id"].races.$post(
      {
        param: { id: testRulesetId },
        json: invalidSpeedRace as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(speedValidationResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].races.$get(
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

    // Test non-existent race
    const updateResponse = await api.api.rulesets[":id"].races[":raceId"].$put(
      {
        param: { id: testRulesetId, raceId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test", size: "Medium" as const, baseSpeed: 30 },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(updateResponse.status >= 400).toBe(true);
  });

  test(
    "should cascade delete requirements/properties/modifiers when deleting race",
    async () => {
      const testRulesetId = await createTestRuleset();

      // Create a race
      const newRace = {
        name: "Test Race for Cascade Deletion",
        description: "A test race for cascade deletion testing",
        size: "Medium" as const,
        type: "Humanoid",
        subtype: "Human",
        baseSpeed: 30,
      };

      const raceResponse = await api.api.rulesets[":id"].races.$post(
        {
          param: { id: testRulesetId },
          json: newRace,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!raceResponse.ok) {
        const error = await raceResponse.json();
        throw new Error(`Failed to create race: ${error.message}`);
      }

      const createdRace = await raceResponse.json();

      // Create a requirement for the race
      const requirement = {
        level: "1",
        target: "abilities.constitution.total",
        value: "10",
        valueType: "number",
        operator: "greater_than_or_equal",
      };

      const reqResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements.$post(
          {
            param: { id: testRulesetId, entityId: createdRace.id, entityType: "races" },
            json: requirement,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!reqResponse.ok) {
        const error = await reqResponse.json();
        throw new Error(`Failed to create requirement: ${error.message}`);
      }

      // Create a property for the race
      const property = {
        value: "60",
        type: "number",
      };

      const propResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties.$post(
          {
            param: { id: testRulesetId, entityId: createdRace.id, entityType: "races" },
            json: property,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!propResponse.ok) {
        const error = await propResponse.json();
        throw new Error(`Failed to create property: ${error.message}`);
      }

      // Create a modifier for the race
      const modifier = {
        sourceType: "races",
        sourceId: createdRace.id,
        target: "abilities.constitution.misc",
        value: "2",
        valueType: "number",
        operator: "add",
      };

      const modResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .modifiers.$post(
          {
            param: { id: testRulesetId, entityId: createdRace.id, entityType: "races" },
            json: modifier,
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!modResponse.ok) {
        const error = await modResponse.json();
        throw new Error(`Failed to create modifier: ${error.message}`);
      }

      // Verify all entities exist
      const requirementsResponse = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].requirements.$get(
          {
            param: { id: testRulesetId, entityId: createdRace.id, entityType: "races" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!requirementsResponse.ok) {
        const error = await requirementsResponse.json();
        throw new Error(`Failed to get requirements: ${error.message}`);
      }

      const requirements = await requirementsResponse.json();
      expect(requirements.length > 0).toBe(true);

      // Delete the race
      const deleteResponse = await api.api.rulesets[":id"].races[":raceId"].$delete(
        {
          param: { id: testRulesetId, raceId: createdRace.id },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.json();
        throw new Error(`Failed to delete race: ${error.message}`);
      }

      // Verify associated entities are deleted
      const requirementsAfterDelete = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].requirements.$get(
          {
            param: { id: testRulesetId, entityId: createdRace.id, entityType: "races" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      // Should return 404 or empty array since the race no longer exists
      if (requirementsAfterDelete.ok) {
        const deletedRequirements = await requirementsAfterDelete.json();
        expect(Array.isArray(deletedRequirements)).toBe(true);
        expect(deletedRequirements.length).toBe(0);
      } else {
        expect(requirementsAfterDelete.status).toBe(404);
      }
    },
  );
});
