import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import type { InferRequestType } from "hono/client";
import { expect, describe, test } from "bun:test";

describe("rulesets class levels", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  // Helper to create test class
  async function createTestClass(rulesetId: string): Promise<string> {
    const newClass: InferRequestType<(typeof api.api.rulesets)[":id"]["classes"]["$post"]>["json"] = {
      name: `Test Class ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test class for levels testing",
      hd: 10,
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
    return createdClass.id;
  }

  // Helper to create test class level
  async function createTestClassLevel(
    rulesetId: string,
    classId: string,
    level: number,
  ): Promise<{ id: string; level: number; bab: number; skills: number }> {
    const newLevel = {
      level,
      bab: level,
      skills: 4,
    };

    const response = await api.api.rulesets[":id"].classes[":classId"].levels.$post(
      {
        param: { id: rulesetId, classId },
        json: newLevel,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create class level: ${error.message}`);
    }

    return await response.json();
  }

  test("should handle full class level CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);

    // Get initial list (should be empty)
    const listResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$get(
      {
        param: { id: testRulesetId, classId: testClassId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(`Failed to get class levels: ${error.message}`);
    }

    const levels = await listResponse.json();
    expect(levels).toBeDefined();
    expect(Array.isArray(levels)).toBe(true);

    // Create a new class level
    const newLevel = {
      level: 1,
      bab: 1,
      skills: 4,
    };

    const createResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: newLevel,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create class level: ${error.message}`);
    }

    const createdLevel = await createResponse.json();
    expect(createdLevel).toBeDefined();
    expect(createdLevel.level).toBe(newLevel.level);
    expect(createdLevel.bab).toBe(newLevel.bab);
    expect(createdLevel.skills).toBe(newLevel.skills);

    // Update the class level
    const updateData = {
      bab: 3,
      skills: 6,
    };

    const updateResponse = await api.api.rulesets[":id"].classes[":classId"].levels[":levelId"]
      .$put(
        {
          param: { id: testRulesetId, classId: testClassId, levelId: createdLevel.id },
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
      throw new Error(`Failed to update class level: ${error.message}`);
    }

    const updatedLevel = await updateResponse.json();
    expect(updatedLevel.level).toBe(newLevel.level); // Level should remain unchanged
    expect(updatedLevel.bab).toBe(updateData.bab);
    expect(updatedLevel.skills).toBe(updateData.skills);

    // Get the specific class level by ID
    const getResponse = await api.api.rulesets[":id"].class_levels[":classLevelId"].$get(
      {
        param: { id: testRulesetId, classLevelId: createdLevel.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!getResponse.ok) {
      const error = await getResponse.json();
      throw new Error(`Failed to get class level: ${error.message}`);
    }

    const fetchedLevel = await getResponse.json();
    expect(fetchedLevel).toBeDefined();
    expect(fetchedLevel.id).toBe(createdLevel.id);

    // Delete the class level
    const deleteResponse = await api.api.rulesets[":id"].classes[":classId"].levels[":levelId"]
      .$delete(
        {
          param: { id: testRulesetId, classId: testClassId, levelId: createdLevel.id },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete class level: ${error.message}`);
    }

    const deletedLevel = await deleteResponse.json();
    expect(deletedLevel).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$get({
      param: { id: testRulesetId, classId: testClassId },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidLevel = {
      bab: 1,
      // Missing level field
    };

    const validationResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: invalidLevel as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);

    // Test validation - invalid data types
    const invalidTypeLevel = {
      level: "not-a-number",
      bab: 1,
      skills: 4,
    };

    const typeValidationResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: invalidTypeLevel as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(typeValidationResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$get(
      {
        param: { id: "00000000-0000-0000-0000-000000000000", classId: testClassId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(nonExistentRulesetResponse.status).toBe(404);

    // Test non-existent class
    const nonExistentClassResponse = await api.api.rulesets[":id"].classes[":classId"].levels.$get(
      {
        param: { id: testRulesetId, classId: "00000000-0000-0000-0000-000000000000" },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(nonExistentClassResponse.status).toBe(404);

    // Test non-existent class level
    const updateResponse = await api.api.rulesets[":id"].classes[":classId"].levels[":levelId"]
      .$put(
        {
          param: {
            id: testRulesetId,
            classId: testClassId,
            levelId: "00000000-0000-0000-0000-000000000000",
          },
          json: {
            bab: 1,
            skills: 4,
          },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    expect(updateResponse.status >= 400).toBe(true);
  });

  test("should create requirement when creating class level > 1", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);

    // Create level 5 which should automatically create a requirement for level 4
    const level5 = await createTestClassLevel(testRulesetId, testClassId, 5);

    // Check if requirement was created
    const requirementsResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].requirements.$get(
        {
          param: { id: testRulesetId, entityId: level5.id, entityType: "klass_levels" },
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
    expect(requirements).toBeDefined();
    expect(Array.isArray(requirements)).toBe(true);
    expect(requirements.length > 0).toBe(true);

    // Check the requirement details
    const requirement = requirements[0];
    expect(requirement.level).toBe("1");
    expect(requirement.valueType).toBe("number");
    expect(requirement.operator).toBe("greater_than");
    expect(requirement.value).toBe("4"); // Should require level 4 (level 5 - 1)
  });

  test("should not create requirement when creating class level 1", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);

    // Create level 1 (should not create any requirements)
    const level1 = await createTestClassLevel(testRulesetId, testClassId, 1);

    // Check if no requirements were created
    const requirementsResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].requirements.$get(
        {
          param: { id: testRulesetId, entityId: level1.id, entityType: "klass_levels" },
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
    expect(requirements).toBeDefined();
    expect(Array.isArray(requirements)).toBe(true);
    expect(requirements.length).toBe(0); // Should have no requirements
  });

  test("should delete associated requirements when deleting class level", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);

    // Create a class level with automatic requirement
    const newLevel = await createTestClassLevel(testRulesetId, testClassId, 7);

    // Create a custom requirement for this level
    const customRequirement = {
      level: "2",
      target: "abilities.strength.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    };

    const reqResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .requirements.$post(
        {
          param: { id: testRulesetId, entityId: newLevel.id, entityType: "klass_levels" },
          json: customRequirement,
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

    // Verify requirements exist
    const requirementsResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].requirements.$get(
        {
          param: { id: testRulesetId, entityId: newLevel.id, entityType: "klass_levels" },
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
    expect(requirements.length >= 1).toBe(true); // Should have at least the custom requirement

    // Delete the class level
    const deleteResponse = await api.api.rulesets[":id"].classes[":classId"].levels[":levelId"]
      .$delete(
        {
          param: { id: testRulesetId, classId: testClassId, levelId: newLevel.id },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete class level: ${error.message}`);
    }

    // Verify requirements are deleted (should return 404 or empty array)
    const requirementsAfterDelete = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].requirements.$get(
        {
          param: { id: testRulesetId, entityId: newLevel.id, entityType: "klass_levels" },
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    // Should either return 404 or empty array since the entity no longer exists
    if (requirementsAfterDelete.ok) {
      const deletedRequirements = await requirementsAfterDelete.json();
      expect(Array.isArray(deletedRequirements)).toBe(true);
      expect(deletedRequirements.length).toBe(0);
    } else {
      // 404 is also acceptable since the entity no longer exists
      expect(requirementsAfterDelete.status).toBe(404);
    }
  });
});
