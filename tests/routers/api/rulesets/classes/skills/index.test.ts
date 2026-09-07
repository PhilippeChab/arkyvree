import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { testClient } from "hono/testing";
import type { InferRequestType } from "hono/client";
import { expect, describe, test } from "bun:test";

describe("rulesets class skills", () => {
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
      description: "A test class for skills testing",
      hd: 8,
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

  // Helper to create test skill
  async function createTestSkill(rulesetId: string): Promise<string> {
    const intelligenceId = await getAbilityId(rulesetId, "Intelligence");
    const newSkill = {
      name: `Test Skill ${Math.random().toString(36).substr(2, 9)}`,
      description: "A test skill for class skills testing",
      primaryAbilityId: intelligenceId,
      impactedByWeight: false,
      usableWithoutTraining: true,
    };

    const skillResponse = await api.api.rulesets[":id"].skills.$post(
      {
        param: { id: rulesetId },
        json: newSkill,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!skillResponse.ok) {
      const error = await skillResponse.json();
      throw new Error(`Failed to create test skill: ${error.message}`);
    }

    const createdSkill = await skillResponse.json();
    return createdSkill.id;
  }

  test("should handle full class skill lifecycle - add, verify, and remove", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);
    const testSkillId = await createTestSkill(testRulesetId);

    // Get initial list of class skills
    const initialListResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$get(
      {
        param: { id: testRulesetId, classId: testClassId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!initialListResponse.ok) {
      const error = await initialListResponse.json();
      throw new Error(`Failed to get class skills: ${error.message}`);
    }

    const initialSkills = await initialListResponse.json();
    expect(initialSkills).toBeDefined();
    expect(Array.isArray(initialSkills)).toBe(true);

    // Add the skill to the class
    const skillData = {
      skillId: testSkillId,
    };

    const addResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: skillData,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!addResponse.ok) {
      const error = await addResponse.json();
      throw new Error(`Failed to add skill to class: ${error.message}`);
    }

    const addResult = await addResponse.json();
    expect(addResult).toBeDefined();

    // Verify skill was added
    const verifyAddResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$get(
      {
        param: { id: testRulesetId, classId: testClassId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!verifyAddResponse.ok) {
      const error = await verifyAddResponse.json();
      throw new Error(`Failed to get class skills: ${error.message}`);
    }

    const skillsAfterAdd = await verifyAddResponse.json();
    expect(skillsAfterAdd).toBeDefined();
    expect(Array.isArray(skillsAfterAdd)).toBe(true);

    const hasTestSkill = skillsAfterAdd.some((skill) => skill.skillId === testSkillId);
    expect(hasTestSkill).toBe(true);

    // Remove the skill from the class
    const removeResponse = await api.api.rulesets[":id"].classes[":classId"].skills[":skillId"].$delete(
      {
        param: { id: testRulesetId, classId: testClassId, skillId: testSkillId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!removeResponse.ok) {
      const error = await removeResponse.json();
      throw new Error(`Failed to remove skill from class: ${error.message}`);
    }

    const removeResult = await removeResponse.json();
    expect(removeResult).toBeDefined();

    // Verify skill was removed
    const verifyRemoveResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$get(
      {
        param: { id: testRulesetId, classId: testClassId },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    if (!verifyRemoveResponse.ok) {
      const error = await verifyRemoveResponse.json();
      throw new Error(`Failed to get class skills: ${error.message}`);
    }

    const skillsAfterRemove = await verifyRemoveResponse.json();
    expect(skillsAfterRemove).toBeDefined();
    expect(Array.isArray(skillsAfterRemove)).toBe(true);

    const stillHasTestSkill = skillsAfterRemove.some((skill) => skill.skillId === testSkillId);
    expect(stillHasTestSkill).toBe(false);
  });

  test("should prevent duplicate skill addition", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);
    const testSkillId = await createTestSkill(testRulesetId);

    // First add the skill
    const skillData = {
      skillId: testSkillId,
    };

    const firstAddResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: skillData,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    // Should succeed the first time
    expect(firstAddResponse.ok).toBe(true);

    // Try to add the same skill again
    const secondAddResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: skillData,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    // Should fail the second time (conflict or bad request)
    expect(secondAddResponse.status >= 400).toBe(true);
  });

  test("should handle authentication and validation", async () => {
    const testRulesetId = await createTestRuleset();
    const testClassId = await createTestClass(testRulesetId);

    // Test unauthenticated request
    const unauthResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$get({
      param: { id: testRulesetId, classId: testClassId },
    });
    expect(unauthResponse.status).toBe(401);

    // Test validation - missing required fields
    const invalidData = {
      // Missing skillId field
    };

    const validationResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: invalidData as never,
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
    const testClassId = await createTestClass(testRulesetId);

    // Test non-existent ruleset
    const nonExistentRulesetResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$get(
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
    const nonExistentClassResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$get(
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

    // Test non-existent skill addition
    const invalidSkillData = {
      skillId: "00000000-0000-0000-0000-000000000000",
    };

    const nonExistentSkillAddResponse = await api.api.rulesets[":id"].classes[":classId"].skills.$post(
      {
        param: { id: testRulesetId, classId: testClassId },
        json: invalidSkillData,
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(nonExistentSkillAddResponse.status >= 400).toBe(true);

    // Test non-existent skill removal
    const nonExistentSkillRemoveResponse = await api.api.rulesets[":id"].classes[":classId"].skills[":skillId"].$delete(
      {
        param: {
          id: testRulesetId,
          classId: testClassId,
          skillId: "00000000-0000-0000-0000-000000000000",
        },
      },
      {
        headers: {
          cookie: "session-id=00000000-0000-4000-8000-000000000123",
        },
      },
    );

    expect(nonExistentSkillRemoveResponse.status >= 400).toBe(true);
  });
});
