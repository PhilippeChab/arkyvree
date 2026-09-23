import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { describe, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Modifiers, Properties, Requirements, Sessions } from "@/server/repositories/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { cowEntityForCustomization } from "@/server/services/rulesets/cow.ts";

async function setup() {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const own = await createSeededTestRuleset(session.userId);
  const foreign = await createSeededTestRuleset(session.userId);
  const [feat] = await Feats.create(db, { rulesetId: foreign.id, name: "Foreign feat", description: "Untouched" });
  return { session, own, feat };
}

describe("ruleset customization isolation", () => {
  test("rejects foreign properties, modifiers, and requirements before writing", async () => {
    const { session, own, feat } = await setup();
    await expect(PropertiesMethods.createEntityProperty(session, own.id, "feats", feat.id, { type: "test", value: "changed" })).rejects.toThrow(NotFoundError);
    await expect(ModifiersMethods.createEntityModifier(session, own.id, "feats", feat.id, { target: "combat.ac.misc", operator: "add", value: "1" })).rejects.toThrow(NotFoundError);
    await expect(RequirementsMethods.createEntityRequirement(session, own.id, "feats", feat.id, { level: "1", chainingOperator: "and" })).rejects.toThrow(NotFoundError);
    expect(await Properties.findManyByEntity(db, { entityIds: [feat.id], entityType: "feats" })).toHaveLength(0);
    expect(await Modifiers.findManyBySource(db, { sourceIds: [feat.id], sourceType: "feats" })).toHaveLength(0);
    expect(await Requirements.findManyByEntity(db, { entityIds: [feat.id], entityType: "feats" })).toHaveLength(0);
  });

  test("rejects changing or deleting existing foreign rows", async () => {
    const { session, own, feat } = await setup();
    const [property] = await Properties.create(db, { entityId: feat.id, entityType: "feats", type: "test", value: "original" });
    const [requirement] = await Requirements.create(db, { entityId: feat.id, entityType: "feats", level: "1", chainingOperator: "and" });
    await expect(PropertiesMethods.updateEntityProperty(session, own.id, "feats", feat.id, property.id, { type: "test", value: "changed" })).rejects.toThrow(NotFoundError);
    await expect(PropertiesMethods.deleteEntityProperty(session, own.id, "feats", feat.id, property.id)).rejects.toThrow(NotFoundError);
    await expect(RequirementsMethods.deleteEntityRequirement(session, own.id, "feats", feat.id, requirement.id)).rejects.toThrow(NotFoundError);
    expect((await Properties.findOne(db, { id: property.id }))?.value).toBe("original");
    expect(await Requirements.findOne(db, { id: requirement.id })).toBeDefined();
  });

  test("COW itself refuses unrelated entities", async () => {
    const { own, feat } = await setup();
    await expect(cowEntityForCustomization(db, own.id, "feats", feat.id)).rejects.toThrow(NotFoundError);
  });

  test("inherited customizations still copy their source", async () => {
    const { session, own } = await setup();
    const feat = (await Feats.findOne(db, { rulesetId: own.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
    const property = await PropertiesMethods.createEntityProperty(session, own.id, "feats", feat.id, { type: "audit", value: "local" });
    expect(property.resolvedEntityId).not.toBe(feat.id);
    expect((await Feats.findOne(db, { id: property.resolvedEntityId }))?.rulesetId).toBe(own.id);
    expect((await Properties.findManyByEntity(db, { entityIds: [feat.id], entityType: "feats" })).some(p => p.type === "audit")).toBe(false);
  });
});

async function createModifier(sourceId: string) {
  const [modifier] = await Modifiers.create(db, {
    sourceId, sourceType: "feats", target: "abilities.strength.misc", value: "2", valueType: "number", operator: "add",
  });
  return modifier;
}

describe("modifier requirement ownership", () => {
  test("creates, updates, and deletes a requirement on a locally owned modifier", async () => {
    const { session, own } = await setup();
    const [feat] = await Feats.create(db, { rulesetId: own.id, name: "Local feat", description: "Local" });
    const modifier = await createModifier(feat.id);
    const requirement = await RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", modifier.id, { level: "1", chainingOperator: "and" });
    expect(requirement.entityId).toBe(modifier.id);
    await RequirementsMethods.updateEntityRequirement(session, own.id, "modifiers", modifier.id, requirement.id, { level: "1", chainingOperator: "or" });
    expect((await Requirements.findOne(db, { id: requirement.id }))?.chainingOperator).toBe("or");
    await RequirementsMethods.deleteEntityRequirement(session, own.id, "modifiers", modifier.id, requirement.id);
    expect(await Requirements.findOne(db, { id: requirement.id })).toBeUndefined();
  });

  test("copies an inherited modifier and its requirements without touching the ancestor", async () => {
    const { session, own } = await setup();
    const feat = (await Feats.findOne(db, { rulesetId: own.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
    const modifier = await createModifier(feat.id);
    const [original] = await Requirements.create(db, { entityType: "modifiers", entityId: modifier.id, level: "1", chainingOperator: "and" });
    invalidateRuleset(feat.rulesetId);
    const requirement = await RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", modifier.id, { level: "2", chainingOperator: "or" });
    expect(requirement.entityId).not.toBe(modifier.id);
    const copied = (await Modifiers.findOne(db, { id: requirement.entityId }))!;
    expect((await Feats.findOne(db, { id: copied.sourceId }))?.rulesetId).toBe(own.id);
    expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual([original]);
    const copies = await Requirements.findManyByEntity(db, { entityIds: [copied.id], entityType: "modifiers" });
    expect(copies).toHaveLength(2);
    expect(copies.some(r => r.level === "1" && r.chainingOperator === "and")).toBe(true);
    expect(await Modifiers.findOne(db, { id: modifier.id })).toEqual(modifier);
    await expect(RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", modifier.id, { level: "3", chainingOperator: "and" })).rejects.toThrow(NotFoundError);
    const second = await RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", copied.id, { level: "3", chainingOperator: "and" });
    expect(second.entityId).toBe(copied.id);
    expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual([original]);
  });

  test("rejects a modifier owned by an unrelated ruleset", async () => {
    const { session, own, feat } = await setup();
    const modifier = await createModifier(feat.id);
    await expect(RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", modifier.id, { level: "1", chainingOperator: "and" })).rejects.toThrow(NotFoundError);
    await expect(cowEntityForCustomization(db, own.id, "modifiers", modifier.id)).rejects.toThrow(NotFoundError);
    expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toHaveLength(0);
  });

  test("rejects unsupported or missing modifier owners", async () => {
    const { own, feat } = await setup();
    const modifier = await createModifier(feat.id);
    await Modifiers.update(db, { sourceType: "modifiers", sourceId: modifier.id }, { id: modifier.id });
    await expect(cowEntityForCustomization(db, own.id, "modifiers", modifier.id)).rejects.toThrow(NotFoundError);
    await Modifiers.update(db, { sourceType: "feats", sourceId: crypto.randomUUID() }, { id: modifier.id });
    await expect(cowEntityForCustomization(db, own.id, "modifiers", modifier.id)).rejects.toThrow(NotFoundError);
  });
});


describe("stale ancestor customization IDs", () => {
  for (const action of ["update", "delete"] as const) {
    test(`rejects ${action} through an ancestor property ID after the entity was copied`, async () => {
      const { session, own } = await setup();
      const feat = (await Feats.findOne(db, { rulesetId: own.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
      const [original] = await Properties.create(db, { entityId: feat.id, entityType: "feats", type: "review", value: "ancestor" });
      invalidateRuleset(feat.rulesetId);
      const local = await PropertiesMethods.createEntityProperty(session, own.id, "feats", feat.id, { type: "local", value: "copy" });
      const operation = action === "update"
        ? PropertiesMethods.updateEntityProperty(session, own.id, "feats", local.resolvedEntityId, original.id, { type: "review", value: "changed" })
        : PropertiesMethods.deleteEntityProperty(session, own.id, "feats", local.resolvedEntityId, original.id);
      await expect(operation).rejects.toThrow(NotFoundError);
      expect(await Properties.findOne(db, { id: original.id })).toEqual(original);
    });
    test(`rejects ${action} through an ancestor requirement ID after the entity was copied`, async () => {
      const { session, own } = await setup();
      const feat = (await Feats.findOne(db, { rulesetId: own.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
      const [original] = await Requirements.create(db, { entityId: feat.id, entityType: "feats", level: "1", chainingOperator: "and" });
      invalidateRuleset(feat.rulesetId);
      const local = await PropertiesMethods.createEntityProperty(session, own.id, "feats", feat.id, { type: "local", value: "copy" });
      const operation = action === "update"
        ? RequirementsMethods.updateEntityRequirement(session, own.id, "feats", local.resolvedEntityId, original.id, { level: "2", chainingOperator: "or" })
        : RequirementsMethods.deleteEntityRequirement(session, own.id, "feats", local.resolvedEntityId, original.id);
      await expect(operation).rejects.toThrow(NotFoundError);
      expect(await Requirements.findOne(db, { id: original.id })).toEqual(original);
    });
  }
});


test("editing the second identical inherited modifier keeps its own requirements", async () => {
  const { session, own } = await setup();
  const feat = (await Feats.findOne(db, { rulesetId: own.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
  const [first, second] = await Modifiers.createMany(db, [1, 2].map(() => ({ sourceId: feat.id, sourceType: "feats", target: "abilities.strength.misc", value: "2", valueType: "number", operator: "add" })));
  await Requirements.create(db, { entityId: first.id, entityType: "modifiers", level: "1", chainingOperator: "and" });
  await Requirements.create(db, { entityId: second.id, entityType: "modifiers", level: "2", chainingOperator: "or" });
  invalidateRuleset(feat.rulesetId);
  const added = await RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", second.id, { level: "3", chainingOperator: "and" });
  const requirements = await Requirements.findManyByEntity(db, { entityIds: [added.entityId], entityType: "modifiers" });
  expect(requirements.map(r => r.level).sort()).toEqual(["2", "3"]);
});
