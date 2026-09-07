import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets powers", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset with aptitude
  async function createTestRuleset(): Promise<{ rulesetId: string; aptitudeId: string }> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    const rulesetId = ruleset.id;

    // Create a test aptitude for powers testing
    const newAptitude = {
      name: "Test Aptitude for Powers",
      description: "A test aptitude for powers testing",
    };

    const aptitudeResponse = await api.api.rulesets[":id"].aptitudes.$post(
      {
        param: { id: rulesetId },
        json: newAptitude,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!aptitudeResponse.ok) {
      const error = await aptitudeResponse.json();
      throw new Error(`Failed to create test aptitude: ${error.message}`);
    }

    const createdAptitude = await aptitudeResponse.json();
    return { rulesetId, aptitudeId: createdAptitude.id };
  }

  test("should handle full power CRUD lifecycle", async () => {
    const { rulesetId: testRulesetId, aptitudeId: testAptitudeId } = await createTestRuleset();

    // Get initial list (should be empty or have base powers)
    const listResponse = await api.api.rulesets[":id"].powers.$get(
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
      throw new Error(`Failed to get powers: ${error.message}`);
    }

    const initialPowers = await listResponse.json();
    expect(initialPowers).toBeDefined();
    expect(Array.isArray(initialPowers.items)).toBe(true);

    // Create a new power
    const newPower = {
      name: "Test Power",
      description: "A test power for testing",
      aptitudes: [{ id: testAptitudeId }],
    };

    const createResponse = await api.api.rulesets[":id"].powers.$post(
      {
        param: { id: testRulesetId },
        json: newPower,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create power: ${error.message}`);
    }

    const createdPower = await createResponse.json();
    expect(createdPower).toBeDefined();
    expect(createdPower.name).toBe(newPower.name);
    expect(createdPower.description).toBe(newPower.description);

    // Get the power by ID
    const getResponse = await api.api.rulesets[":id"].powers[":powerId"].$get(
      {
        param: { id: testRulesetId, powerId: createdPower.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!getResponse.ok) {
      const error = await getResponse.json();
      throw new Error(`Failed to get power: ${error.message}`);
    }

    const fetchedPower = await getResponse.json();
    expect(fetchedPower).toBeDefined();
    expect(fetchedPower.id).toBe(createdPower.id);
    expect(fetchedPower.name).toBe(newPower.name);
    expect(fetchedPower.description).toBe(newPower.description);

    // Update the power
    const updateData = {
      name: "Updated Test Power",
      description: "Updated description",
      aptitudes: [],
    };

    const updateResponse = await api.api.rulesets[":id"].powers[":powerId"].$put(
      {
        param: { id: testRulesetId, powerId: createdPower.id },
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
      throw new Error(`Failed to update power: ${error.message}`);
    }

    const updatedPower = await updateResponse.json();
    expect(updatedPower.name).toBe(updateData.name);
    expect(updatedPower.description).toBe(updateData.description);

    // Delete the power
    const deleteResponse = await api.api.rulesets[":id"].powers[":powerId"].$delete(
      {
        param: { id: testRulesetId, powerId: createdPower.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete power: ${error.message}`);
    }

    const deletedPower = await deleteResponse.json();
    expect(deletedPower).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const { rulesetId: testRulesetId } = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].powers.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidPower = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].powers.$post(
      {
        param: { id: testRulesetId },
        json: invalidPower as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);

    // Test validation - invalid aptitudes type
    const invalidAptitudePower = {
      name: "Test Power",
      description: "Test description",
      aptitudes: "not-an-array",
    };

    const aptitudeValidationResponse = await api.api.rulesets[":id"].powers.$post(
      {
        param: { id: testRulesetId },
        json: invalidAptitudePower as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(aptitudeValidationResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const { rulesetId: testRulesetId } = await createTestRuleset();

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].powers.$get(
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

    // Test non-existent power for GET
    const getResponse = await api.api.rulesets[":id"].powers[":powerId"].$get(
      {
        param: { id: testRulesetId, powerId: "00000000-0000-0000-0000-000000000000" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(getResponse.status).toBe(404);

    // Test non-existent power for UPDATE
    const updateResponse = await api.api.rulesets[":id"].powers[":powerId"].$put(
      {
        param: { id: testRulesetId, powerId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test", aptitudes: [] },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(updateResponse.status >= 400).toBe(true);
  });

  test("should reject creating a power with an aptitude already used for feats", async () => {
    const { rulesetId, aptitudeId } = await createTestRuleset();

    // Link the aptitude to a feat first
    const featResponse = await api.api.rulesets[":id"].feats.$post(
      {
        param: { id: rulesetId },
        json: {
          name: "Test Feat",
          description: "A feat using the aptitude",
          aptitudeIds: [aptitudeId],
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );
    expect(featResponse.ok).toBe(true);

    // Now try to create a power with the same aptitude — should fail
    const powerResponse = await api.api.rulesets[":id"].powers.$post(
      {
        param: { id: rulesetId },
        json: {
          name: "Test Spell",
          description: "A spell trying to use a feat aptitude",
          aptitudes: [{ id: aptitudeId }],
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );
    expect(powerResponse.status).toBe(409);
  });

  test(
    "should cascade delete requirements/properties/modifiers when deleting power",
    async () => {
      const { rulesetId: testRulesetId, aptitudeId: testAptitudeId } = await createTestRuleset();

      // Create a power
      const newPower = {
        name: "Test Power for Cascade Deletion",
        description: "A test power for cascade deletion testing",
        aptitudes: [{ id: testAptitudeId }],
      };

      const powerResponse = await api.api.rulesets[":id"].powers.$post(
        {
          param: { id: testRulesetId },
          json: newPower,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!powerResponse.ok) {
        const error = await powerResponse.json();
        throw new Error(`Failed to create power: ${error.message}`);
      }

      const createdPower = await powerResponse.json();

      // Create a requirement for the power
      const requirement = {
        level: "1",
        target: "abilities.strength.total",
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      };

      const reqResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements.$post(
          {
            param: { id: testRulesetId, entityId: createdPower.id, entityType: "powers" },
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

      // Create a property for the power
      const property = {
        value: "test_value",
        type: "number",
      };

      const propResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties.$post(
          {
            param: { id: testRulesetId, entityId: createdPower.id, entityType: "powers" },
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

      // Create a modifier for the power
      const modifier = {
        sourceType: "powers",
        sourceId: createdPower.id,
        target: "abilities.strength.misc",
        value: "2",
        valueType: "number",
        operator: "add",
      };

      const modResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .modifiers.$post(
          {
            param: { id: testRulesetId, entityId: createdPower.id, entityType: "powers" },
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
            param: { id: testRulesetId, entityId: createdPower.id, entityType: "powers" },
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

      const propertiesResponse = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].properties.$get(
          {
            param: { id: testRulesetId, entityId: createdPower.id, entityType: "powers" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      if (!propertiesResponse.ok) {
        const error = await propertiesResponse.json();
        throw new Error(`Failed to get properties: ${error.message}`);
      }

      const properties = await propertiesResponse.json();
      expect(properties.length > 0).toBe(true);

      // Delete the power
      const deleteResponse = await api.api.rulesets[":id"].powers[":powerId"].$delete(
        {
          param: { id: testRulesetId, powerId: createdPower.id },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.json();
        throw new Error(`Failed to delete power: ${error.message}`);
      }

      // Verify associated entities are deleted
      const requirementsAfterDelete = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].requirements.$get(
          {
            param: { id: testRulesetId, entityId: createdPower.id, entityType: "powers" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      // Should return 404 or empty array since the power no longer exists
      if (requirementsAfterDelete.ok) {
        const deletedRequirements = await requirementsAfterDelete.json();
        expect(Array.isArray(deletedRequirements)).toBe(true);
        expect(deletedRequirements.length).toBe(0);
      } else {
        expect(requirementsAfterDelete.status).toBe(404);
      }

      const propertiesAfterDelete = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].properties.$get(
          {
            param: { id: testRulesetId, entityId: createdPower.id, entityType: "powers" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      // Should return 404 or empty array since the power no longer exists
      if (propertiesAfterDelete.ok) {
        const deletedProperties = await propertiesAfterDelete.json();
        expect(Array.isArray(deletedProperties)).toBe(true);
        expect(deletedProperties.length).toBe(0);
      } else {
        expect(propertiesAfterDelete.status).toBe(404);
      }
    },
  );
});
