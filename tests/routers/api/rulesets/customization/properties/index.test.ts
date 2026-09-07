import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets customization properties", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  // Helper to create test feat with dependencies
  async function createTestFeat(rulesetId: string): Promise<string> {
    // Create test aptitude first (required for feats)
    const newAptitude = {
      name: `Test Aptitude ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test aptitude for properties testing",
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
      const errorText = await aptitudeResponse.text();
      throw new Error(`Failed to create test aptitude: ${errorText}`);
    }

    const createdAptitude = await aptitudeResponse.json();

    // Create test feat
    const newFeat = {
      name: `Test Feat ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test feat for properties testing",
      aptitudeIds: [createdAptitude.id],
    };

    const featResponse = await api.api.rulesets[":id"].feats.$post(
      {
        param: { id: rulesetId },
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
      throw new Error(`Failed to create test feat: ${error.message}`);
    }

    const createdFeat = await featResponse.json();
    return createdFeat.id;
  }

  // Helper to create test item
  async function createTestItem(rulesetId: string): Promise<string> {
    const newItem = {
      name: `Test Item ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test item for properties testing",
      weight: 1.0,
      costGp: 50,
    };

    const response = await api.api.rulesets[":id"].items.$post(
      {
        param: { id: rulesetId },
        json: newItem,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create test item: ${error.message}`);
    }

    const createdItem = await response.json();
    return createdItem.id;
  }

  // Helper to create test power
  async function createTestPower(rulesetId: string): Promise<string> {
    // Create aptitude first (required for powers)
    const newAptitude = {
      name: `Test Aptitude ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test aptitude for power creation",
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
      const errorText = await aptitudeResponse.text();
      throw new Error(`Failed to create test aptitude: ${errorText}`);
    }

    const createdAptitude = await aptitudeResponse.json();

    // Create power
    const newPower = {
      name: `Test Power ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test power for properties testing",
      aptitudes: [{ id: createdAptitude.id }],
    };

    const powerResponse = await api.api.rulesets[":id"].powers.$post(
      {
        param: { id: rulesetId },
        json: newPower,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!powerResponse.ok) {
      const errorText = await powerResponse.text();
      throw new Error(`Failed to create test power: ${errorText}`);
    }

    const createdPower = await powerResponse.json();
    return createdPower.id;
  }

  // Helper to create test class level
  async function createTestClassLevel(rulesetId: string): Promise<string> {
    // Create test class first
    const newClass = {
      name: `Test Class ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test class for properties testing",
      hitDie: 8,
    };

    const classResponse = await api.api.rulesets[":id"].classes.$post(
      {
        param: { id: rulesetId },
        json: newClass,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!classResponse.ok) {
      const error = await classResponse.json();
      throw new Error(`Failed to create test class: ${error.message}`);
    }

    const createdClass = await classResponse.json();

    // Create test class level
    const newLevel = {
      level: 1,
      bab: 1,
      skills: 4,
    };

    const levelResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$post(
      {
        param: { id: rulesetId, classId: createdClass.id },
        json: newLevel,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!levelResponse.ok) {
      const error = await levelResponse.json();
      throw new Error(`Failed to create test class level: ${error.message}`);
    }

    const createdLevel = await levelResponse.json();
    return createdLevel.id;
  }

  // Test feat properties CRUD lifecycle
  test("should handle full feat property CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();
    const testFeatId = await createTestFeat(testRulesetId);

    // Get initial list (should be empty)
    const listResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$get(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get feat properties: ${error.message}`);
    }

    const properties = await listResponse.json();
    expect(properties).toBeDefined();
    expect(Array.isArray(properties)).toBe(true);
    expect(properties.length).toBe(0);

    // Create a new property
    const newProperty = {
      value: "magic weapon",
      type: "special",
    };

    const createResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: newProperty,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create feat property: ${error.message}`);
    }

    const createdProperty = await createResponse.json();
    expect(createdProperty).toBeDefined();
    expect(createdProperty.value).toBe(newProperty.value);
    expect(createdProperty.type).toBe(newProperty.type);
    expect(createdProperty.entityType).toBe("feats");
    expect(createdProperty.entityId).toBe(testFeatId);

    // Update the property
    const updateData = {
      value: "extraordinary ability",
      type: "special",
    };

    const updateResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].properties[":property_id"].$put(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            property_id: createdProperty.id,
          },
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
      throw new Error(`Failed to update property: ${error.message}`);
    }

    const updatedProperty = await updateResponse.json();
    expect(updatedProperty.value).toBe(updateData.value);
    expect(updatedProperty.type).toBe(updateData.type);

    // Delete the property
    const deleteResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].properties[":property_id"].$delete(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            property_id: createdProperty.id,
          },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete property: ${error.message}`);
    }

    const deletedProperty = await deleteResponse.json();
    expect(deletedProperty).toBeDefined();
  });

  // Test properties for different entity types
  test("should create and manage item properties", async () => {
    const testRulesetId = await createTestRuleset();
    const testItemId = await createTestItem(testRulesetId);

    const newProperty = {
      value: "masterwork",
      type: "quality",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$post(
        {
          param: { id: testRulesetId, entityType: "items", entityId: testItemId },
          json: newProperty,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create item property: ${error.message}`);
    }

    const createdProperty = await response.json();
    expect(createdProperty.entityType).toBe("items");
    expect(createdProperty.entityId).toBe(testItemId);
  });

  test("should create and manage power properties", async () => {
    const testRulesetId = await createTestRuleset();
    const testPowerId = await createTestPower(testRulesetId);

    const newProperty = {
      value: "metamagic compatible",
      type: "enhancement",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$post(
        {
          param: { id: testRulesetId, entityType: "powers", entityId: testPowerId },
          json: newProperty,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create power property: ${error.message}`);
    }

    const createdProperty = await response.json();
    expect(createdProperty.entityType).toBe("powers");
    expect(createdProperty.entityId).toBe(testPowerId);
  });

  test("should create and manage klass_levels properties", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassLevelId = await createTestClassLevel(testRulesetId);

    const newProperty = {
      value: "spell access",
      type: "feature",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$post(
        {
          param: { id: testRulesetId, entityType: "klass_levels", entityId: testClassLevelId },
          json: newProperty,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create klass_levels property: ${error.message}`);
    }

    const createdProperty = await response.json();
    expect(createdProperty.entityType).toBe("klass_levels");
    expect(createdProperty.entityId).toBe(testClassLevelId);
  });

  // Test authentication and validation
  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();
    const testFeatId = await createTestFeat(testRulesetId);

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$get({
        param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
      });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidProperty = {
      type: "special",
      // missing value
    };

    const validationResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: invalidProperty as unknown as { value: string; type: string },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    expect(validationResponse.status).toBe(400);
  });

  // Test error cases
  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();
    const testFeatId = await createTestFeat(testRulesetId);

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$get(
        {
          param: {
            id: "00000000-0000-0000-0000-000000000000",
            entityType: "feats",
            entityId: testFeatId,
          },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    expect(nonExistentRulesetResponse.status).toBe(404);

    // Test non-existent entity
    const nonExistentEntityResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties.$get(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: "00000000-0000-0000-0000-000000000000",
          },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    expect(nonExistentEntityResponse.status).toBe(404);

    // Test non-existent property for update
    const updateData = {
      value: "test property",
      type: "test",
    };

    const updateResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .properties[":property_id"].$put(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            property_id: "00000000-0000-0000-0000-000000000000",
          },
          json: updateData,
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
