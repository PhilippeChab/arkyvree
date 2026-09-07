import { ClassSkillsMethods } from "@/server/services/rulesets/classes/ClassSkillsService.ts";
import { db } from "@/server/database/index.ts";
import { Abilities, EntitySnapshots, KlassSkills, Klasses, Rulesets, Skills, Users } from "@/server/repositories/index.ts";
import { NotFoundError, ForbiddenError, ConflictError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("ClassSkillsService", () => {
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
      description: "Test ruleset for class skills testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    // Create a default ability for skills
    const abilities = await Abilities.create(db, {
      name: "Intelligence",
      description: "Reasoning and memory",
      rulesetId: ruleset.id,
    });
    const defaultAbilityId = abilities[0].id;

    return { user, ruleset, session: createTestSession(user.id), defaultAbilityId };
  }

  // Helper to create a test class
  async function createTestClass(rulesetId: string, name?: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const klasses = await Klasses.create(db, {
      name: name || `Test Class ${uniqueId}`,
      description: "Test class for skills testing",
      rulesetId,
      hd: 8,
    });

    return klasses[0];
  }

  // Helper to create a test skill
  async function createTestSkill(rulesetId: string, abilityId: string, name?: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const skills = await Skills.create(db, {
      name: name || `Test Skill ${uniqueId}`,
      description: "Test skill",
      rulesetId,
      primaryAbilityId: abilityId,
    });

    return skills[0];
  }

  describe("getClassSkills", () => {
    test("should return empty array when class has no skills", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);

      const classSkills = await ClassSkillsMethods.getClassSkills(ruleset.id, klass.id);

      expect(classSkills).toBeDefined();
      expect(Array.isArray(classSkills)).toBe(true);
      expect(classSkills.length).toBe(0);
    });

    test("should return skills for a class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      // Add skill to class
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill.id);

      const classSkills = await ClassSkillsMethods.getClassSkills(ruleset.id, klass.id);

      expect(classSkills).toBeDefined();
      expect(classSkills.length).toBe(1);
      expect(classSkills[0].klassId).toBe(klass.id);
      expect(classSkills[0].skillId).toBe(skill.id);
      expect(classSkills[0].skillsInRule).toBeDefined();
      expect(classSkills[0].skillsInRule?.name).toBe(skill.name);
    });

    test("should return multiple skills for a class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill1 = await createTestSkill(ruleset.id, defaultAbilityId, "Skill One");
      const skill2 = await createTestSkill(ruleset.id, defaultAbilityId, "Skill Two");
      const skill3 = await createTestSkill(ruleset.id, defaultAbilityId, "Skill Three");

      // Add multiple skills to class
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill1.id);
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill2.id);
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill3.id);

      const classSkills = await ClassSkillsMethods.getClassSkills(ruleset.id, klass.id);

      expect(classSkills.length).toBe(3);
      const skillIds = classSkills.map((cs) => cs.skillId);
      expect(skillIds).toContain(skill1.id);
      expect(skillIds).toContain(skill2.id);
      expect(skillIds).toContain(skill3.id);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const fakeClassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassSkillsMethods.getClassSkills(ruleset.id, fakeClassId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when class does not belong to ruleset", async () => {
      const { ruleset: ruleset1 } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset2.id);

      await expect(
        ClassSkillsMethods.getClassSkills(ruleset1.id, klass.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("addClassSkill", () => {
    test("should add a skill to a class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      const klassSkill = await ClassSkillsMethods.addClassSkill(
        session,
        ruleset.id,
        klass.id,
        skill.id
      );

      expect(klassSkill).toBeDefined();
      expect(klassSkill.klassId).toBe(klass.id);
      expect(klassSkill.skillId).toBe(skill.id);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";
      const fakeClassId = "00000000-0000-0000-0000-000000000000";
      const fakeSkillId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassSkillsMethods.addClassSkill(session, fakeRulesetId, fakeClassId, fakeSkillId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);
      const fakeClassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassSkillsMethods.addClassSkill(session, ruleset.id, fakeClassId, skill.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent skill", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const fakeSkillId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, fakeSkillId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when class does not belong to ruleset", async () => {
      const { ruleset: ruleset1, session, defaultAbilityId } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset2.id);
      const skill = await createTestSkill(ruleset1.id, defaultAbilityId);

      await expect(
        ClassSkillsMethods.addClassSkill(session, ruleset1.id, klass.id, skill.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when skill does not belong to ruleset", async () => {
      const { ruleset: ruleset1, session } = await createTestUserAndRuleset();
      const { ruleset: ruleset2, defaultAbilityId: defaultAbilityId2 } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset1.id);
      const skill = await createTestSkill(ruleset2.id, defaultAbilityId2);

      await expect(
        ClassSkillsMethods.addClassSkill(session, ruleset1.id, klass.id, skill.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ConflictError when skill is already assigned to class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      // Add skill first time
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill.id);

      // Try to add same skill again
      await expect(
        ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill.id)
      ).rejects.toThrow(ConflictError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, defaultAbilityId } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      await expect(
        ClassSkillsMethods.addClassSkill(otherSession, ruleset.id, klass.id, skill.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should allow same skill to be added to different classes", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass1 = await createTestClass(ruleset.id, "Class One");
      const klass2 = await createTestClass(ruleset.id, "Class Two");
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      const klassSkill1 = await ClassSkillsMethods.addClassSkill(
        session,
        ruleset.id,
        klass1.id,
        skill.id
      );
      const klassSkill2 = await ClassSkillsMethods.addClassSkill(
        session,
        ruleset.id,
        klass2.id,
        skill.id
      );

      expect(klassSkill1.klassId).toBe(klass1.id);
      expect(klassSkill1.skillId).toBe(skill.id);
      expect(klassSkill2.klassId).toBe(klass2.id);
      expect(klassSkill2.skillId).toBe(skill.id);
    });
  });

  describe("removeClassSkill", () => {
    test("should remove a skill from a class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      // Add skill first
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill.id);

      // Remove it
      const removed = await ClassSkillsMethods.removeClassSkill(
        session,
        ruleset.id,
        klass.id,
        skill.id
      );

      expect(removed).toBeDefined();
      expect(removed.klassId).toBe(klass.id);
      expect(removed.skillId).toBe(skill.id);

      // Verify it's removed
      const classSkills = await ClassSkillsMethods.getClassSkills(ruleset.id, klass.id);
      expect(classSkills.length).toBe(0);
    });

    test("should throw NotFoundError for non-existent ruleset", async () => {
      const { session } = await createTestUserAndRuleset();
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";
      const fakeClassId = "00000000-0000-0000-0000-000000000000";
      const fakeSkillId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassSkillsMethods.removeClassSkill(session, fakeRulesetId, fakeClassId, fakeSkillId)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError for non-existent class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);
      const fakeClassId = "00000000-0000-0000-0000-000000000000";

      await expect(
        ClassSkillsMethods.removeClassSkill(session, ruleset.id, fakeClassId, skill.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when class does not belong to ruleset", async () => {
      const { ruleset: ruleset1, session, defaultAbilityId } = await createTestUserAndRuleset();
      const { ruleset: ruleset2 } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset2.id);
      const skill = await createTestSkill(ruleset1.id, defaultAbilityId);

      await expect(
        ClassSkillsMethods.removeClassSkill(session, ruleset1.id, klass.id, skill.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw NotFoundError when skill is not assigned to class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      await expect(
        ClassSkillsMethods.removeClassSkill(session, ruleset.id, klass.id, skill.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should throw ForbiddenError when user doesn't own the ruleset", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const { session: otherSession } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      // Add skill as owner
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill.id);

      // Try to remove as different user
      await expect(
        ClassSkillsMethods.removeClassSkill(otherSession, ruleset.id, klass.id, skill.id)
      ).rejects.toThrow(ForbiddenError);
    });

    test("should only remove skill from specified class, not others", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass1 = await createTestClass(ruleset.id, "Class One");
      const klass2 = await createTestClass(ruleset.id, "Class Two");
      const skill = await createTestSkill(ruleset.id, defaultAbilityId);

      // Add skill to both classes
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass1.id, skill.id);
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass2.id, skill.id);

      // Remove from class1 only
      await ClassSkillsMethods.removeClassSkill(session, ruleset.id, klass1.id, skill.id);

      // Verify class1 has no skills
      const class1Skills = await ClassSkillsMethods.getClassSkills(ruleset.id, klass1.id);
      expect(class1Skills.length).toBe(0);

      // Verify class2 still has the skill
      const class2Skills = await ClassSkillsMethods.getClassSkills(ruleset.id, klass2.id);
      expect(class2Skills.length).toBe(1);
      expect(class2Skills[0].skillId).toBe(skill.id);
    });

    test("should handle removing multiple skills from a class", async () => {
      const { ruleset, session, defaultAbilityId } = await createTestUserAndRuleset();
      const klass = await createTestClass(ruleset.id);
      const skill1 = await createTestSkill(ruleset.id, defaultAbilityId, "Skill One");
      const skill2 = await createTestSkill(ruleset.id, defaultAbilityId, "Skill Two");
      const skill3 = await createTestSkill(ruleset.id, defaultAbilityId, "Skill Three");

      // Add all skills
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill1.id);
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill2.id);
      await ClassSkillsMethods.addClassSkill(session, ruleset.id, klass.id, skill3.id);

      // Remove skill2
      await ClassSkillsMethods.removeClassSkill(session, ruleset.id, klass.id, skill2.id);

      // Verify skill2 is removed but skill1 and skill3 remain
      const classSkills = await ClassSkillsMethods.getClassSkills(ruleset.id, klass.id);
      expect(classSkills.length).toBe(2);
      const skillIds = classSkills.map((cs) => cs.skillId);
      expect(skillIds).toContain(skill1.id);
      expect(skillIds).toContain(skill3.id);
      expect(skillIds).not.toContain(skill2.id);
    });
  });

  describe("COW fork", () => {
    async function createCOWFork() {
      // Create parent with class, skill, and ability
      const { ruleset: parentRuleset, session: parentSession, defaultAbilityId: parentAbilityId } = await createTestUserAndRuleset();
      const parentKlass = await createTestClass(parentRuleset.id, "Parent Fighter");
      const parentSkill = await createTestSkill(parentRuleset.id, parentAbilityId, "Parent Climb");

      // Publish parent
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      // Create child fork
      const { session: childSession } = await createTestUserAndRuleset();
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

      return { parentRuleset, parentSession, parentKlass, parentSkill, parentAbilityId, childRuleset, childSession };
    }

    test("should get class skills for inherited parent class", async () => {
      const { parentRuleset, parentSession, parentKlass, parentSkill, childRuleset } = await createCOWFork();

      // Add skill to parent class
      await ClassSkillsMethods.addClassSkill(parentSession, parentRuleset.id, parentKlass.id, parentSkill.id);

      // Read from child fork
      const classSkills = await ClassSkillsMethods.getClassSkills(childRuleset.id, parentKlass.id);

      expect(classSkills.length).toBe(1);
      expect(classSkills[0].skillId).toBe(parentSkill.id);
    });

    test("should add inherited skill to inherited class in child fork", async () => {
      const { parentKlass, parentSkill, childRuleset, childSession } = await createCOWFork();

      // Snapshot parent's klass_skills count before — should be unchanged after
      // the child's add (the parent must not be mutated).
      const parentBefore = await KlassSkills.findMany(db, { klassIds: [parentKlass.id] });

      const klassSkill = await ClassSkillsMethods.addClassSkill(
        childSession,
        childRuleset.id,
        parentKlass.id,
        parentSkill.id,
      );

      expect(klassSkill).toBeDefined();
      expect(klassSkill.skillId).toBe(parentSkill.id);
      // The new row must reference the COW'd klass in the child fork, not the
      // parent's klass id. The COW'd klass id is recorded in entity_snapshots.
      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: parentKlass.id,
        rulesetId: childRuleset.id,
      });
      expect(snapshot).toBeDefined();
      expect(klassSkill.klassId).toBe(snapshot!.forkedEntityId);
      expect(klassSkill.klassId).not.toBe(parentKlass.id);

      // Parent's klass_skills must remain unchanged.
      const parentAfter = await KlassSkills.findMany(db, { klassIds: [parentKlass.id] });
      expect(parentAfter.length).toBe(parentBefore.length);

      // Parent ruleset must not have a klass_skills row for this skill.
      expect(parentAfter.some((ks) => ks.skillId === parentSkill.id)).toBe(false);
    });

    test("should remove skill from inherited class in child fork", async () => {
      const { parentRuleset, parentSession, parentKlass, parentSkill, childRuleset, childSession } = await createCOWFork();

      // Add skill in parent
      await ClassSkillsMethods.addClassSkill(parentSession, parentRuleset.id, parentKlass.id, parentSkill.id);

      // Remove from child fork
      const removed = await ClassSkillsMethods.removeClassSkill(
        childSession,
        childRuleset.id,
        parentKlass.id,
        parentSkill.id,
      );

      expect(removed).toBeDefined();
      // The removed row must come from the COW'd klass (which has its own
      // klass_skills copy), not from the parent.
      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: parentKlass.id,
        rulesetId: childRuleset.id,
      });
      expect(snapshot).toBeDefined();
      expect(removed.klassId).toBe(snapshot!.forkedEntityId);
      expect(removed.klassId).not.toBe(parentKlass.id);

      // Parent must still have the klass_skill it had before.
      const parentSkills = await KlassSkills.findMany(db, { klassIds: [parentKlass.id] });
      expect(parentSkills.some((ks) => ks.skillId === parentSkill.id)).toBe(true);
    });

    test("should reject class from unrelated ruleset in addClassSkill", async () => {
      const { parentSkill, childRuleset, childSession } = await createCOWFork();
      const { ruleset: unrelatedRuleset } = await createTestUserAndRuleset();
      const unrelatedKlass = await createTestClass(unrelatedRuleset.id, "Unrelated Class");

      await expect(
        ClassSkillsMethods.addClassSkill(childSession, childRuleset.id, unrelatedKlass.id, parentSkill.id)
      ).rejects.toThrow(NotFoundError);
    });

    test("should reject skill from unrelated ruleset in addClassSkill", async () => {
      const { parentKlass, childRuleset, childSession } = await createCOWFork();
      const { ruleset: unrelatedRuleset, defaultAbilityId: unrelatedAbilityId } = await createTestUserAndRuleset();
      const unrelatedSkill = await createTestSkill(unrelatedRuleset.id, unrelatedAbilityId, "Unrelated Skill");

      await expect(
        ClassSkillsMethods.addClassSkill(childSession, childRuleset.id, parentKlass.id, unrelatedSkill.id)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
