import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets customization requirements", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  // Helper to create test aptitude
  async function createTestAptitude(rulesetId: string): Promise<string> {
    const newAptitude = {
      name: `Test Aptitude ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test aptitude for requirements testing",
    };

    const response = await api.api.rulesets[":id"].aptitudes.$post(
      {
        param: { id: rulesetId },
        json: newAptitude,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create test aptitude: ${error}`);
    }

    const createdAptitude = await response.json();
    return createdAptitude.id;
  }

  // Helper to create test feat
  async function createTestFeat(rulesetId: string, aptitudeId: string): Promise<string> {
    const newFeat = {
      name: `Test Feat ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test feat for requirements testing",
      aptitudeIds: [aptitudeId],
    };

    const response = await api.api.rulesets[":id"].feats.$post(
      {
        param: { id: rulesetId },
        json: newFeat,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create test feat: ${error.message}`);
    }

    const createdFeat = await response.json();
    return createdFeat.id;
  }

  // Helper to create test item
  async function createTestItem(rulesetId: string): Promise<string> {
    const newItem = {
      name: `Sword ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test item for requirements testing",
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
      }
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
      }
    );

    if (!aptitudeResponse.ok) {
      const errorText = await aptitudeResponse.text();
      throw new Error(`Failed to create test aptitude: ${errorText}`);
    }

    const createdAptitude = await aptitudeResponse.json();

    // Create power
    const newPower = {
      name: `Test Power ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test power for requirements testing",
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
      }
    );

    if (!powerResponse.ok) {
      const errorText = await powerResponse.text();
      throw new Error(`Failed to create test power: ${errorText}`);
    }

    const createdPower = await powerResponse.json();
    return createdPower.id;
  }

  // Helper to create test class and class level
  async function createTestClassLevel(rulesetId: string): Promise<{ classId: string; levelId: string }> {
    const newClass = {
      name: `Fighter ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test class for requirements testing",
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
      }
    );

    if (!classResponse.ok) {
      const error = await classResponse.json();
      throw new Error(`Failed to create test class: ${error.message}`);
    }

    const createdClass = await classResponse.json();

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
      }
    );

    if (!levelResponse.ok) {
      const error = await levelResponse.json();
      throw new Error(`Failed to create test class level: ${error.message}`);
    }

    const createdLevel = await levelResponse.json();
    return { classId: createdClass.id, levelId: createdLevel.id };
  }

  // Test feat requirements CRUD
  test("should handle feat requirements CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();
    const testAptitudeId = await createTestAptitude(testRulesetId);
    const testFeatId = await createTestFeat(testRulesetId, testAptitudeId);

    // Get initial list (should be empty)
    const listResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$get(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get feat requirements: ${error.message}`);
    }

    const requirements = await listResponse.json();
    expect(requirements).toBeDefined();
    expect(Array.isArray(requirements)).toBe(true);
    expect(requirements.length).toBe(0);

    // Create a requirement
    const newRequirement = {
      level: "3",
      target: "abilities.charisma.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    };

    const createResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: newRequirement,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create feat requirement: ${error.message}`);
    }

    const createdRequirement = await createResponse.json();
    expect(createdRequirement).toBeDefined();
    expect(createdRequirement.level).toBe(newRequirement.level);
    expect(createdRequirement.target).toBe(newRequirement.target);
    expect(createdRequirement.value).toBe(newRequirement.value);
    expect(createdRequirement.valueType).toBe(newRequirement.valueType);
    expect(createdRequirement.operator).toBe(newRequirement.operator);
    expect(createdRequirement.chainingOperator).toBe(null);
    expect(createdRequirement.entityType).toBe("feats");
    expect(createdRequirement.entityId).toBe(testFeatId);

    // Update the requirement
    const updateData = {
      level: "7",
      target: "abilities.constitution.total",
      value: "16",
      valueType: "number",
      operator: "greater_than",
    };

    const updateResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].requirements[":requirement_id"].$put(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            requirement_id: createdRequirement.id,
          },
          json: updateData,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!updateResponse.ok) {
      const error = await updateResponse.json();
      throw new Error(`Failed to update requirement: ${error.message}`);
    }

    const updatedRequirement = await updateResponse.json();
    expect(updatedRequirement.level).toBe(updateData.level);
    expect(updatedRequirement.target).toBe(updateData.target);
    expect(updatedRequirement.value).toBe(updateData.value);
    expect(updatedRequirement.valueType).toBe(updateData.valueType);
    expect(updatedRequirement.operator).toBe(updateData.operator);
    expect(updatedRequirement.chainingOperator).toBe(null);

    // Delete the requirement
    const deleteResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].requirements[":requirement_id"].$delete(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            requirement_id: createdRequirement.id,
          },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete requirement: ${error.message}`);
    }

    const deletedRequirement = await deleteResponse.json();
    expect(deletedRequirement).toBeDefined();
  });

  test("should create feat requirement with chaining operator", async () => {
    const testRulesetId = await createTestRuleset();
    const testAptitudeId = await createTestAptitude(testRulesetId);
    const testFeatId = await createTestFeat(testRulesetId, testAptitudeId);

    const newRequirement = {
      level: "1",
      chainingOperator: "and",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: newRequirement,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create feat requirement: ${error.message}`);
    }

    const createdRequirement = await response.json();
    expect(createdRequirement).toBeDefined();
    expect(createdRequirement.level).toBe(newRequirement.level);
    expect(createdRequirement.target).toBe(null);
    expect(createdRequirement.value).toBe(null);
    expect(createdRequirement.valueType).toBe(null);
    expect(createdRequirement.operator).toBe(null);
    expect(createdRequirement.chainingOperator).toBe(newRequirement.chainingOperator);
  });

  test("should create feat requirement with minimal fields", async () => {
    const testRulesetId = await createTestRuleset();
    const testAptitudeId = await createTestAptitude(testRulesetId);
    const testFeatId = await createTestFeat(testRulesetId, testAptitudeId);

    const newRequirement = {
      level: "1.0.0",
      target: "combat.bab",
      operator: "greater_than_or_equal",
      value: "10",
      valueType: "number",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: newRequirement,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create feat requirement: ${error.message}`);
    }

    const createdRequirement = await response.json();
    expect(createdRequirement).toBeDefined();
    expect(createdRequirement.level).toBe(newRequirement.level);
    expect(createdRequirement.target).toBe(newRequirement.target);
    expect(createdRequirement.value).toBe(newRequirement.value);
    expect(createdRequirement.valueType).toBe(newRequirement.valueType);
    expect(createdRequirement.operator).toBe(newRequirement.operator);
    expect(createdRequirement.chainingOperator).toBe(null);
  });

  // Test requirements for different entity types
  test("should create and manage item requirements", async () => {
    const testRulesetId = await createTestRuleset();
    const testItemId = await createTestItem(testRulesetId);

    const newRequirement = {
      level: "1",
      target: "abilities.strength.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityType: "items", entityId: testItemId },
          json: newRequirement,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create item requirement: ${error.message}`);
    }

    const createdRequirement = await response.json();
    expect(createdRequirement.entityType).toBe("items");
    expect(createdRequirement.entityId).toBe(testItemId);
  });

  test("should create and manage power requirements", async () => {
    const testRulesetId = await createTestRuleset();
    const testPowerId = await createTestPower(testRulesetId);

    const newRequirement = {
      level: "1",
      target: "abilities.intelligence.total",
      value: "14",
      valueType: "number",
      operator: "greater_than_or_equal",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityType: "powers", entityId: testPowerId },
          json: newRequirement,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create power requirement: ${error.message}`);
    }

    const createdRequirement = await response.json();
    expect(createdRequirement.entityType).toBe("powers");
    expect(createdRequirement.entityId).toBe(testPowerId);
  });

  test("should create and manage klass_levels requirements", async () => {
    const testRulesetId = await createTestRuleset();
    const { levelId } = await createTestClassLevel(testRulesetId);

    const newRequirement = {
      level: "2",
      target: "abilities.wisdom.total",
      value: "12",
      valueType: "number",
      operator: "greater_than_or_equal",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityType: "klass_levels", entityId: levelId },
          json: newRequirement,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create klass_levels requirement: ${error.message}`);
    }

    const createdRequirement = await response.json();
    expect(createdRequirement.entityType).toBe("klass_levels");
    expect(createdRequirement.entityId).toBe(levelId);
  });

  // Test authentication and validation
  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();
    const testAptitudeId = await createTestAptitude(testRulesetId);
    const testFeatId = await createTestFeat(testRulesetId, testAptitudeId);

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$get({
        param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
      });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidRequirement = {
      target: "abilities.strength.total",
      value: "13",
      // missing level
    };

    const validationResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: invalidRequirement as unknown as {
            level: string;
            target?: string;
            value?: string;
            valueType?: string;
            operator?: string;
            chainingOperator?: string;
          },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    expect(validationResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();
    const testAptitudeId = await createTestAptitude(testRulesetId);
    const testFeatId = await createTestFeat(testRulesetId, testAptitudeId);

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$get(
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
        }
      );

    expect(nonExistentRulesetResponse.status).toBe(404);

    // Test non-existent entity
    const nonExistentEntityResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$get(
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
        }
      );

    expect(nonExistentEntityResponse.status).toBe(404);

    // Test non-existent requirement for update
    const updateData = {
      level: "1",
      target: "abilities.wisdom.total",
      value: "1",
      valueType: "number",
      operator: "equal",
    };

    const updateResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements[":requirement_id"].$put(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            requirement_id: "00000000-0000-0000-0000-000000000000",
          },
          json: updateData,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        }
      );

    expect(updateResponse.status >= 400).toBe(true);
  });
});
