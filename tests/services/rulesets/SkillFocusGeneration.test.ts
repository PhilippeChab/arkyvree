import { SkillsMethods } from "@/server/services/rulesets/SkillsService.ts";
import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  FeatsAptitudes,
  Modifiers,
  Rulesets,
  Users,
} from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";
import { stripSeparators } from "@/shared/utils.ts";

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

async function createTestUserAndRuleset({ withGeneralAptitude = true } = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);

  const users = await Users.create(db, {
    username: `testuser-${uniqueId}`,
    emailAddress: `test-${uniqueId}@example.com`,
    password: "password1234",
  });
  const user = users[0];

  const rulesets = await Rulesets.create(db, {
    name: `Test Ruleset ${uniqueId}`,
    description: "Test ruleset for skill focus generation testing",
    private: true,
    baseRules: "Dungeons & Dragons: 3.5",
    userId: user.id,
  });
  const ruleset = rulesets[0];

  const abilities = await Abilities.createMany(db, [
    { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
    { name: "Dexterity", description: "Agility and reflexes", rulesetId: ruleset.id },
  ]);
  const abilityMap: Record<string, string> = {};
  for (const a of abilities) { abilityMap[a.name] = a.id; }

  let generalAptitude;
  if (withGeneralAptitude) {
    const [aptitude] = await Aptitudes.create(db, {
      name: "General",
      description: "General feats",
      rulesetId: ruleset.id,
    });
    generalAptitude = aptitude;
  }

  return {
    user,
    ruleset,
    session: createTestSession(user.id),
    abilityMap,
    generalAptitude,
  };
}

function makeSkillBody(abilityId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Climb",
    description: "Climbing skill",
    primaryAbilityId: abilityId,
    impactedByWeight: true,
    usableWithoutTraining: true,
    ...overrides,
  };
}

describe("Skill Focus Auto-Generation", () => {
  describe("createRulesetSkill", () => {
    test("should generate Skill Focus feat with correct name and description", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        makeSkillBody(abilityMap.Dexterity, { name: "Balance" }),
      );

      const feat = await Feats.findOne(db, { name: "Skill Focus: Balance", rulesetId: ruleset.id });
      expect(feat).toBeDefined();
      expect(feat!.name).toBe("Skill Focus: Balance");
      expect(feat!.description).toBe("You get a +3 bonus on all Balance checks.");
    });

    test("should link Skill Focus feat to General aptitude", async () => {
      const { ruleset, session, abilityMap, generalAptitude } = await createTestUserAndRuleset();

      await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        makeSkillBody(abilityMap.Strength),
      );

      const feat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(feat).toBeDefined();

      const links = await FeatsAptitudes.findMany(db, { featId: feat!.id });
      expect(links.length).toBe(1);
      expect(links[0].aptitudeId).toBe(generalAptitude!.id);
    });

    test("should create modifier with correct target", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        makeSkillBody(abilityMap.Dexterity, { name: "Knowledge (Arcana)" }),
      );

      const feat = await Feats.findOne(db, { name: "Skill Focus: Knowledge (Arcana)", rulesetId: ruleset.id });
      expect(feat).toBeDefined();

      const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [feat!.id], sourceType: "feats" });
      expect(modifiers.length).toBe(1);
      expect(modifiers[0].target).toBe(`skills.${stripSeparators("Knowledge (Arcana)")}.misc`);
      expect(modifiers[0].operator).toBe("add");
      expect(modifiers[0].value).toBe("3");
      expect(modifiers[0].valueType).toBe("number");
    });

    test("should not create feat when General aptitude does not exist", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset({ withGeneralAptitude: false });

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        makeSkillBody(abilityMap.Strength),
      );

      expect(skill).toBeDefined();

      const feat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(feat).toBeUndefined();
    });
  });

  describe("deleteRulesetSkill", () => {
    test("should delete Skill Focus feat when skill is deleted", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        makeSkillBody(abilityMap.Strength),
      );

      // Verify feat exists
      let feat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(feat).toBeDefined();

      await SkillsMethods.deleteRulesetSkill(session, ruleset.id, skill.id);

      // Verify feat is gone
      feat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(feat).toBeUndefined();
    });

    test("should re-create skill with same name after deletion (auto-feat unique constraint)", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skill = await SkillsMethods.createRulesetSkill(session, ruleset.id, makeSkillBody(abilityMap.Strength));
      await SkillsMethods.deleteRulesetSkill(session, ruleset.id, skill.id);

      // Re-create with same name — the auto-generated Skill Focus feat must
      // not collide with the just-deleted one. Soft-archive on the auto-feat
      // would have triggered a unique constraint violation here.
      const recreated = await SkillsMethods.createRulesetSkill(session, ruleset.id, makeSkillBody(abilityMap.Strength));
      expect(recreated.name).toBe("Climb");

      const feat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(feat).toBeDefined();
    });
  });

  describe("updateRulesetSkill (rename)", () => {
    test("should replace old Skill Focus feat with new one on rename", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        makeSkillBody(abilityMap.Strength),
      );

      // Verify original feat
      let oldFeat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(oldFeat).toBeDefined();

      // Rename skill
      await SkillsMethods.updateRulesetSkill(session, ruleset.id, skill.id, {
        ...makeSkillBody(abilityMap.Strength),
        name: "Athletics",
      });

      // Old feat gone
      oldFeat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(oldFeat).toBeUndefined();

      // New feat exists
      const newFeat = await Feats.findOne(db, { name: "Skill Focus: Athletics", rulesetId: ruleset.id });
      expect(newFeat).toBeDefined();

      // New feat has correct modifier target
      const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [newFeat!.id], sourceType: "feats" });
      expect(modifiers.length).toBe(1);
      expect(modifiers[0].target).toBe(`skills.${stripSeparators("Athletics")}.misc`);
    });

    test("should not regenerate feat when name is unchanged", async () => {
      const { ruleset, session, abilityMap } = await createTestUserAndRuleset();

      const skill = await SkillsMethods.createRulesetSkill(
        session,
        ruleset.id,
        makeSkillBody(abilityMap.Strength),
      );

      const feat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(feat).toBeDefined();
      const originalFeatId = feat!.id;

      // Update description only, not name
      await SkillsMethods.updateRulesetSkill(session, ruleset.id, skill.id, {
        ...makeSkillBody(abilityMap.Strength),
        description: "Updated description",
      });

      // Same feat still exists with same ID
      const sameFeat = await Feats.findOne(db, { name: "Skill Focus: Climb", rulesetId: ruleset.id });
      expect(sameFeat).toBeDefined();
      expect(sameFeat!.id).toBe(originalFeatId);
    });
  });

  describe("COW fork", () => {
    test("should generate Skill Focus feat using inherited General aptitude from parent", async () => {
      // Parent has General aptitude but child does not
      const { ruleset: parentRuleset, generalAptitude } =
        await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      // Create child fork (no General aptitude of its own)
      const { session: childSession } =
        await createTestUserAndRuleset({ withGeneralAptitude: false });
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

      // Create abilities in child (needed for the skill)
      const childAbilities = await Abilities.createMany(db, [
        { name: "Strength", description: "Physical power", rulesetId: childRuleset.id },
      ]);

      await SkillsMethods.createRulesetSkill(
        childSession,
        childRuleset.id,
        makeSkillBody(childAbilities[0].id, { name: "Swim" }),
      );

      // Feat should exist in child, linked to parent's General aptitude
      const feat = await Feats.findOne(db, { name: "Skill Focus: Swim", rulesetId: childRuleset.id });
      expect(feat).toBeDefined();

      const links = await FeatsAptitudes.findMany(db, { featId: feat!.id });
      expect(links.length).toBe(1);
      expect(links[0].aptitudeId).toBe(generalAptitude!.id);
    });

    test("should find inherited Skill Focus feat from parent", async () => {
      const { ruleset: parentRuleset, session: parentSession, abilityMap: parentAbilityMap } =
        await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      // Create a skill in parent (which auto-generates Skill Focus feat)
      await SkillsMethods.createRulesetSkill(
        parentSession,
        parentRuleset.id,
        makeSkillBody(parentAbilityMap.Strength, { name: "Jump" }),
      );

      // Create child fork
      const { session: childSession } = await createTestUserAndRuleset({ withGeneralAptitude: false });
      await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childSession.userId,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });

      // Verify the parent's feat exists and is visible
      const parentFeat = await Feats.findOne(db, { name: "Skill Focus: Jump", rulesetId: parentRuleset.id });
      expect(parentFeat).toBeDefined();
    });
  });
});
