import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import {
  Abilities,
  EntitySnapshots,
  Feats,
  Klasses,
  KlassLevels,
  Modifiers,
  Properties,
  Requirements,
  Rulesets,
  Users,
} from "@/server/repositories/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

/**
 * COW (Copy-On-Write) tests for customization mutations.
 *
 * These tests verify that when a fork's user modifies, creates, or deletes
 * customizations (modifiers, properties, requirements) on INHERITED entities,
 * the system:
 *   1. Creates a COW copy of the parent entity in the fork
 *   2. Operates on the COW'd copy — never the parent
 *   3. Leaves parent data completely unchanged
 *   4. Creates an entity_snapshot record
 *   5. Returns the resolvedEntityId so the frontend can navigate
 */

// ── Helpers ──────────────────────────────────────────────────────

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

async function createTestUser() {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const users = await Users.create(db, {
    username: `testuser-${uniqueId}`,
    emailAddress: `test-${uniqueId}@example.com`,
    password: "password1234",
  });
  return { user: users[0], session: createTestSession(users[0].id) };
}

async function createPublishedParentWithFeat() {
  const { user: owner, session: ownerSession } = await createTestUser();
  const { session: forkSession } = await createTestUser();

  // Create parent ruleset with abilities (needed for path validation)
  const rulesets = await Rulesets.create(db, {
    name: `Parent ${Math.random().toString(36).substr(2, 6)}`,
    description: "Parent ruleset",
    private: false,
    baseRules: "Dungeons & Dragons: 3.5",
    userId: owner.id,
    status: "Published",
  });
  const parent = rulesets[0];

  await Abilities.createMany(db, [
    { name: "Strength", description: "Physical power", rulesetId: parent.id },
    { name: "Dexterity", description: "Agility", rulesetId: parent.id },
    { name: "Constitution", description: "Stamina", rulesetId: parent.id },
    { name: "Intelligence", description: "Reasoning", rulesetId: parent.id },
    { name: "Wisdom", description: "Insight", rulesetId: parent.id },
    { name: "Charisma", description: "Personality", rulesetId: parent.id },
  ]);

  // Create a feat with a modifier, property, and requirement on the parent
  const feats = await Feats.createMany(db, [{
    name: `Test Feat ${Math.random().toString(36).substr(2, 6)}`,
    description: "Parent feat",
    rulesetId: parent.id,
  }]);
  const feat = feats[0];

  const modifiers = await Modifiers.createMany(db, [{
    sourceId: feat.id,
    sourceType: "feats",
    target: "abilities.strength.misc",
    value: "2",
    valueType: "number",
    operator: "add",
  }]);
  const modifier = modifiers[0];

  const properties = await Properties.createMany(db, [{
    entityId: feat.id,
    entityType: "feats",
    type: "tag",
    value: "combat",
  }]);
  const property = properties[0];

  const requirements = await Requirements.createMany(db, [{
    entityId: feat.id,
    entityType: "feats",
    level: "1",
    target: "abilities.strength.misc",
    value: "13",
    valueType: "number",
    operator: "greater_than_or_equal",
  }]);
  const requirement = requirements[0];

  // Also create a requirement on the modifier
  const modifierRequirements = await Requirements.createMany(db, [{
    entityId: modifier.id,
    entityType: "modifiers",
    level: "1",
    target: "abilities.strength.misc",
    value: "15",
    valueType: "number",
    operator: "greater_than_or_equal",
  }]);
  const modifierRequirement = modifierRequirements[0];

  // Fork it
  const fork = await RulesetsMethods.forkRuleset(
    forkSession,
    parent.id,
    { name: "Fork", description: "Fork", private: false },
  );

  return {
    parent,
    fork,
    ownerSession,
    forkSession,
    feat,
    modifier,
    property,
    requirement,
    modifierRequirement,
  };
}

async function createPublishedParentWithKlass() {
  const { user: owner, session: ownerSession } = await createTestUser();
  const { session: forkSession } = await createTestUser();

  const rulesets = await Rulesets.create(db, {
    name: `Parent ${Math.random().toString(36).substr(2, 6)}`,
    description: "Parent ruleset",
    private: false,
    baseRules: "Dungeons & Dragons: 3.5",
    userId: owner.id,
    status: "Published",
  });
  const parent = rulesets[0];

  await Abilities.createMany(db, [
    { name: "Strength", description: "Physical power", rulesetId: parent.id },
    { name: "Dexterity", description: "Agility", rulesetId: parent.id },
    { name: "Constitution", description: "Stamina", rulesetId: parent.id },
    { name: "Intelligence", description: "Reasoning", rulesetId: parent.id },
    { name: "Wisdom", description: "Insight", rulesetId: parent.id },
    { name: "Charisma", description: "Personality", rulesetId: parent.id },
  ]);

  const klasses = await Klasses.createMany(db, [{
    name: `Test Klass ${Math.random().toString(36).substr(2, 6)}`,
    description: "Parent klass",
    rulesetId: parent.id,
    hd: 8,
  }]);
  const klass = klasses[0];

  const levels = await KlassLevels.createMany(db, [{
    klassId: klass.id,
    level: 1,
  }]);
  const level = levels[0];

  await Properties.createMany(db, [
    { entityId: level.id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: "1" },
    { entityId: level.id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: "4" },
  ]);

  const modifiers = await Modifiers.createMany(db, [{
    sourceId: level.id,
    sourceType: "klass_levels",
    target: "abilities.strength.misc",
    value: "1",
    valueType: "number",
    operator: "add",
  }]);
  const levelModifier = modifiers[0];

  // Fork it
  const fork = await RulesetsMethods.forkRuleset(
    forkSession,
    parent.id,
    { name: "Fork", description: "Fork", private: false },
  );

  return { parent, fork, ownerSession, forkSession, klass, level, levelModifier };
}

/** Assert parent entity's customizations are completely unchanged. */
async function assertParentUnchanged(
  parentFeatId: string,
  expectedModifier: { target: string; value: string; operator: string },
  expectedProperty: { type: string; value: string },
  expectedRequirement: { level: string; value: string },
) {
  const parentModifiers = await Modifiers.findManyBySource(db, {
    sourceIds: [parentFeatId],
    sourceType: "feats",
  });
  expect(parentModifiers.length).toBe(1);
  expect(parentModifiers[0].target).toBe(expectedModifier.target);
  expect(parentModifiers[0].value).toBe(expectedModifier.value);
  expect(parentModifiers[0].operator).toBe(expectedModifier.operator);

  const parentProperties = await Properties.findManyByEntity(db, {
    entityIds: [parentFeatId],
    entityType: "feats",
  });
  expect(parentProperties.length).toBe(1);
  expect(parentProperties[0].type).toBe(expectedProperty.type);
  expect(parentProperties[0].value).toBe(expectedProperty.value);

  const parentRequirements = await Requirements.findManyByEntity(db, {
    entityIds: [parentFeatId],
    entityType: "feats",
  });
  expect(parentRequirements.length).toBe(1);
  expect(parentRequirements[0].level).toBe(expectedRequirement.level);
  expect(parentRequirements[0].value).toBe(expectedRequirement.value);
}

// ── Tests ────────────────────────────────────────────────────────

describe("COW - customization mutations on inherited entities", () => {
  // ────── MODIFIERS ──────

  describe("Modifiers", () => {
    test("createEntityModifier on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      const result = await ModifiersMethods.createEntityModifier(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        { target: "abilities.dexterity.misc", value: "1", operator: "add" },
      );

      // Should return a resolvedEntityId different from the parent feat
      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);

      // Snapshot should exist
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].sourceEntityId).toBe(feat.id);
      expect(snapshots[0].forkedEntityId).toBe(result.resolvedEntityId);

      // The new modifier should be on the COW'd feat, not the parent
      expect(result.sourceId).toBe(result.resolvedEntityId);

      // Parent must be unchanged — still has exactly 1 modifier
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [feat.id], sourceType: "feats",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].target).toBe("abilities.strength.misc");
    });

    test("updateEntityModifier on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, modifier } = await createPublishedParentWithFeat();

      const result = await ModifiersMethods.updateEntityModifier(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        modifier.id,
        { target: "abilities.dexterity.misc", value: "5", operator: "add" },
      );

      // Should return resolvedEntityId (the COW'd feat)
      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);

      // The updated modifier should have the new values
      expect(result.target).toBe("abilities.dexterity.misc");
      expect(result.value).toBe("5");

      // The updated modifier ID should differ from the original
      expect(result.id).not.toBe(modifier.id);

      // Snapshot should exist
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].sourceEntityId).toBe(feat.id);

      // CRITICAL: Parent modifier must be completely unchanged
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [feat.id], sourceType: "feats",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].id).toBe(modifier.id);
      expect(parentModifiers[0].target).toBe("abilities.strength.misc");
      expect(parentModifiers[0].value).toBe("2");
      expect(parentModifiers[0].operator).toBe("add");
    });

    test("deleteEntityModifier on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, modifier } = await createPublishedParentWithFeat();

      const result = await ModifiersMethods.deleteEntityModifier(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        modifier.id,
      );

      // Should return resolvedEntityId
      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);

      // The COW'd feat should have 0 modifiers (deleted)
      const cowModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [result.resolvedEntityId], sourceType: "feats",
      });
      expect(cowModifiers.length).toBe(0);

      // CRITICAL: Parent modifier must still exist
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [feat.id], sourceType: "feats",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].id).toBe(modifier.id);
      expect(parentModifiers[0].target).toBe("abilities.strength.misc");
    });

    test("updateEntityModifier on owned feat does NOT trigger COW", async () => {
      const { user: owner, session } = await createTestUser();
      const rulesets = await Rulesets.create(db, {
        name: `Owned ${Math.random().toString(36).substr(2, 6)}`,
        description: "Owned ruleset",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: owner.id,
      });
      const ruleset = rulesets[0];

      await Abilities.createMany(db, [
        { name: "Strength", description: "Physical power", rulesetId: ruleset.id },
        { name: "Dexterity", description: "Agility", rulesetId: ruleset.id },
        { name: "Constitution", description: "Stamina", rulesetId: ruleset.id },
        { name: "Intelligence", description: "Reasoning", rulesetId: ruleset.id },
        { name: "Wisdom", description: "Insight", rulesetId: ruleset.id },
        { name: "Charisma", description: "Personality", rulesetId: ruleset.id },
      ]);

      const feats = await Feats.createMany(db, [{
        name: "Owned Feat",
        description: "desc",
        rulesetId: ruleset.id,
      }]);
      const modifier = await ModifiersMethods.createEntityModifier(
        session, ruleset.id, "feats", feats[0].id,
        { target: "abilities.strength.misc", value: "2", operator: "add" },
      );

      const result = await ModifiersMethods.updateEntityModifier(
        session, ruleset.id, "feats", feats[0].id, modifier.id,
        { target: "abilities.dexterity.misc", value: "3", operator: "add" },
      );

      // Same modifier ID (no COW)
      expect(result.id).toBe(modifier.id);
      // resolvedEntityId should equal the original (no change)
      expect(result.resolvedEntityId).toBe(feats[0].id);

      // No snapshots
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: ruleset.id });
      expect(snapshots.length).toBe(0);
    });

    test("createEntityModifier on inherited klass_level triggers COW of entire klass", async () => {
      const { fork, forkSession, klass, level } = await createPublishedParentWithKlass();

      const result = await ModifiersMethods.createEntityModifier(
        forkSession,
        fork.id,
        "klass_levels",
        level.id,
        { target: "abilities.dexterity.misc", value: "3", operator: "add" },
      );

      // resolvedEntityId should be the COW'd level ID
      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(level.id);

      // The COW should have created a snapshot for the klass (not the level)
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].entityType).toBe("klasses");
      expect(snapshots[0].sourceEntityId).toBe(klass.id);

      // Parent klass_level modifier should be unchanged
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [level.id], sourceType: "klass_levels",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].target).toBe("abilities.strength.misc");
    });

    test("updateEntityModifier on inherited klass_level modifier triggers COW and preserves parent", async () => {
      const { fork, forkSession, klass, level, levelModifier } = await createPublishedParentWithKlass();

      const result = await ModifiersMethods.updateEntityModifier(
        forkSession,
        fork.id,
        "klass_levels",
        level.id,
        levelModifier.id,
        { target: "abilities.dexterity.misc", value: "5", operator: "add" },
      );

      // resolvedEntityId = COW'd level ID
      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(level.id);

      // Updated modifier has new values
      expect(result.target).toBe("abilities.dexterity.misc");
      expect(result.value).toBe("5");

      // Snapshot for the klass
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].entityType).toBe("klasses");
      expect(snapshots[0].sourceEntityId).toBe(klass.id);

      // CRITICAL: Parent klass_level modifier unchanged
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [level.id], sourceType: "klass_levels",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].id).toBe(levelModifier.id);
      expect(parentModifiers[0].target).toBe("abilities.strength.misc");
      expect(parentModifiers[0].value).toBe("1");
    });

    test("deleteEntityModifier on inherited klass_level modifier triggers COW and preserves parent", async () => {
      const { fork, forkSession, level, levelModifier } = await createPublishedParentWithKlass();

      const result = await ModifiersMethods.deleteEntityModifier(
        forkSession,
        fork.id,
        "klass_levels",
        level.id,
        levelModifier.id,
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(level.id);

      // COW'd level should have 0 modifiers
      const cowModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [result.resolvedEntityId], sourceType: "klass_levels",
      });
      expect(cowModifiers.length).toBe(0);

      // CRITICAL: Parent level still has its modifier
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [level.id], sourceType: "klass_levels",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].id).toBe(levelModifier.id);
    });
  });

  // ────── PROPERTIES ──────

  describe("Properties", () => {
    test("createEntityProperty on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, property } = await createPublishedParentWithFeat();

      const result = await PropertiesMethods.createEntityProperty(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        { value: "new-value", type: "note" },
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);

      // Parent property unchanged
      const parentProperties = await Properties.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentProperties.length).toBe(1);
      expect(parentProperties[0].id).toBe(property.id);
      expect(parentProperties[0].type).toBe("tag");
      expect(parentProperties[0].value).toBe("combat");
    });

    test("updateEntityProperty on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, property } = await createPublishedParentWithFeat();

      const result = await PropertiesMethods.updateEntityProperty(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        property.id,
        { value: "updated-value", type: "tag" },
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);
      expect(result.value).toBe("updated-value");

      // Snapshot exists
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(1);

      // CRITICAL: Parent property completely unchanged
      const parentProperties = await Properties.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentProperties.length).toBe(1);
      expect(parentProperties[0].id).toBe(property.id);
      expect(parentProperties[0].value).toBe("combat");
      expect(parentProperties[0].type).toBe("tag");
    });

    test("deleteEntityProperty on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, property } = await createPublishedParentWithFeat();

      const result = await PropertiesMethods.deleteEntityProperty(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        property.id,
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);

      // COW'd feat should have 0 properties (deleted)
      const cowProperties = await Properties.findManyByEntity(db, {
        entityIds: [result.resolvedEntityId], entityType: "feats",
      });
      expect(cowProperties.length).toBe(0);

      // CRITICAL: Parent property still exists
      const parentProperties = await Properties.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentProperties.length).toBe(1);
      expect(parentProperties[0].id).toBe(property.id);
    });
  });

  // ────── REQUIREMENTS ──────

  describe("Requirements", () => {
    test("createEntityRequirement on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, requirement } = await createPublishedParentWithFeat();

      const result = await RequirementsMethods.createEntityRequirement(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        { level: "2", target: "abilities.dexterity.misc", value: "10", operator: "greater_than_or_equal" },
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);

      // Parent requirement unchanged
      const parentRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentRequirements.length).toBe(1);
      expect(parentRequirements[0].id).toBe(requirement.id);
      expect(parentRequirements[0].value).toBe("13");
    });

    test("updateEntityRequirement on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, requirement } = await createPublishedParentWithFeat();

      const result = await RequirementsMethods.updateEntityRequirement(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        requirement.id,
        { level: "1", target: "abilities.strength.misc", value: "15", operator: "greater_than_or_equal" },
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);
      expect(result.value).toBe("15");

      // Snapshot exists
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(1);

      // CRITICAL: Parent requirement unchanged
      const parentRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentRequirements.length).toBe(1);
      expect(parentRequirements[0].id).toBe(requirement.id);
      expect(parentRequirements[0].value).toBe("13");
    });

    test("deleteEntityRequirement on inherited feat triggers COW and preserves parent", async () => {
      const { fork, forkSession, feat, requirement } = await createPublishedParentWithFeat();

      const result = await RequirementsMethods.deleteEntityRequirement(
        forkSession,
        fork.id,
        "feats",
        feat.id,
        requirement.id,
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(feat.id);

      // COW'd feat should have 0 requirements (deleted)
      const cowRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [result.resolvedEntityId], entityType: "feats",
      });
      expect(cowRequirements.length).toBe(0);

      // CRITICAL: Parent requirement still exists
      const parentRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentRequirements.length).toBe(1);
      expect(parentRequirements[0].id).toBe(requirement.id);
    });

    test("createEntityRequirement on inherited modifier triggers COW and preserves parent", async () => {
      const { fork, forkSession, modifier, modifierRequirement } = await createPublishedParentWithFeat();

      const result = await RequirementsMethods.createEntityRequirement(
        forkSession,
        fork.id,
        "modifiers",
        modifier.id,
        { level: "2", target: "abilities.dexterity.misc", value: "10", operator: "greater_than_or_equal" },
      );

      // resolvedEntityId = the COW'd modifier ID (not the feat ID)
      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(modifier.id);

      // The new requirement is on the COW'd modifier
      expect(result.entityId).toBe(result.resolvedEntityId);

      // CRITICAL: Parent modifier's requirements unchanged
      const parentModifierReqs = await Requirements.findManyByEntity(db, {
        entityIds: [modifier.id], entityType: "modifiers",
      });
      expect(parentModifierReqs.length).toBe(1);
      expect(parentModifierReqs[0].id).toBe(modifierRequirement.id);
      expect(parentModifierReqs[0].value).toBe("15");
    });

    test("updateEntityRequirement on inherited modifier's requirement triggers COW and preserves parent", async () => {
      const { fork, forkSession, modifier, modifierRequirement } = await createPublishedParentWithFeat();

      const result = await RequirementsMethods.updateEntityRequirement(
        forkSession,
        fork.id,
        "modifiers",
        modifier.id,
        modifierRequirement.id,
        { level: "1", target: "abilities.strength.misc", value: "20", operator: "greater_than_or_equal" },
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(modifier.id);
      expect(result.value).toBe("20");

      // CRITICAL: Parent modifier requirement unchanged
      const parentModifierReqs = await Requirements.findManyByEntity(db, {
        entityIds: [modifier.id], entityType: "modifiers",
      });
      expect(parentModifierReqs.length).toBe(1);
      expect(parentModifierReqs[0].id).toBe(modifierRequirement.id);
      expect(parentModifierReqs[0].value).toBe("15");
    });

    test("deleteEntityRequirement on inherited modifier's requirement triggers COW and preserves parent", async () => {
      const { fork, forkSession, modifier, modifierRequirement } = await createPublishedParentWithFeat();

      const result = await RequirementsMethods.deleteEntityRequirement(
        forkSession,
        fork.id,
        "modifiers",
        modifier.id,
        modifierRequirement.id,
      );

      expect(result.resolvedEntityId).toBeDefined();
      expect(result.resolvedEntityId).not.toBe(modifier.id);

      // COW'd modifier should have 0 requirements
      const cowModifierReqs = await Requirements.findManyByEntity(db, {
        entityIds: [result.resolvedEntityId], entityType: "modifiers",
      });
      expect(cowModifierReqs.length).toBe(0);

      // CRITICAL: Parent modifier requirement still exists
      const parentModifierReqs = await Requirements.findManyByEntity(db, {
        entityIds: [modifier.id], entityType: "modifiers",
      });
      expect(parentModifierReqs.length).toBe(1);
      expect(parentModifierReqs[0].id).toBe(modifierRequirement.id);
    });
  });

  // ────── FULL PARENT INTEGRITY ──────

  describe("Full parent integrity after multiple fork mutations", () => {
    test("parent feat is completely unchanged after fork creates, updates, and deletes customizations", async () => {
      const ctx = await createPublishedParentWithFeat();
      const { fork, forkSession, feat, modifier } = ctx;

      // 1. Create a new modifier on the inherited feat (triggers COW)
      const createResult = await ModifiersMethods.createEntityModifier(
        forkSession, fork.id, "feats", feat.id,
        { target: "abilities.dexterity.misc", value: "1", operator: "add" },
      );
      const cowFeatId = createResult.resolvedEntityId;

      // 2. Update the inherited property on the now-COW'd feat
      //    (entity already COW'd, should operate on the copy)
      const cowProperties = await Properties.findManyByEntity(db, {
        entityIds: [cowFeatId], entityType: "feats",
      });
      const cowPropertyId = cowProperties.find(p => p.type === "tag")?.id;
      expect(cowPropertyId).toBeDefined();

      await PropertiesMethods.updateEntityProperty(
        forkSession, fork.id, "feats", cowFeatId, cowPropertyId!,
        { value: "changed", type: "tag" },
      );

      // 3. Delete the inherited requirement on the COW'd feat
      const cowRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [cowFeatId], entityType: "feats",
      });
      const cowRequirementId = cowRequirements.find(r => r.level === "1")?.id;
      expect(cowRequirementId).toBeDefined();

      await RequirementsMethods.deleteEntityRequirement(
        forkSession, fork.id, "feats", cowFeatId, cowRequirementId!,
      );

      // CRITICAL: Verify parent is COMPLETELY unchanged
      await assertParentUnchanged(
        feat.id,
        { target: "abilities.strength.misc", value: "2", operator: "add" },
        { type: "tag", value: "combat" },
        { level: "1", value: "13" },
      );

      // Parent feat row itself unchanged
      const parentFeat = await Feats.findOne(db, { id: feat.id });
      expect(parentFeat).toBeDefined();
      expect(parentFeat!.description).toBe("Parent feat");

      // Parent modifier's requirements also unchanged
      const parentModifierReqs = await Requirements.findManyByEntity(db, {
        entityIds: [modifier.id], entityType: "modifiers",
      });
      expect(parentModifierReqs.length).toBe(1);
    });
  });

  // ────── OVERRIDES DIALOG INTEGRATION ──────

  describe("Overrides dialog shows COW'd customization changes", () => {
    test("updating a modifier on inherited feat makes it appear in getChanges", async () => {
      const { fork, forkSession, feat, modifier } = await createPublishedParentWithFeat();

      // Before: no feat changes (the fork seeds template items when the parent
      // has none — those appear as "added" but aren't the focus of this test)
      let featChanges = (await RulesetsMethods.getChanges(forkSession, fork.id))
        .filter((c) => c.entityType === "feats");
      expect(featChanges.length).toBe(0);

      // Update the inherited modifier
      await ModifiersMethods.updateEntityModifier(
        forkSession, fork.id, "feats", feat.id, modifier.id,
        { target: "abilities.dexterity.misc", value: "5", operator: "add" },
      );

      // After: feat appears as modified
      featChanges = (await RulesetsMethods.getChanges(forkSession, fork.id))
        .filter((c) => c.entityType === "feats");
      expect(featChanges.length).toBe(1);
      const change = featChanges[0];
      expect(change.status).toBe("modified");
      if (change.status === "modified") {
        expect(change.sourceEntityId).toBe(feat.id);
      }
    });

    test("deleting a property on inherited feat makes it appear in getChanges", async () => {
      const { fork, forkSession, feat, property } = await createPublishedParentWithFeat();

      await PropertiesMethods.deleteEntityProperty(
        forkSession, fork.id, "feats", feat.id, property.id,
      );

      const featChanges = (await RulesetsMethods.getChanges(forkSession, fork.id))
        .filter((c) => c.entityType === "feats");
      expect(featChanges.length).toBe(1);
      expect(featChanges[0].status).toBe("modified");
    });

    test("reverting after customization COW restores parent visibility", async () => {
      const { fork, forkSession, feat, modifier } = await createPublishedParentWithFeat();

      // COW via modifier update
      await ModifiersMethods.updateEntityModifier(
        forkSession, fork.id, "feats", feat.id, modifier.id,
        { target: "abilities.dexterity.misc", value: "5", operator: "add" },
      );

      let featChanges = (await RulesetsMethods.getChanges(forkSession, fork.id))
        .filter((c) => c.entityType === "feats");
      expect(featChanges.length).toBe(1);

      // Revert
      await RulesetsMethods.revertOverride(forkSession, fork.id, "feats", feat.id);

      // Feat changes cleared
      featChanges = (await RulesetsMethods.getChanges(forkSession, fork.id))
        .filter((c) => c.entityType === "feats");
      expect(featChanges.length).toBe(0);

      // Parent modifier is the one visible again (no owned copy)
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(0);
    });
  });

  // ────── OVERRIDEMAP RESOLUTION AFTER PRIOR COW ──────

  describe("Customization mutations after entity is already COW'd (overrideMap resolution)", () => {
    test("updateEntityModifier using parent entityId after entity was COW'd by a prior update", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // Step 1: COW the entity via an entity-level update
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      // Get the COW'd modifier (cloned onto the COW'd feat)
      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      expect(snapshot).toBeDefined();
      const cowFeatId = snapshot!.forkedEntityId;
      const cowModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [cowFeatId], sourceType: "feats",
      });
      expect(cowModifiers.length).toBe(1);
      const cowModifier = cowModifiers[0];

      // Step 2: Update the COW'd modifier using the PARENT's entity ID
      // (this is what the frontend does — URL has parent ID via resolveOverrides)
      const result = await ModifiersMethods.updateEntityModifier(
        forkSession, fork.id, "feats", feat.id, cowModifier.id,
        { target: "abilities.dexterity.misc", value: "10", operator: "add" },
      );

      expect(result.target).toBe("abilities.dexterity.misc");
      expect(result.value).toBe("10");

      // Parent modifier unchanged
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [feat.id], sourceType: "feats",
      });
      expect(parentModifiers.length).toBe(1);
      expect(parentModifiers[0].target).toBe("abilities.strength.misc");
    });

    test("deleteEntityModifier using parent entityId after entity was COW'd by a prior update", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // Step 1: COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;
      const cowModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [cowFeatId], sourceType: "feats",
      });
      const cowModifier = cowModifiers[0];

      // Step 2: Delete using parent's entity ID
      const result = await ModifiersMethods.deleteEntityModifier(
        forkSession, fork.id, "feats", feat.id, cowModifier.id,
      );

      expect(result.resolvedEntityId).toBe(cowFeatId);

      // COW'd feat has 0 modifiers
      const remaining = await Modifiers.findManyBySource(db, {
        sourceIds: [cowFeatId], sourceType: "feats",
      });
      expect(remaining.length).toBe(0);

      // Parent modifier still exists
      const parentModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [feat.id], sourceType: "feats",
      });
      expect(parentModifiers.length).toBe(1);
    });

    test("updateEntityProperty using parent entityId after entity was COW'd by a prior update", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // Step 1: COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;
      const cowProperties = await Properties.findManyByEntity(db, {
        entityIds: [cowFeatId], entityType: "feats",
      });
      expect(cowProperties.length).toBe(1);
      const cowProperty = cowProperties[0];

      // Step 2: Update using parent's entity ID
      const result = await PropertiesMethods.updateEntityProperty(
        forkSession, fork.id, "feats", feat.id, cowProperty.id,
        { value: "updated", type: "tag" },
      );

      expect(result.value).toBe("updated");

      // Parent property unchanged
      const parentProperties = await Properties.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentProperties.length).toBe(1);
      expect(parentProperties[0].value).toBe("combat");
    });

    test("deleteEntityProperty using parent entityId after entity was COW'd by a prior update", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // Step 1: COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;
      const cowProperties = await Properties.findManyByEntity(db, {
        entityIds: [cowFeatId], entityType: "feats",
      });
      const cowProperty = cowProperties[0];

      // Step 2: Delete using parent's entity ID
      const result = await PropertiesMethods.deleteEntityProperty(
        forkSession, fork.id, "feats", feat.id, cowProperty.id,
      );

      expect(result.resolvedEntityId).toBe(cowFeatId);

      // Parent property still exists
      const parentProperties = await Properties.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentProperties.length).toBe(1);
      expect(parentProperties[0].value).toBe("combat");
    });

    test("updateEntityRequirement using parent entityId after entity was COW'd by a prior update", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // Step 1: COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;
      const cowRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [cowFeatId], entityType: "feats",
      });
      expect(cowRequirements.length).toBe(1);
      const cowRequirement = cowRequirements[0];

      // Step 2: Update using parent's entity ID
      const result = await RequirementsMethods.updateEntityRequirement(
        forkSession, fork.id, "feats", feat.id, cowRequirement.id,
        { level: "1", target: "abilities.strength.misc", value: "20", operator: "greater_than_or_equal" },
      );

      expect(result.value).toBe("20");

      // Parent requirement unchanged
      const parentRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentRequirements.length).toBe(1);
      expect(parentRequirements[0].value).toBe("13");
    });

    test("deleteEntityRequirement using parent entityId after entity was COW'd by a prior update", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // Step 1: COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;
      const cowRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [cowFeatId], entityType: "feats",
      });
      const cowRequirement = cowRequirements[0];

      // Step 2: Delete using parent's entity ID
      const result = await RequirementsMethods.deleteEntityRequirement(
        forkSession, fork.id, "feats", feat.id, cowRequirement.id,
      );

      expect(result.resolvedEntityId).toBe(cowFeatId);

      // Parent requirement still exists
      const parentRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [feat.id], entityType: "feats",
      });
      expect(parentRequirements.length).toBe(1);
      expect(parentRequirements[0].value).toBe("13");
    });

    test("getEntityModifiers using parent entityId after entity was COW'd returns fork's modifiers", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      // Add a modifier on the COW'd entity
      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;

      await Modifiers.createMany(db, [{
        sourceId: cowFeatId,
        sourceType: "feats",
        target: "abilities.dexterity.misc",
        value: "99",
        valueType: "number",
        operator: "add",
      }]);

      // GET using parent's entity ID should return COW'd entity's modifiers
      const modifiers = await ModifiersMethods.getEntityModifiers(fork.id, "feats", feat.id);
      expect(modifiers.some((m: { value: string }) => m.value === "99")).toBe(true);
      expect(modifiers.every((m: { sourceId: string }) => m.sourceId === cowFeatId)).toBe(true);
    });

    test("getEntityProperties using parent entityId after entity was COW'd returns fork's properties", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;

      // GET using parent's entity ID should return COW'd entity's properties
      const properties = await PropertiesMethods.getEntityProperties(fork.id, "feats", feat.id);
      expect(properties.length).toBeGreaterThan(0);
      expect(properties.every((p: { entityId: string }) => p.entityId === cowFeatId)).toBe(true);
    });

    test("getEntityRequirements using parent entityId after entity was COW'd returns fork's requirements", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;

      // GET using parent's entity ID should return COW'd entity's requirements
      const requirements = await RequirementsMethods.getEntityRequirements(fork.id, "feats", feat.id);
      expect(requirements.length).toBeGreaterThan(0);
      expect(requirements.every((r: { entityId: string }) => r.entityId === cowFeatId)).toBe(true);
    });

    test("createEntityModifier using parent entityId after entity was COW'd attaches to fork's copy", async () => {
      const { fork, forkSession, feat } = await createPublishedParentWithFeat();

      // COW the entity
      await FeatsMethods.updateRulesetFeat(forkSession, fork.id, feat.id, {
        name: feat.name,
        description: "COW'd description",
      });
      invalidateAll();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, {
        sourceEntityId: feat.id,
        rulesetId: fork.id,
      });
      const cowFeatId = snapshot!.forkedEntityId;

      // Create using parent's entity ID
      const result = await ModifiersMethods.createEntityModifier(
        forkSession, fork.id, "feats", feat.id,
        { target: "abilities.dexterity.misc", value: "5", operator: "add" },
      );

      // Should attach to the existing COW'd copy, not create another
      expect(result.resolvedEntityId).toBe(cowFeatId);
      expect(result.sourceId).toBe(cowFeatId);

      // No duplicate snapshots
      const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: fork.id });
      expect(snapshots.length).toBe(1);
    });
  });
});
