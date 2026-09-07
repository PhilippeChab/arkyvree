import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets customization modifiers", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  // Helper to create test feat
  async function createTestFeat(rulesetId: string): Promise<string> {
    // Create aptitude first (required for feats)
    const newAptitude = {
      name: `Test Aptitude ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test aptitude for modifiers testing",
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

    // Create feat
    const newFeat = {
      name: `Test Feat ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test feat for modifiers testing",
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
      const errorText = await featResponse.text();
      throw new Error(`Failed to create test feat: ${errorText}`);
    }

    const createdFeat = await featResponse.json();
    return createdFeat.id;
  }

  // Helper to create test item
  async function createTestItem(rulesetId: string): Promise<string> {
    const newItem = {
      name: `Test Item ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test item for modifiers testing",
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
      description: "A test power for modifiers testing",
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
    // Create class first
    const newClass = {
      name: `Test Class ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test class for modifiers testing",
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

    // Create class level
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

  test("should handle full feat modifier CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();
    const testFeatId = await createTestFeat(testRulesetId);

    // Get initial list (should be empty)
    const listResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$get(
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
      const errorText = await listResponse.text();
      throw new Error(`Failed to get feat modifiers: ${errorText}`);
    }

    const modifiers = await listResponse.json();
    expect(modifiers).toBeDefined();
    expect(Array.isArray(modifiers)).toBe(true);
    expect(modifiers.length).toBe(0);

    // Create a new modifier
    const newModifier = {
      target: "abilities.strength.misc",
      value: "2",
      valueType: "number",
      operator: "add",
    };

    const createResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: newModifier,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create feat modifier: ${errorText}`);
    }

    const createdModifier = await createResponse.json();
    expect(createdModifier).toBeDefined();
    expect(createdModifier.target).toBe(newModifier.target);
    expect(createdModifier.value).toBe(newModifier.value);
    expect(createdModifier.valueType).toBe(newModifier.valueType);
    expect(createdModifier.operator).toBe(newModifier.operator);
    expect(createdModifier.sourceType).toBe("feats");
    expect(createdModifier.sourceId).toBe(testFeatId);

    // Update the modifier
    const updateData = {
      target: "abilities.constitution.misc",
      value: "3",
      valueType: "number",
      operator: "add",
    };

    const updateResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].modifiers[":modifierId"].$put(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            modifierId: createdModifier.id,
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
      throw new Error(`Failed to update modifier: ${error.message}`);
    }

    const updatedModifier = await updateResponse.json();
    expect(updatedModifier.target).toBe(updateData.target);
    expect(updatedModifier.value).toBe(updateData.value);
    expect(updatedModifier.valueType).toBe(updateData.valueType);
    expect(updatedModifier.operator).toBe(updateData.operator);

    // Delete the modifier
    const deleteResponse = await api.api.rulesets[":id"]
      .customization[":entityType"][":entityId"].modifiers[":modifierId"].$delete(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            modifierId: createdModifier.id,
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
      throw new Error(`Failed to delete modifier: ${error.message}`);
    }

    const deletedModifier = await deleteResponse.json();
    expect(deletedModifier).toBeDefined();
  });

  test("should create and manage item modifiers", async () => {
    const testRulesetId = await createTestRuleset();
    const testItemId = await createTestItem(testRulesetId);

    const newModifier = {
      target: "combat.ac.armor",
      value: "2",
      valueType: "number",
      operator: "add",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$post(
        {
          param: { id: testRulesetId, entityType: "items", entityId: testItemId },
          json: newModifier,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create item modifier: ${error.message}`);
    }

    const createdModifier = await response.json();
    expect(createdModifier.sourceType).toBe("items");
    expect(createdModifier.sourceId).toBe(testItemId);
  });

  test("should create and manage power modifiers", async () => {
    const testRulesetId = await createTestRuleset();
    const testPowerId = await createTestPower(testRulesetId);

    const newModifier = {
      target: "abilities.intelligence.misc",
      value: "1",
      valueType: "number",
      operator: "add",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$post(
        {
          param: { id: testRulesetId, entityType: "powers", entityId: testPowerId },
          json: newModifier,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create power modifier: ${error.message}`);
    }

    const createdModifier = await response.json();
    expect(createdModifier.sourceType).toBe("powers");
    expect(createdModifier.sourceId).toBe(testPowerId);
  });

  test("should create and manage klass_levels modifiers", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassLevelId = await createTestClassLevel(testRulesetId);

    const newModifier = {
      target: "combat.hp.misc",
      value: "5",
      valueType: "number",
      operator: "add",
    };

    const response = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$post(
        {
          param: { id: testRulesetId, entityType: "klass_levels", entityId: testClassLevelId },
          json: newModifier,
        },
        {
          headers: {
            cookie: "session-id=00000000-0000-4000-8000-000000000123",
          },
        },
      );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create klass_levels modifier: ${error.message}`);
    }

    const createdModifier = await response.json();
    expect(createdModifier.sourceType).toBe("klass_levels");
    expect(createdModifier.sourceId).toBe(testClassLevelId);
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();
    const testFeatId = await createTestFeat(testRulesetId);

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$get({
        param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
      });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidModifier = {
      value: "2",
      valueType: "enhancement",
      operator: "add",
      // missing target
    };

    const validationResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$post(
        {
          param: { id: testRulesetId, entityType: "feats", entityId: testFeatId },
          json: invalidModifier as unknown as {
            target: string;
            value: string;
            valueType: string;
            operator: string;
          },
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
    const testFeatId = await createTestFeat(testRulesetId);

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers.$get(
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
      .modifiers.$get(
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

    // Test non-existent modifier for update
    const updateData = {
      target: "abilities.wisdom.misc",
      value: "1",
      valueType: "number",
      operator: "add",
    };

    const updateResponse = await api.api.rulesets[":id"].customization[":entityType"][":entityId"]
      .modifiers[":modifierId"].$put(
        {
          param: {
            id: testRulesetId,
            entityType: "feats",
            entityId: testFeatId,
            modifierId: "00000000-0000-0000-0000-000000000000",
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
