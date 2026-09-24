import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { EntitySnapshots, Feats, Modifiers, Powers, Properties, Requirements, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import { timingStorage } from "@/server/timing.ts";
import { NotFoundError } from "@/server/errors/index.ts";

type EntityType = "feats" | "powers";
type Pairing = "snapshot" | "name";

async function setup(entityType: EntityType, pairing: Pairing) {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const host = await createSeededTestRuleset(session.userId);
  const repo = entityType === "feats" ? Feats : Powers;
  const base = (await repo.findOne(db, { rulesetId: host.ancestorRulesetIds[0], name: entityType === "feats" ? "Toughness" : "Magic Missile" }))!;
  const extensions: Array<{ extension: Awaited<ReturnType<typeof createSeededTestRuleset>>; copy: { id: string } }> = [];
  for (let index = 0; index < 2; index++) {
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
  return { session, host, winnerId, loser, loserRulesetId: extensions.find(e => e.copy.id === loser.id)!.extension.id };
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
        // Check the copied row by identity; existing read-time sibling merging
        // may still expose the original contribution as a separate row.
        for (const cold of [false, true]) {
          if (cold) invalidateAll();
          const visible = await PropertiesMethods.getEntityProperties(host.id, entityType, result.resolvedEntityId);
          expect(visible.find(p => p.id === result.id)?.value).toBe(action === "update" ? "after" : undefined);
        }
        await expect(PropertiesMethods.updateEntityProperty(session, host.id, entityType, result.resolvedEntityId, property.id, { type: property.type, value: "stale" })).rejects.toThrow(NotFoundError);
        const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId: host.id });
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].sourceEntityId).toBe(winnerId);
        await RulesetsMethods.revertOverride(session, host.id, entityType, winnerId);
        expect((await PropertiesMethods.getEntityProperties(host.id, entityType, winnerId)).filter(p => p.type === property.type)).toEqual([expect.objectContaining({ id: property.id, value: "before" })]);
      });
    }

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
        expect(visible.find(m => m.id === result.id)?.value).toBe(action === "update" ? "5" : undefined);
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

test("installing another extension after a local copy retains its contributions", async () => {
  const { session, host, winnerId, loser, loserRulesetId } = await setup("feats", "snapshot");
  const [property] = await Properties.create(db, { entityId: loser.id, entityType: "feats", type: "NEW_EXTENSION", value: "1" });
  invalidateAll();
  await RulesetsMethods.unsubscribeExtension(session, host.id, loserRulesetId);
  const local = await PropertiesMethods.createEntityProperty(session, host.id, "feats", winnerId, { type: "LOCAL", value: "1" });
  await RulesetsMethods.subscribeExtension(session, host.id, [loserRulesetId]);
  const visible = await PropertiesMethods.getEntityProperties(host.id, "feats", local.resolvedEntityId);
  expect(visible.some(p => p.id === property.id)).toBe(true);
});
