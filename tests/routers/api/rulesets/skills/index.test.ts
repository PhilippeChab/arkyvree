import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("rulesets skills", () => {
  const api = testClient<Application>(application);

  // Helper to create test ruleset
  async function createTestRuleset(): Promise<string> {
    const ruleset = await createSeededTestRuleset("00000000-0000-4000-8000-000000000456");
    return ruleset.id;
  }

  // Helper to fetch an ability ID from the ruleset (auto-seeded on creation)
  async function getAbilityId(rulesetId: string, abilityName: string): Promise<string> {
    const response = await api.api.rulesets[":id"].abilities.$get(
      {
        param: { id: rulesetId },
        query: { limit: "100", page: "1", search: abilityName },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch abilities`);
    }

    const data = await response.json();
    const ability = data.items.find((a: { name: string }) => a.name === abilityName);
    if (!ability) throw new Error(`Ability ${abilityName} not found`);
    return ability.id;
  }

  test("should handle full skill CRUD lifecycle", async () => {
    const testRulesetId = await createTestRuleset();
    const intelligenceId = await getAbilityId(testRulesetId, "Intelligence");
    const wisdomId = await getAbilityId(testRulesetId, "Wisdom");

    // Get initial list (should be empty or have base skills)
    const listResponse = await api.api.rulesets[":id"].skills.$get(
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
      throw new Error(`Failed to get skills: ${error.message}`);
    }

    const initialSkills = await listResponse.json();
    expect(initialSkills).toBeDefined();
    expect(Array.isArray(initialSkills.items)).toBe(true);

    // Create a new skill
    const newSkill = {
      name: "Test Skill",
      description: "A test skill for testing",
      primaryAbilityId: intelligenceId,
      impactedByWeight: false,
      usableWithoutTraining: true,
    };

    const createResponse = await api.api.rulesets[":id"].skills.$post(
      {
        param: { id: testRulesetId },
        json: newSkill,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create skill: ${error.message}`);
    }

    const createdSkill = await createResponse.json();
    expect(createdSkill).toBeDefined();
    expect(createdSkill.name).toBe(newSkill.name);
    expect(createdSkill.description).toBe(newSkill.description);
    expect(createdSkill.primaryAbilityId).toBe(newSkill.primaryAbilityId);
    expect(createdSkill.impactedByWeight).toBe(newSkill.impactedByWeight);
    expect(createdSkill.usableWithoutTraining).toBe(newSkill.usableWithoutTraining);

    // Update the skill
    const updateData = {
      name: "Updated Test Skill",
      description: "Updated description",
      primaryAbilityId: wisdomId,
      impactedByWeight: false,
      usableWithoutTraining: true,
    };

    const updateResponse = await api.api.rulesets[":id"].skills[":skillId"].$put(
      {
        param: { id: testRulesetId, skillId: createdSkill.id },
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
      throw new Error(`Failed to update skill: ${error.message}`);
    }

    const updatedSkill = await updateResponse.json();
    expect(updatedSkill.name).toBe(updateData.name);
    expect(updatedSkill.description).toBe(updateData.description);
    expect(updatedSkill.primaryAbilityId).toBe(updateData.primaryAbilityId);
    expect(updatedSkill.impactedByWeight).toBe(updateData.impactedByWeight);
    expect(updatedSkill.usableWithoutTraining).toBe(updateData.usableWithoutTraining);

    // Delete the skill
    const deleteResponse = await api.api.rulesets[":id"].skills[":skillId"].$delete(
      {
        param: { id: testRulesetId, skillId: createdSkill.id },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      throw new Error(`Failed to delete skill: ${error.message}`);
    }

    const deletedSkill = await deleteResponse.json();
    expect(deletedSkill).toBeDefined();
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].skills.$get({
      param: { id: testRulesetId },
      query: { limit: "10", page: "1" },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidSkill = {
      description: "Missing name field",
    };

    const validationResponse = await api.api.rulesets[":id"].skills.$post(
      {
        param: { id: testRulesetId },
        json: invalidSkill as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(validationResponse.status).toBe(400);

    // Test validation - invalid UUID value for primaryAbilityId
    const invalidAbilitySkill = {
      name: "Test Skill",
      description: "Test description",
      primaryAbilityId: "InvalidAbility",
      impactedByWeight: false,
      usableWithoutTraining: true,
    };

    const uuidValidationResponse = await api.api.rulesets[":id"].skills.$post(
      {
        param: { id: testRulesetId },
        json: invalidAbilitySkill as never,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(uuidValidationResponse.status).toBe(400);
  });

  test("should handle non-existent resources", async () => {
    const testRulesetId = await createTestRuleset();
    const intelligenceId = await getAbilityId(testRulesetId, "Intelligence");

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].skills.$get(
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

    // Test non-existent skill
    const updateResponse = await api.api.rulesets[":id"].skills[":skillId"].$put(
      {
        param: { id: testRulesetId, skillId: "00000000-0000-0000-0000-000000000000" },
        json: {
          name: "Test",
          description: "Test",
          primaryAbilityId: intelligenceId,
          impactedByWeight: false,
          usableWithoutTraining: true,
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
});
