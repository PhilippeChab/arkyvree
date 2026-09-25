import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Aptitudes, EntitySnapshots, Feats, FeatsAptitudes, Modifiers, Powers, PowersAptitudes, Properties, Requirements, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import { timingStorage } from "@/server/timing.ts";
import { NotFoundError } from "@/server/errors/index.ts";

type EntityType = "feats" | "powers";
type Pairing = "snapshot" | "name";

async function setup(entityType: EntityType, pairing: Pairing, extensionCount = 2) {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const host = await createSeededTestRuleset(session.userId);
  const repo = entityType === "feats" ? Feats : Powers;
  const base = (await repo.findOne(db, { rulesetId: host.ancestorRulesetIds[0], name: entityType === "feats" ? "Toughness" : "Magic Missile" }))!;
  const extensions: Array<{ extension: Awaited<ReturnType<typeof createSeededTestRuleset>>; copy: { id: string } }> = [];
  for (let index = 0; index < extensionCount; index++) {
    const extension = await createSeededTestRuleset(session.userId);
    await Rulesets.update(db, { kind: "extension", status: "Published", private: false, userId: null }, { id: extension.id });
    const copy = pairing === "snapshot"
      ? await cowEntity(db, entityType, base.id, extension.id, extension.ancestorRulesetIds)
      : (await repo.create(db, { name: "Sibling write fixture", rulesetId: extension.id }))[0];
    extensions.push({ extension, copy });
  }
  await RulesetsMethods.subscribeExtension(session, host.id, extensions.map(e => e.extension.id));
  const winnerId = await withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.canonicalize(extensions[0].copy.id));
  const loser = extensions.find(e => e.copy.id !== winnerId)!.copy;
  return { session, host, winnerId, loser, extensions, loserRulesetId: extensions.find(e => e.copy.id === loser.id)!.extension.id };
}

const modifierValues = { target: "abilities.strength.misc", value: "2", valueType: "number", operator: "add" };

for (const entityType of ["feats", "powers"] as const) {
  for (const pairing of ["snapshot", "name"] as const) {
    for (const action of ["update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling property locally, then restore the override`, async () => {
        const { session, host, winnerId, loser } = await setup(entityType, pairing);
        const [property] = await Properties.create(db, { entityId: loser.id, entityType, type: "SIBLING_MARKER", value: "before" });
        invalidateAll();
        expect((await PropertiesMethods.getEntityProperties(host.id, entityType, winnerId)).some(p => p.id === property.id)).toBe(true);
        const result = action === "update"
          ? await PropertiesMethods.updateEntityProperty(session, host.id, entityType, winnerId, property.id, { type: property.type, value: "after" })
          : await PropertiesMethods.deleteEntityProperty(session, host.id, entityType, winnerId, property.id);
        expect(result.resolvedEntityId).not.toBe(winnerId);
        expect(await Properties.findOne(db, { id: property.id })).toEqual(property);
        for (const cold of [false, true]) {
          if (cold) invalidateAll();
          const visible = await PropertiesMethods.getEntityProperties(host.id, entityType, result.resolvedEntityId);
          expect(visible.filter(p => p.type === property.type)).toEqual(action === "update"
            ? [expect.objectContaining({ id: result.id, value: "after" })]
            : []);
        }
        await expect(PropertiesMethods.updateEntityProperty(session, host.id, entityType, result.resolvedEntityId, property.id, { type: property.type, value: "stale" })).rejects.toThrow(NotFoundError);
        const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: host.id });
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].sourceEntityId).toBe(winnerId);
        await RulesetsMethods.revertOverride(session, host.id, entityType, winnerId);
        expect((await PropertiesMethods.getEntityProperties(host.id, entityType, winnerId)).filter(p => p.type === property.type)).toEqual([expect.objectContaining({ id: property.id, value: "before" })]);
      });
    }

    test(`${pairing} ${entityType}: removed requirements and aptitude links stay removed, including after entity deletion`, async () => {
      const { session, host, winnerId, loser, loserRulesetId } = await setup(entityType, pairing);
      const [requirement] = await Requirements.create(db, {
        entityId: loser.id, entityType, level: "1", target: "abilities.strength.total",
        value: "11", valueType: "number", operator: "greater_than_or_equal",
      });
      const [aptitude] = await Aptitudes.create(db, { name: "Sibling aptitude fixture", rulesetId: loserRulesetId });
      if (entityType === "feats") {
        await FeatsAptitudes.create(db, { featId: loser.id, aptitudeId: aptitude.id });
      } else {
        await PowersAptitudes.create(db, { powerId: loser.id, aptitudeId: aptitude.id });
      }
      invalidateAll();
      const local = await PropertiesMethods.createEntityProperty(session, host.id, entityType, winnerId, { type: "LOCAL", value: "1" });
      const copied = await RequirementsMethods.getEntityRequirements(host.id, entityType, local.resolvedEntityId);
      const copiedRequirement = copied.find(r => r.target === requirement.target)!;
      expect(copiedRequirement.id).not.toBe(requirement.id);
      await RequirementsMethods.deleteEntityRequirement(session, host.id, entityType, local.resolvedEntityId, copiedRequirement.id);
      if (entityType === "feats") {
        const feat = await FeatsMethods.getRulesetFeat(host.id, local.resolvedEntityId);
        expect(feat.featsAptitudesInRules.some(a => a.aptitudeId === aptitude.id)).toBe(true);
        await FeatsMethods.updateRulesetFeat(session, host.id, feat.id, { name: feat.name, aptitudeIds: [] });
      } else {
        const power = await PowersMethods.getRulesetPower(host.id, local.resolvedEntityId);
        expect(power.powersAptitudesInRules.some(a => a.aptitudeId === aptitude.id)).toBe(true);
        await PowersMethods.updateRulesetPower(session, host.id, power.id, { name: power.name, aptitudes: [] });
      }
      for (const cold of [false, true]) {
        if (cold) invalidateAll();
        const requirements = await RequirementsMethods.getEntityRequirements(host.id, entityType, local.resolvedEntityId);
        expect(requirements.some(r => r.target === requirement.target)).toBe(false);
        if (entityType === "feats") {
          expect((await FeatsMethods.getRulesetFeat(host.id, local.resolvedEntityId)).featsAptitudesInRules).toEqual([]);
        } else {
          expect((await PowersMethods.getRulesetPower(host.id, local.resolvedEntityId)).powersAptitudesInRules).toEqual([]);
        }
      }
      expect(await Requirements.findOne(db, { id: requirement.id })).toEqual(requirement);
      if (entityType === "feats") {
        await FeatsMethods.deleteRulesetFeat(session, host.id, local.resolvedEntityId);
      } else {
        await PowersMethods.deleteRulesetPower(session, host.id, local.resolvedEntityId);
      }
      invalidateAll();
      await withRulesetScope(db, host.id, async ({ rulesetData }) => {
        const entities = entityType === "feats" ? rulesetData.featsById : rulesetData.powersById;
        for (const id of [winnerId, loser.id, local.resolvedEntityId]) expect(entities.get(id)).toBeUndefined();
        expect(rulesetData.requirementsByEntity.get(local.resolvedEntityId) ?? []).toEqual([]);
      });
      await RulesetsMethods.revertOverride(session, host.id, entityType, winnerId);
      const restored = await RequirementsMethods.getEntityRequirements(host.id, entityType, winnerId);
      expect(restored.filter(r => r.target === requirement.target)).toEqual([
        expect.objectContaining({ value: requirement.value, operator: requirement.operator }),
      ]);
      if (entityType === "feats") {
        expect((await FeatsMethods.getRulesetFeat(host.id, winnerId)).featsAptitudesInRules.some(a => a.aptitudeId === aptitude.id)).toBe(true);
      } else {
        expect((await PowersMethods.getRulesetPower(host.id, winnerId)).powersAptitudesInRules.some(a => a.aptitudeId === aptitude.id)).toBe(true);
      }
    });

    for (const action of ["create", "update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling modifier requirement without changing its source`, async () => {
        const { session, host, winnerId, loser } = await setup(entityType, pairing);
        const [modifier] = await Modifiers.create(db, { ...modifierValues, sourceId: loser.id, sourceType: entityType });
        const [original] = await Requirements.create(db, { entityId: modifier.id, entityType: "modifiers", level: "1", chainingOperator: "and" });
        invalidateAll();
        expect((await ModifiersMethods.getEntityModifiers(host.id, entityType, winnerId)).some(m => m.id === modifier.id)).toBe(true);
        const result = action === "create"
          ? await RequirementsMethods.createEntityRequirement(session, host.id, "modifiers", modifier.id, { level: "2", chainingOperator: "or" })
          : action === "update"
            ? await RequirementsMethods.updateEntityRequirement(session, host.id, "modifiers", modifier.id, original.id, { level: "1", chainingOperator: "or" })
            : await RequirementsMethods.deleteEntityRequirement(session, host.id, "modifiers", modifier.id, original.id);
        expect(result.resolvedEntityId).not.toBe(modifier.id);
        expect(await Modifiers.findOne(db, { id: modifier.id })).toEqual(modifier);
        expect(await Requirements.findManyByEntity(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual([original]);
        const copies = await ModifiersMethods.getEntityModifiers(host.id, entityType, winnerId);
        expect(copies.filter(m => m.target === modifier.target)).toEqual([expect.objectContaining({ id: result.resolvedEntityId })]);
        const requirements = await RequirementsMethods.getEntityRequirements(host.id, "modifiers", result.resolvedEntityId);
        expect(requirements.map(r => r.chainingOperator).sort()).toEqual(action === "create" ? ["and", "or"] : action === "update" ? ["or"] : []);
        await expect(RequirementsMethods.createEntityRequirement(session, host.id, "modifiers", modifier.id, { level: "3", chainingOperator: "and" })).rejects.toThrow(NotFoundError);
        // A subsequent edit using the returned local ID must continue to work.
        await RequirementsMethods.createEntityRequirement(session, host.id, "modifiers", result.resolvedEntityId, { level: "3", chainingOperator: "and" });
      });
    }

    for (const action of ["update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling modifier survives a fresh read`, async () => {
        const { session, host, winnerId, loser } = await setup(entityType, pairing);
        const [modifier] = await Modifiers.create(db, { ...modifierValues, sourceId: loser.id, sourceType: entityType });
        const [original] = await Requirements.create(db, { entityId: modifier.id, entityType: "modifiers", level: "1", chainingOperator: "and" });
        invalidateAll();
        const result = action === "update"
          ? await ModifiersMethods.updateEntityModifier(session, host.id, entityType, winnerId, modifier.id, { ...modifierValues, value: "5" })
          : await ModifiersMethods.deleteEntityModifier(session, host.id, entityType, winnerId, modifier.id);
        invalidateAll();
        const visible = await ModifiersMethods.getEntityModifiers(host.id, entityType, result.resolvedEntityId);
        expect(visible.filter(m => m.target === modifier.target)).toEqual(action === "update"
          ? [expect.objectContaining({ id: result.id, value: "5" })]
          : []);
        expect(await Requirements.findManyByEntity(db, { entityIds: [result.id], entityType: "modifiers" })).toHaveLength(action === "update" ? 1 : 0);
        expect(await Requirements.findOne(db, { id: original.id })).toEqual(original);
        expect(await Modifiers.findOne(db, { id: modifier.id })).toEqual(modifier);
      });
    }
  }
}

test("deduplicated sibling property and modifier IDs are not writable", async () => {
  const { session, host, winnerId, loser } = await setup("feats", "snapshot");
  const [ownProperty, hiddenProperty] = await Properties.createMany(db, [winnerId, loser.id].map(entityId => ({ entityId, entityType: "feats", type: "SAME", value: "1" })));
  const [, hiddenModifier] = await Modifiers.createMany(db, [winnerId, loser.id].map(sourceId => ({ ...modifierValues, sourceId, sourceType: "feats" })));
  invalidateAll();
  const visible = await PropertiesMethods.getEntityProperties(host.id, "feats", winnerId);
  expect(visible.some(p => p.id === ownProperty.id)).toBe(true);
  expect(visible.some(p => p.id === hiddenProperty.id)).toBe(false);
  await expect(PropertiesMethods.updateEntityProperty(session, host.id, "feats", winnerId, hiddenProperty.id, { type: "SAME", value: "2" })).rejects.toThrow(NotFoundError);
  await expect(RequirementsMethods.createEntityRequirement(session, host.id, "modifiers", hiddenModifier.id, { level: "1", chainingOperator: "and" })).rejects.toThrow(NotFoundError);
  expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: host.id })).toHaveLength(0);
});

test("copying sibling modifiers and their requirements stays batched", async () => {
  const counts: number[] = [];
  for (const width of [1, 12]) {
    const { session, host, loser } = await setup("feats", "snapshot");
    const modifiers = await Modifiers.createMany(db, Array.from({ length: width }, (_, i) => ({ ...modifierValues, value: String(i + 1), sourceId: loser.id, sourceType: "feats" })));
    await Requirements.createMany(db, modifiers.map(m => ({ entityId: m.id, entityType: "modifiers", level: "1", chainingOperator: "and" })));
    invalidateAll();
    await withRulesetScope(db, host.id, async () => {});
    const timing = { dbTimeMs: 0, queryCount: 0, activeQueries: 0, dbWallStart: 0, slowQueries: [], cacheHits: 0, cacheMisses: 0, dedupHits: 0, dedupMisses: 0 };
    await timingStorage.run(timing, () => RequirementsMethods.createEntityRequirement(session, host.id, "modifiers", modifiers[0].id, { level: "2", chainingOperator: "or" }));
    counts.push(timing.queryCount);
  }
  expect(counts[1]).toBe(counts[0]);
});

test("installing another extension preserves the local override and exposes unrelated content", async () => {
  const { session, host, winnerId, loser, loserRulesetId } = await setup("feats", "snapshot");
  const [property] = await Properties.create(db, { entityId: loser.id, entityType: "feats", type: "NEW_EXTENSION", value: "1" });
  invalidateAll();
  await RulesetsMethods.unsubscribeExtension(session, host.id, loserRulesetId);
  const local = await PropertiesMethods.createEntityProperty(session, host.id, "feats", winnerId, { type: "LOCAL", value: "1" });
  const [unrelated] = await Feats.create(db, { name: "Unrelated extension feat", rulesetId: loserRulesetId });
  await RulesetsMethods.subscribeExtension(session, host.id, [loserRulesetId]);
  const visible = await PropertiesMethods.getEntityProperties(host.id, "feats", local.resolvedEntityId);
  expect(visible.some(p => p.id === property.id)).toBe(false);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.has(unrelated.id)).toBe(true);
    expect(rulesetData.canonicalize(loser.id)).toBe(local.resolvedEntityId);
  });
  await RulesetsMethods.revertOverride(session, host.id, "feats", winnerId);
  const restored = await PropertiesMethods.getEntityProperties(host.id, "feats", winnerId);
  expect(restored.some(p => p.id === property.id)).toBe(true);
});

for (const entityType of ["feats", "powers"] as const) {
  for (const pairing of ["snapshot", "name"] as const) {
    for (const kind of ["property", "modifier"] as const) {
      test(`${pairing} ${entityType}: copying follows display precedence across three extensions (${kind})`, async () => {
        const { session, extensions } = await setup(entityType, pairing, 3);
        for (const [index, { copy }] of extensions.entries()) {
          if (index === 0) continue;
          await Properties.create(db, { entityId: copy.id, entityType, type: "PRECEDENCE", value: "same", description: `Extension ${index}` });
          const [modifier] = await Modifiers.create(db, { ...modifierValues, sourceId: copy.id, sourceType: entityType });
          await Requirements.create(db, { entityId: modifier.id, entityType: "modifiers", level: "1", chainingOperator: index === 1 ? "and" : "or" });
        }
        // Keep the same stored rows and reverse only subscription precedence.
        for (const order of [[0, 2, 1], [0, 1, 2]]) {
          const fork = await createSeededTestRuleset(session.userId);
          await RulesetsMethods.subscribeExtension(session, fork.id, order.map(i => extensions[i].extension.id));
          invalidateAll();
          const winnerId = extensions[0].copy.id;
          const visible = await withRulesetScope(db, fork.id, async ({ rulesetData }) => ({
            property: rulesetData.propertiesByEntity.get(winnerId)!.find(p => p.type === "PRECEDENCE")!,
            modifier: rulesetData.modifiersBySource.get(winnerId)!.find(m => m.target === modifierValues.target)!,
          }));
          expect(visible.property.description).toBe(`Extension ${order[1]}`);
          const sourceRequirements = await Requirements.findManyByEntity(db, { entityIds: [visible.modifier.id], entityType: "modifiers" });
          expect(sourceRequirements[0].chainingOperator).toBe(order[1] === 1 ? "and" : "or");
          if (kind === "property") {
            const original = await Properties.findOne(db, { id: visible.property.id });
            const updated = await PropertiesMethods.updateEntityProperty(session, fork.id, entityType, winnerId, visible.property.id, { type: "PRECEDENCE", value: "changed" });
            expect(updated.value).toBe("changed");
            expect(updated.description).toBe(visible.property.description);
            expect(updated.id).not.toBe(visible.property.id);
            expect(await Properties.findOne(db, { id: visible.property.id })).toEqual(original);
          } else {
            const added = await RequirementsMethods.createEntityRequirement(session, fork.id, "modifiers", visible.modifier.id, { level: "2", chainingOperator: "and" });
            expect(added.resolvedEntityId).not.toBe(visible.modifier.id);
            const copiedRequirements = await Requirements.findManyByEntity(db, { entityIds: [added.resolvedEntityId], entityType: "modifiers" });
            expect(copiedRequirements).toHaveLength(2);
            expect(copiedRequirements.find(r => r.level === "1")?.chainingOperator).toBe(sourceRequirements[0].chainingOperator);
            expect(await Requirements.findManyByEntity(db, { entityIds: [visible.modifier.id], entityType: "modifiers" })).toEqual(sourceRequirements);
          }
        }
      });
    }
  }
}
