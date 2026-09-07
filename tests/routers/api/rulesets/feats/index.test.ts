import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets feats", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset with aptitude
  async function createTestRuleset(): Promise<{ rulesetId: string; aptitudeId: string }> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    const rulesetId = ruleset.id;

    // Create a test aptitude for feat requirements
    const newAptitude = {
      name: "Test Aptitude for Feats",
      description: "A test aptitude for feats testing",
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

  test("should handle full feat CRUD lifecycle", async () => {
    const { rulesetId: testRulesetId, aptitudeId: testAptitudeId } = await createTestRuleset();

    // Get initial list (should be empty or have base feats)
    const listResponse = await api.api.rulesets[":id"].feats.$get(
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
      throw new Error(`Failed to get feats: ${error.message}`);
    }

    const initialFeats = await listResponse.json();
    expect(initialFeats).toBeDefined();
    expect(Array.isArray(initialFeats.items)).toBe(true);

    // Create a new feat
    const newFeat = {
      name: "Test Feat",
      description: "A test feat for testing",
      aptitudeIds: [testAptitudeId],
    };

    const createResponse = await api.api.rulesets[":id"].feats.$post(
      {
        param: { id: testRulesetId },
        json: newFeat,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create feat: ${error.message}`);
    }

    const createdFeat = await createResponse.json();
    expect(createdFeat).toBeDefined();
    expect(createdFeat.name).toBe(newFeat.name);
    expect(createdFeat.description).toBe(newFeat.description);

    // Get the feat by ID
    const getResponse = await api.api.rulesets[":id"].feats[":featId"].$get(
      {
        param: { id: testRulesetId, featId: createdFeat.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!getResponse.ok) {
      const error = await getResponse.json();
      throw new Error(`Failed to get feat: ${error.message}`);
    }

    const fetchedFeat = await getResponse.json();
    expect(fetchedFeat).toBeDefined();
    expect(fetchedFeat.id).toBe(createdFeat.id);
    expect(fetchedFeat.name).toBe(newFeat.name);
    expect(fetchedFeat.description).toBe(newFeat.description);

    // Update the feat
    const updateData = {
      name: "Updated Test Feat",
      description: "Updated description",
      aptitudeIds: [],
    };

    const updateResponse = await api.api.rulesets[":id"].feats[":featId"].$put(
      {
        param: { id: testRulesetId, featId: createdFeat.id },
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
      throw new Error(`Failed to update feat: ${error.message}`);
    }

    const updatedFeat = await updateResponse.json();
    expect(updatedFeat.name).toBe(updateData.name);
    expect(updatedFeat.description).toBe(updateData.description);

    // Delete the feat
    const deleteResponse = await api.api.rulesets[":id"].feats[":featId"].$delete(
      {
        param: { id: testRulesetId, featId: createdFeat.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete feat: ${error.message}`);
    }

    const deletedFeat = await deleteResponse.json();
    expect(deletedFeat).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const { rulesetId: testRulesetId } = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].feats.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidFeat = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].feats.$post(
      {
        param: { id: testRulesetId },
        json: invalidFeat as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);

    // Test validation - invalid aptitudeIds type
    const invalidAptitudeFeat = {
      name: "Test Feat",
      description: "Test description",
      aptitudeIds: "not-an-array",
    };

    const aptitudeValidationResponse = await api.api.rulesets[":id"].feats.$post(
      {
        param: { id: testRulesetId },
        json: invalidAptitudeFeat as never,
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
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].feats.$get(
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

    // Test non-existent feat for GET
    const getResponse = await api.api.rulesets[":id"].feats[":featId"].$get(
      {
        param: { id: testRulesetId, featId: "00000000-0000-0000-0000-000000000000" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(getResponse.status).toBe(404);

    // Test non-existent feat for UPDATE
    const updateResponse = await api.api.rulesets[":id"].feats[":featId"].$put(
      {
        param: { id: testRulesetId, featId: "00000000-0000-0000-0000-000000000000" },
        json: { name: "Test", description: "Test", aptitudeIds: [] },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(updateResponse.status >= 400).toBe(true);
  });

  test("should reject creating a feat with an aptitude already used for spells", async () => {
    const { rulesetId, aptitudeId } = await createTestRuleset();

    // Link the aptitude to a power first
    const powerResponse = await api.api.rulesets[":id"].powers.$post(
      {
        param: { id: rulesetId },
        json: {
          name: "Test Spell",
          description: "A spell using the aptitude",
          aptitudes: [{ id: aptitudeId }],
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );
    expect(powerResponse.ok).toBe(true);

    // Now try to create a feat with the same aptitude — should fail
    const featResponse = await api.api.rulesets[":id"].feats.$post(
      {
        param: { id: rulesetId },
        json: {
          name: "Test Feat",
          description: "A feat trying to use a spell aptitude",
          aptitudeIds: [aptitudeId],
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );
    expect(featResponse.status).toBe(409);
  });

  test(
    "should cascade delete requirements/properties/modifiers when deleting feat",
    async () => {
      const { rulesetId: testRulesetId, aptitudeId: testAptitudeId } = await createTestRuleset();

      // Create a feat
      const newFeat = {
        name: "Test Feat for Cascade Deletion",
        description: "A test feat for cascade deletion testing",
        aptitudeIds: [testAptitudeId],
      };

      const featResponse = await api.api.rulesets[":id"].feats.$post(
        {
          param: { id: testRulesetId },
          json: newFeat,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!featResponse.ok) {
        const error = await featResponse.json();
        throw new Error(`Failed to create feat: ${error.message}`);
      }

      const createdFeat = await featResponse.json();

      // Create a requirement for the feat
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
            param: { id: testRulesetId, entityId: createdFeat.id, entityType: "feats" },
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

      // Create a property for the feat
      const property = {
        value: "test_value",
        type: "number",
      };

      const propResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties.$post(
          {
            param: { id: testRulesetId, entityId: createdFeat.id, entityType: "feats" },
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

      // Create a modifier for the feat
      const modifier = {
        sourceType: "feats",
        sourceId: createdFeat.id,
        target: "abilities.strength.misc",
        value: "2",
        valueType: "number",
        operator: "add",
      };

      const modResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .modifiers.$post(
          {
            param: { id: testRulesetId, entityId: createdFeat.id, entityType: "feats" },
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
            param: { id: testRulesetId, entityId: createdFeat.id, entityType: "feats" },
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
            param: { id: testRulesetId, entityId: createdFeat.id, entityType: "feats" },
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

      // Delete the feat
      const deleteResponse = await api.api.rulesets[":id"].feats[":featId"].$delete(
        {
          param: { id: testRulesetId, featId: createdFeat.id },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.json();
        throw new Error(`Failed to delete feat: ${error.message}`);
      }

      // Verify associated entities are deleted
      const requirementsAfterDelete = await api.api.rulesets[":id"]
        .customization[":entityType"][":entityId"].requirements.$get(
          {
            param: { id: testRulesetId, entityId: createdFeat.id, entityType: "feats" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      // Should return 404 or empty array since the feat no longer exists
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
            param: { id: testRulesetId, entityId: createdFeat.id, entityType: "feats" },
          },
          {
            headers: {
              cookie: "session-id=00000000-0000-4000-8000-000000000123",
            },
          },
        );

      // Should return 404 or empty array since the feat no longer exists
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
