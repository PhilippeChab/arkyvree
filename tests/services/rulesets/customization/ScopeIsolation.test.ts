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

async function createModifierChain(sourceId: string) {
  const [parent] = await Modifiers.create(db, {
    sourceId, sourceType: "feats", target: "abilities.strength.misc", value: "2", valueType: "number", operator: "add",
  });
  const [child] = await Modifiers.create(db, {
    sourceId: parent.id, sourceType: "modifiers", target: "abilities.dexterity.misc", value: "1", valueType: "number", operator: "add",
  });
  const [grandchild] = await Modifiers.create(db, {
    sourceId: child.id, sourceType: "modifiers", target: "abilities.wisdom.misc", value: "1", valueType: "number", operator: "add",
  });
  return { parent, child, grandchild };
}

describe("nested modifier customization ownership", () => {
  test("creates, updates, and deletes a requirement on a locally owned nested modifier", async () => {
    const { session, own } = await setup();
    const [feat] = await Feats.create(db, { rulesetId: own.id, name: "Local nested feat", description: "Local" });
    const { grandchild } = await createModifierChain(feat.id);
    const requirement = await RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", grandchild.id, { level: "1", chainingOperator: "and" });
    expect(requirement.entityId).toBe(grandchild.id);
    await RequirementsMethods.updateEntityRequirement(session, own.id, "modifiers", grandchild.id, requirement.id, { level: "1", chainingOperator: "or" });
    expect((await Requirements.findOne(db, { id: requirement.id }))?.chainingOperator).toBe("or");
    await RequirementsMethods.deleteEntityRequirement(session, own.id, "modifiers", grandchild.id, requirement.id);
    expect(await Requirements.findOne(db, { id: requirement.id })).toBeUndefined();
  });

  test("copies inherited nested modifiers and their requirements without touching the ancestor", async () => {
    const { session, own } = await setup();
    const feat = (await Feats.findOne(db, { rulesetId: own.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
    const { grandchild } = await createModifierChain(feat.id);
    const [original] = await Requirements.create(db, { entityType: "modifiers", entityId: grandchild.id, level: "1", chainingOperator: "and" });
    invalidateRuleset(feat.rulesetId);
    const requirement = await RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", grandchild.id, { level: "2", chainingOperator: "or" });
    expect(requirement.entityId).not.toBe(grandchild.id);
    const copiedGrandchild = (await Modifiers.findOne(db, { id: requirement.entityId }))!;
    const copiedChild = (await Modifiers.findOne(db, { id: copiedGrandchild.sourceId }))!;
    const copiedParent = (await Modifiers.findOne(db, { id: copiedChild.sourceId }))!;
    expect((await Feats.findOne(db, { id: copiedParent.sourceId }))?.rulesetId).toBe(own.id);
    const originals = await Requirements.findManyByEntity(db, { entityIds: [grandchild.id], entityType: "modifiers" });
    expect(originals).toEqual([original]);
    const copies = await Requirements.findManyByEntity(db, { entityIds: [copiedGrandchild.id], entityType: "modifiers" });
    expect(copies).toHaveLength(2);
    expect(copies.some(r => r.level === "1" && r.chainingOperator === "and")).toBe(true);
    expect(await Modifiers.findOne(db, { id: grandchild.id })).toEqual(grandchild);
    const second = await RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", grandchild.id, { level: "3", chainingOperator: "and" });
    expect(second.entityId).toBe(copiedGrandchild.id);
    expect(await Requirements.findManyByEntity(db, { entityIds: [grandchild.id], entityType: "modifiers" })).toEqual([original]);
  });

  test("rejects a nested chain owned by an unrelated ruleset", async () => {
    const { session, own, feat } = await setup();
    const { grandchild } = await createModifierChain(feat.id);
    await expect(RequirementsMethods.createEntityRequirement(session, own.id, "modifiers", grandchild.id, { level: "1", chainingOperator: "and" })).rejects.toThrow(NotFoundError);
    await expect(cowEntityForCustomization(db, own.id, "modifiers", grandchild.id)).rejects.toThrow(NotFoundError);
    expect(await Requirements.findManyByEntity(db, { entityIds: [grandchild.id], entityType: "modifiers" })).toHaveLength(0);
  });

  test("rejects cyclic and dangling modifier chains", async () => {
    const { own, feat } = await setup();
    const { parent, child, grandchild } = await createModifierChain(feat.id);
    await Modifiers.update(db, { sourceType: "modifiers", sourceId: grandchild.id }, { id: parent.id });
    await expect(cowEntityForCustomization(db, own.id, "modifiers", child.id)).rejects.toThrow(NotFoundError);
    await Modifiers.update(db, { sourceId: crypto.randomUUID() }, { id: parent.id });
    await expect(cowEntityForCustomization(db, own.id, "modifiers", child.id)).rejects.toThrow(NotFoundError);
  });
});
