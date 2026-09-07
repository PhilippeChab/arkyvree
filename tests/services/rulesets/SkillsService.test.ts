import { eq } from "drizzle-orm";

import { SkillsMethods } from "@/server/services/rulesets/SkillsService.ts";
import { db } from "@/server/database/index.ts";
import { klassSkillsInRules } from "@/drizzle/schema.ts";
import { Abilities, Modifiers, Requirements, Rulesets, Users } from "@/server/repositories/index.ts";
import { ClassesMethods } from "@/server/services/rulesets/ClassesService.ts";
import { ConflictError, NotFoundError, ForbiddenError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("SkillsService", () => {
  // Helper to create test session
  function createTestSession(userId: string): Session {
    return {
      id: `session-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Helper to create test abilities for a ruleset
  async function createTestAbilities(rulesetId: string) {
    const abilities = await Abilities.createMany(db, [
      { name: "Strength", description: "Physical power", rulesetId },
      { name: "Dexterity", description: "Agility and reflexes", rulesetId },
      { name: "Constitution", description: "Health and stamina", rulesetId },
      { name: "Intelligence", description: "Reasoning and memory", rulesetId },
      { name: "Wisdom", description: "Perception and insight", rulesetId },
      { name: "Charisma", description: "Force of personality", rulesetId },
    ]);
    const abilityMap: Record<string, string> = {};
    for (const a of abilities) { abilityMap[a.name] = a.id; }
    return abilityMap;
  }

  // Helper to create test user and ruleset
  async function createTestUserAndRuleset() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for skills testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    const abilityMap = await createTestAbilities(ruleset.id);

    return { user, ruleset, session: createTestSession(user.id), abilityMap };
  }

  describe("getRulesetSkills", () => {
    test("should return skills for a valid ruleset", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await SkillsMethods.getRulesetSkills(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        SkillsMethods.getRulesetSkills(fakeRulesetId, {}, { limit: 10, page: 1 })
      ).rejects.toThrow(NotFoundError);
    });

    test("should return empty array for ruleset with no skills", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const result = await SkillsMethods.getRulesetSkills(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(0);
    });

    test("should return all skills for a ruleset", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      // Create multiple skills
      await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Acrobatics",
        description: "Balance and tumbling skill",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: true,
        usableWithoutTraining: true,
      });

      await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Stealth",
        description: "Moving silently skill",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: true,
        usableWithoutTraining: true,
      });

      const result = await SkillsMethods.getRulesetSkills(ruleset.id, {}, { limit: 10, page: 1 });

      expect(result.items.length).toBe(2);
      expect(result.items.some(s => s.name === "Acrobatics")).toBe(true);
      expect(result.items.some(s => s.name === "Stealth")).toBe(true);
    });

    test("should filter skills by search term", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Acrobatics",
        description: "Balance and tumbling skill",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: true,
        usableWithoutTraining: true,
      });

      await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Stealth",
        description: "Moving silently skill",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: true,
        usableWithoutTraining: true,
      });

      const result = await SkillsMethods.getRulesetSkills(ruleset.id, { search: "Acro" }, { limit: 10, page: 1 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe("Acrobatics");
    });

    test("should return skills with enriched property fields", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Climb",
        description: "Climbing skill",
        primaryAbilityId: abilityMap.Strength,
        impactedByWeight: true,
        usableWithoutTraining: true,
      });

      await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Spellcraft",
        description: "Identify spells",
        primaryAbilityId: abilityMap.Intelligence,
        impactedByWeight: false,
        usableWithoutTraining: false,
      });

      const result = await SkillsMethods.getRulesetSkills(ruleset.id, {}, { limit: 10, page: 1 });

      const climb = result.items.find(s => s.name === "Climb");
      expect(climb?.impactedByWeight).toBe(true);
      expect(climb?.usableWithoutTraining).toBe(true);

      const spellcraft = result.items.find(s => s.name === "Spellcraft");
      expect(spellcraft?.impactedByWeight).toBe(false);
      expect(spellcraft?.usableWithoutTraining).toBe(false);
    });
  });

  describe("createRulesetSkill", () => {
    test("should create a skill with all fields", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Acrobatics",
        description: "Balance and tumbling skill",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: true,
        usableWithoutTraining: true,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.name).toBe(skillData.name);
      expect(skill.description).toBe(skillData.description);
      expect(skill.primaryAbilityId).toBe(skillData.primaryAbilityId);
      expect(skill.impactedByWeight).toBe(skillData.impactedByWeight);
      expect(skill.usableWithoutTraining).toBe(skillData.usableWithoutTraining);
      expect(skill.rulesetId).toBe(ruleset.id);
    });

    test("should create a skill with Strength as primary ability", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Climb",
        description: "Climbing skill",
        primaryAbilityId: abilityMap.Strength,
        impactedByWeight: true,
        usableWithoutTraining: true,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.primaryAbilityId).toBe(abilityMap.Strength);
    });

    test("should create a skill with Constitution as primary ability", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Concentration",
        description: "Mental focus skill",
        primaryAbilityId: abilityMap.Constitution,
        impactedByWeight: false,
        usableWithoutTraining: true,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.primaryAbilityId).toBe(abilityMap.Constitution);
    });

    test("should create a skill with Intelligence as primary ability", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Knowledge",
        description: "Knowledge skill",
        primaryAbilityId: abilityMap.Intelligence,
        impactedByWeight: false,
        usableWithoutTraining: false,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.primaryAbilityId).toBe(abilityMap.Intelligence);
    });

    test("should create a skill with Wisdom as primary ability", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Perception",
        description: "Awareness skill",
        primaryAbilityId: abilityMap.Wisdom,
        impactedByWeight: false,
        usableWithoutTraining: true,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.primaryAbilityId).toBe(abilityMap.Wisdom);
    });

    test("should create a skill with Charisma as primary ability", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Diplomacy",
        description: "Social interaction skill",
        primaryAbilityId: abilityMap.Charisma,
        impactedByWeight: false,
        usableWithoutTraining: true,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.primaryAbilityId).toBe(abilityMap.Charisma);
    });

    test("should create a skill not impacted by weight", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Bluff",
        description: "Deception skill",
        primaryAbilityId: abilityMap.Charisma,
        impactedByWeight: false,
        usableWithoutTraining: true,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.impactedByWeight).toBe(false);
    });

    test("should create a skill not usable without training", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skillData = {
        name: "Disable Device",
        description: "Trap and lock manipulation",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: false,
        usableWithoutTraining: false,
      };

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        skillData
      );

      expect(skill).toBeDefined();
      expect(skill.usableWithoutTraining).toBe(false);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session, abilityMap } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        SkillsMethods.createRulesetSkill(session, fakeRulesetId, {
          name: "Test Skill",
          description: "Test description",
          primaryAbilityId: abilityMap.Dexterity,
          impactedByWeight: false,
          usableWithoutTraining: true,
        })
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, abilityMap } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      await expect(
        SkillsMethods.createRulesetSkill(otherSession, ruleset.id, {
          name: "Test Skill",
          description: "Test description",
          primaryAbilityId: abilityMap.Dexterity,
          impactedByWeight: false,
          usableWithoutTraining: true,
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateRulesetSkill", () => {
    test("should update all skill fields", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      // Create skill first
      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Original Name",
          description: "Original description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: false,
        }
      );

      // Update it
      const updateData = {
        name: "Updated Name",
        description: "Updated description",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: true,
        usableWithoutTraining: true,
      };

      const updated = await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        updateData
      );

      expect(updated.name).toBe(updateData.name);
      expect(updated.description).toBe(updateData.description);
      expect(updated.primaryAbilityId).toBe(updateData.primaryAbilityId);
      expect(updated.impactedByWeight).toBe(updateData.impactedByWeight);
      expect(updated.usableWithoutTraining).toBe(updateData.usableWithoutTraining);
    });

    test("should update primary ability to Intelligence", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      const updated = await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Intelligence,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      expect(updated.primaryAbilityId).toBe(abilityMap.Intelligence);
    });

    test("should update primary ability to Wisdom", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      const updated = await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Wisdom,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      expect(updated.primaryAbilityId).toBe(abilityMap.Wisdom);
    });

    test("should update primary ability to Charisma", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      const updated = await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Charisma,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      expect(updated.primaryAbilityId).toBe(abilityMap.Charisma);
    });

    test("should update primary ability to Constitution", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      const updated = await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Constitution,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      expect(updated.primaryAbilityId).toBe(abilityMap.Constitution);
    });

    test("should toggle impactedByWeight", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      const updated = await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: true,
          usableWithoutTraining: true,
        }
      );

      expect(updated.impactedByWeight).toBe(true);
    });

    test("should toggle usableWithoutTraining", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      const updated = await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: false,
        }
      );

      expect(updated.usableWithoutTraining).toBe(false);
    });

    test("should reflect updated property fields in the skills list (cache invalidation)", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Disable Device",
          description: "Disarm a trap, jam a lock, or rig a wagon wheel to fall off.",
          primaryAbilityId: abilityMap.Intelligence,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      // Prime the ruleset raw-data cache by reading the list once.
      const before = await SkillsMethods.getRulesetSkills(ruleset.id, {}, { limit: 10, page: 1 });
      expect(before.items.find(s => s.id === created.id)?.usableWithoutTraining).toBe(true);

      await SkillsMethods.updateRulesetSkill(
        session,
        ruleset.id,
        created.id,
        {
          name: "Disable Device",
          description: "Disarm a trap, jam a lock, or rig a wagon wheel to fall off.",
          primaryAbilityId: abilityMap.Intelligence,
          impactedByWeight: false,
          usableWithoutTraining: false,
        }
      );

      const after = await SkillsMethods.getRulesetSkills(ruleset.id, {}, { limit: 10, page: 1 });
      expect(after.items.find(s => s.id === created.id)?.usableWithoutTraining).toBe(false);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session, abilityMap } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        SkillsMethods.updateRulesetSkill(
          session,
          fakeRulesetId,
          "fake-skill-id",
          {
            name: "Test",
            description: "Test",
            primaryAbilityId: abilityMap.Dexterity,
            impactedByWeight: false,
            usableWithoutTraining: true,
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent skill", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();
      const fakeSkillId = "00000000-0000-0000-0000-000000000000";

      await expect(
        SkillsMethods.updateRulesetSkill(
          session,
          ruleset.id,
          fakeSkillId,
          {
            name: "Test",
            description: "Test",
            primaryAbilityId: abilityMap.Dexterity,
            impactedByWeight: false,
            usableWithoutTraining: true,
          }
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when skill exists but not in the specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1, abilityMap } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();

      // Create skill in ruleset1
      const skill = await SkillsMethods.createRulesetSkill(
        session1,
        ruleset1.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      // Try to update it in ruleset2
      await expect(
        SkillsMethods.updateRulesetSkill(
          session1,
          ruleset2.id,
          skill.id,
          {
            name: "Updated",
            description: "Updated",
            primaryAbilityId: abilityMap.Dexterity,
            impactedByWeight: false,
            usableWithoutTraining: true,
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create skill as owner
      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Test Skill",
          description: "Test description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      // Try to update as different user
      await expect(
        SkillsMethods.updateRulesetSkill(
          otherSession,
          ruleset.id,
          skill.id,
          {
            name: "Updated",
            description: "Updated",
            primaryAbilityId: abilityMap.Dexterity,
            impactedByWeight: true,
            usableWithoutTraining: false,
          }
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetSkill", () => {
    test("should delete a skill", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      // Create skill first
      const created = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "To Delete",
          description: "Will be deleted",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      // Delete it
      const deleted = await SkillsMethods.deleteRulesetSkill(
        session,
        ruleset.id,
        created.id
      );

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        SkillsMethods.deleteRulesetSkill(
          session,
          fakeRulesetId,
          "fake-skill-id"
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent skill", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const fakeSkillId = "00000000-0000-0000-0000-000000000000";

      await expect(
        SkillsMethods.deleteRulesetSkill(
          session,
          ruleset.id,
          fakeSkillId
        )
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when skill exists but not in the specified ruleset", async () => {
      const { ruleset: ruleset1, session: session1, abilityMap } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();

      // Create skill in ruleset1
      const skill = await SkillsMethods.createRulesetSkill(
        session1,
        ruleset1.id,
        {
          name: "Skill",
          description: "Description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      // Try to delete it from ruleset2
      await expect(
        SkillsMethods.deleteRulesetSkill(
          session1,
          ruleset2.id,
          skill.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();

      // Create skill as owner
      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        {
          name: "Test Skill",
          description: "Test description",
          primaryAbilityId: abilityMap.Strength,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }
      );

      // Try to delete as different user
      await expect(
        SkillsMethods.deleteRulesetSkill(
          otherSession,
          ruleset.id,
          skill.id
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRulesetSkill - cascade", () => {
    test("should hard-delete klass_skills referencing the skill", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skill = await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Skill to Cascade",
        description: "Test",
        primaryAbilityId: abilityMap.Strength,
        impactedByWeight: false,
        usableWithoutTraining: true,
      });

      const klass = await ClassesMethods.createRulesetKlass(session, ruleset.id, {
        name: `Class ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test",
      });

      const { KlassSkills } = await import("@/server/repositories/index.ts");
      await KlassSkills.create(db, { klassId: klass.id, skillId: skill.id });

      let rawRows = await db.select().from(klassSkillsInRules)
        .where(eq(klassSkillsInRules.skillId, skill.id));
      expect(rawRows.length).toBe(1);

      await SkillsMethods.deleteRulesetSkill(session, ruleset.id, skill.id);

      rawRows = await db.select().from(klassSkillsInRules)
        .where(eq(klassSkillsInRules.skillId, skill.id));
      expect(rawRows.length).toBe(0);
    });

    test("should hard-delete customizations when deleting skill", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skill = await SkillsMethods.createRulesetSkill(session, ruleset.id, {
        name: "Skill With Customizations",
        description: "Test",
        primaryAbilityId: abilityMap.Strength,
        impactedByWeight: false,
        usableWithoutTraining: true,
      });

      // Add customizations
      await Modifiers.create(db, {
        sourceId: skill.id,
        sourceType: "skills",
        target: "abilities.strength",
        value: "2",
        valueType: "number",
        operator: "add",
      });
      await Requirements.create(db, {
        entityId: skill.id,
        entityType: "skills",
        level: "character",
        target: "abilities.strength",
        value: "5",
        valueType: "number",
        operator: "greater_than",
      });

      // Delete the skill
      await SkillsMethods.deleteRulesetSkill(session, ruleset.id, skill.id);

      // Customizations should be completely gone
      const modifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [skill.id],
        sourceType: "skills",
      });
      expect(modifiers.length).toBe(0);

      const requirements = await Requirements.findManyByEntity(db, {
        entityIds: [skill.id],
        entityType: "skills",
      });
      expect(requirements.length).toBe(0);
    });
  });

  describe("COW fork", () => {
    test("should throw ConflictError when creating skill with name inherited from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession, abilityMap } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      await SkillsMethods.createRulesetSkill(parentSession, parentRuleset.id, {
        name: "Acrobatics",
        description: "Balance and tumbling",
        primaryAbilityId: abilityMap.Dexterity,
        impactedByWeight: false,
        usableWithoutTraining: true,
      });

      const { session: childSession, abilityMap: childAbilityMap } = await createTestUserAndRuleset();
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childSession.userId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      await expect(
        SkillsMethods.createRulesetSkill(childSession, childRuleset.id, {
          name: "Acrobatics",
          description: "Duplicate name",
          primaryAbilityId: childAbilityMap.Dexterity,
          impactedByWeight: false,
          usableWithoutTraining: true,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });
});
