import { expect, test } from "bun:test";

import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  Aptitudes,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Modifiers,
  Powers,
  PowersAptitudes,
  Properties,
  Requirements,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { STRENGTH_BONUS } from "@/tests/support/customizations.ts";
import { measure } from "@/tests/support/database.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

type EntityType = "feats" | "powers";
type Pairing = "snapshot" | "name";

async function setup(entityType: EntityType, pairing: Pairing, extensionCount = 2) {
  const session = makeSession();
  const host = await createSeededTestRuleset(session.userId);
  const repo = entityType === "feats" ? Feats : Powers;
  const base = (await repo.findOne(db, {
    rulesetId: host.ancestorRulesetIds[0],
    name: entityType === "feats" ? "Toughness" : "Magic Missile",
  }))!;
  const extensions: Array<{ extension: Awaited<ReturnType<typeof createSeededTestRuleset>>; copy: { id: string } }> =
    [];
  for (let index = 0; index < extensionCount; index++) {
    const extension = await createSeededTestRuleset(session.userId);
    await Rulesets.update(
      db,
      { kind: "extension", status: "Published", private: false, userId: null },
      { id: extension.id },
    );
    const copy =
      pairing === "snapshot"
        ? await copyEntity(db, entityType, base.id, extension)
        : (await repo.create(db, { name: "Sibling write fixture", rulesetId: extension.id }))[0];
    extensions.push({ extension, copy });
  }
  await RulesetExtensionsService.subscribeExtension(
    session,
    host.id,
    extensions.map((e) => e.extension.id),
  );
  const winnerId = await withRulesetScope(db, host.id, async ({ rulesetData }) =>
    rulesetData.canonicalize(extensions[0].copy.id),
  );
  const loser = extensions.find((e) => e.copy.id !== winnerId)!.copy;
  return {
    session,
    host,
    winnerId,
    loser,
    extensions,
    loserRulesetId: extensions.find((e) => e.copy.id === loser.id)!.extension.id,
  };
}

for (const entityType of ["feats", "powers"] as const) {
  for (const pairing of ["snapshot", "name"] as const) {
    for (const action of ["update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling property locally, then restore the override`, async () => {
        const { session, host, winnerId, loser } = await setup(entityType, pairing);
        const [property] = await Properties.create(db, {
          entityId: loser.id,
          entityType,
          type: "SIBLING_MARKER",
          value: "before",
        });
        RulesetCache.invalidateAll();
        expect(
          (await PropertiesService.getProperties(host.id, entityType, winnerId)).some((p) => p.id === property.id),
        ).toBe(true);
        const result =
          action === "update"
            ? await PropertiesService.updateProperty(session, host.id, entityType, winnerId, property.id, {
                type: property.type,
                value: "after",
              })
            : await PropertiesService.deleteProperty(session, host.id, entityType, winnerId, property.id);
        expect(result.resolvedEntityId).not.toBe(winnerId);
        expect(await Properties.findOne(db, { id: property.id })).toEqual(property);
        for (const cold of [false, true]) {
          if (cold) RulesetCache.invalidateAll();
          const visible = await PropertiesService.getProperties(host.id, entityType, result.resolvedEntityId);
          expect(visible.filter((p) => p.type === property.type)).toEqual(
            action === "update" ? [expect.objectContaining({ id: result.id, value: "after" })] : [],
          );
        }
        await expect(
          PropertiesService.updateProperty(session, host.id, entityType, result.resolvedEntityId, property.id, {
            type: property.type,
            value: "stale",
          }),
        ).rejects.toThrow(NotFoundError);
        const snapshots = await EntitySnapshots.findMany(db, { rulesetId: host.id });
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].sourceEntityId).toBe(winnerId);
        await RulesetChangesService.revertOverride(session, host.id, entityType, winnerId);
        expect(
          (await PropertiesService.getProperties(host.id, entityType, winnerId)).filter(
            (p) => p.type === property.type,
          ),
        ).toEqual([expect.objectContaining({ id: property.id, value: "before" })]);
      });
    }

    test(`${pairing} ${entityType}: removed requirements and aptitude links stay removed, including after entity deletion`, async () => {
      const { session, host, winnerId, loser, loserRulesetId } = await setup(entityType, pairing);
      const [requirement] = await Requirements.create(db, {
        entityId: loser.id,
        entityType,
        level: "1",
        target: "abilities.strength.total",
        value: "11",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
      const [aptitude] = await Aptitudes.create(db, { name: "Sibling aptitude fixture", rulesetId: loserRulesetId });
      if (entityType === "feats") {
        await FeatsAptitudes.create(db, { featId: loser.id, aptitudeId: aptitude.id });
      } else {
        await PowersAptitudes.create(db, { powerId: loser.id, aptitudeId: aptitude.id });
      }
      RulesetCache.invalidateAll();
      const local = await PropertiesService.createProperty(session, host.id, entityType, winnerId, {
        type: "LOCAL",
        value: "1",
      });
      const copied = await RequirementsService.getRequirements(host.id, entityType, local.resolvedEntityId);
      const copiedRequirement = copied.find((r) => r.target === requirement.target)!;
      expect(copiedRequirement.id).not.toBe(requirement.id);
      await RequirementsService.deleteRequirement(
        session,
        host.id,
        entityType,
        local.resolvedEntityId,
        copiedRequirement.id,
      );
      if (entityType === "feats") {
        const feat = await FeatsService.getFeat(host.id, local.resolvedEntityId);
        expect(feat.featsAptitudesInRules.some((a) => a.aptitudeId === aptitude.id)).toBe(true);
        await FeatsService.updateFeat(session, host.id, feat.id, { name: feat.name, aptitudeIds: [] });
      } else {
        const power = await PowersService.getPower(host.id, local.resolvedEntityId);
        expect(power.powersAptitudesInRules.some((a) => a.aptitudeId === aptitude.id)).toBe(true);
        await PowersService.updatePower(session, host.id, power.id, { name: power.name, aptitudes: [] });
      }
      for (const cold of [false, true]) {
        if (cold) RulesetCache.invalidateAll();
        const requirements = await RequirementsService.getRequirements(host.id, entityType, local.resolvedEntityId);
        expect(requirements.some((r) => r.target === requirement.target)).toBe(false);
        if (entityType === "feats") {
          expect((await FeatsService.getFeat(host.id, local.resolvedEntityId)).featsAptitudesInRules).toEqual([]);
        } else {
          expect((await PowersService.getPower(host.id, local.resolvedEntityId)).powersAptitudesInRules).toEqual([]);
        }
      }
      expect(await Requirements.findOne(db, { id: requirement.id })).toEqual(requirement);
      if (entityType === "feats") {
        await FeatsService.deleteFeat(session, host.id, local.resolvedEntityId);
      } else {
        await PowersService.deletePower(session, host.id, local.resolvedEntityId);
      }
      RulesetCache.invalidateAll();
      await withRulesetScope(db, host.id, async ({ rulesetData }) => {
        const entities = entityType === "feats" ? rulesetData.featsById : rulesetData.powersById;
        for (const id of [winnerId, loser.id, local.resolvedEntityId]) expect(entities.get(id)).toBeUndefined();
        expect(rulesetData.requirementsByEntity.get(local.resolvedEntityId) ?? []).toEqual([]);
      });
      await RulesetChangesService.revertOverride(session, host.id, entityType, winnerId);
      const restored = await RequirementsService.getRequirements(host.id, entityType, winnerId);
      expect(restored.filter((r) => r.target === requirement.target)).toEqual([
        expect.objectContaining({ value: requirement.value, operator: requirement.operator }),
      ]);
      if (entityType === "feats") {
        expect(
          (await FeatsService.getFeat(host.id, winnerId)).featsAptitudesInRules.some(
            (a) => a.aptitudeId === aptitude.id,
          ),
        ).toBe(true);
      } else {
        expect(
          (await PowersService.getPower(host.id, winnerId)).powersAptitudesInRules.some(
            (a) => a.aptitudeId === aptitude.id,
          ),
        ).toBe(true);
      }
    });

    for (const action of ["create", "update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling modifier requirement without changing its source`, async () => {
        const { session, host, winnerId, loser } = await setup(entityType, pairing);
        const [modifier] = await Modifiers.create(db, {
          ...STRENGTH_BONUS,
          sourceId: loser.id,
          sourceType: entityType,
        });
        const [original] = await Requirements.create(db, {
          entityId: modifier.id,
          entityType: "modifiers",
          level: "1",
          chainingOperator: "and",
        });
        RulesetCache.invalidateAll();
        expect(
          (await ModifiersService.getModifiers(host.id, entityType, winnerId)).some((m) => m.id === modifier.id),
        ).toBe(true);
        const result =
          action === "create"
            ? await RequirementsService.createRequirement(session, host.id, "modifiers", modifier.id, {
                level: "2",
                chainingOperator: "or",
              })
            : action === "update"
              ? await RequirementsService.updateRequirement(session, host.id, "modifiers", modifier.id, original.id, {
                  level: "1",
                  chainingOperator: "or",
                })
              : await RequirementsService.deleteRequirement(session, host.id, "modifiers", modifier.id, original.id);
        expect(result.resolvedEntityId).not.toBe(modifier.id);
        expect(await Modifiers.findOne(db, { id: modifier.id })).toEqual(modifier);
        expect(await Requirements.findMany(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual([
          original,
        ]);
        const copies = await ModifiersService.getModifiers(host.id, entityType, winnerId);
        expect(copies.filter((m) => m.target === modifier.target)).toEqual([
          expect.objectContaining({ id: result.resolvedEntityId }),
        ]);
        const requirements = await RequirementsService.getRequirements(host.id, "modifiers", result.resolvedEntityId);
        expect(requirements.map((r) => r.chainingOperator).sort()).toEqual(
          action === "create" ? ["and", "or"] : action === "update" ? ["or"] : [],
        );
        await expect(
          RequirementsService.createRequirement(session, host.id, "modifiers", modifier.id, {
            level: "3",
            chainingOperator: "and",
          }),
        ).rejects.toThrow(NotFoundError);
        // A subsequent edit using the returned local ID must continue to work.
        await RequirementsService.createRequirement(session, host.id, "modifiers", result.resolvedEntityId, {
          level: "3",
          chainingOperator: "and",
        });
      });
    }

    for (const action of ["update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling modifier survives a fresh read`, async () => {
        const { session, host, winnerId, loser } = await setup(entityType, pairing);
        const [modifier] = await Modifiers.create(db, {
          ...STRENGTH_BONUS,
          sourceId: loser.id,
          sourceType: entityType,
        });
        const [original] = await Requirements.create(db, {
          entityId: modifier.id,
          entityType: "modifiers",
          level: "1",
          chainingOperator: "and",
        });
        RulesetCache.invalidateAll();
        const result =
          action === "update"
            ? await ModifiersService.updateModifier(session, host.id, entityType, winnerId, modifier.id, {
                ...STRENGTH_BONUS,
                value: "5",
              })
            : await ModifiersService.deleteModifier(session, host.id, entityType, winnerId, modifier.id);
        RulesetCache.invalidateAll();
        const visible = await ModifiersService.getModifiers(host.id, entityType, result.resolvedEntityId);
        expect(visible.filter((m) => m.target === modifier.target)).toEqual(
          action === "update" ? [expect.objectContaining({ id: result.id, value: "5" })] : [],
        );
        expect(await Requirements.findMany(db, { entityIds: [result.id], entityType: "modifiers" })).toHaveLength(
          action === "update" ? 1 : 0,
        );
        expect(await Requirements.findOne(db, { id: original.id })).toEqual(original);
        expect(await Modifiers.findOne(db, { id: modifier.id })).toEqual(modifier);
      });
    }
  }
}

test("deduplicated sibling property and modifier IDs are not writable", async () => {
  const { session, host, winnerId, loser } = await setup("feats", "snapshot");
  const [ownProperty, hiddenProperty] = await Properties.createMany(
    db,
    [winnerId, loser.id].map((entityId) => ({ entityId, entityType: "feats", type: "SAME", value: "1" })),
  );
  const [, hiddenModifier] = await Modifiers.createMany(
    db,
    [winnerId, loser.id].map((sourceId) => ({ ...STRENGTH_BONUS, sourceId, sourceType: "feats" })),
  );
  RulesetCache.invalidateAll();
  const visible = await PropertiesService.getProperties(host.id, "feats", winnerId);
  expect(visible.some((p) => p.id === ownProperty.id)).toBe(true);
  expect(visible.some((p) => p.id === hiddenProperty.id)).toBe(false);
  await expect(
    PropertiesService.updateProperty(session, host.id, "feats", winnerId, hiddenProperty.id, {
      type: "SAME",
      value: "2",
    }),
  ).rejects.toThrow(NotFoundError);
  await expect(
    RequirementsService.createRequirement(session, host.id, "modifiers", hiddenModifier.id, {
      level: "1",
      chainingOperator: "and",
    }),
  ).rejects.toThrow(NotFoundError);
  expect(await EntitySnapshots.findMany(db, { rulesetId: host.id })).toHaveLength(0);
});

test("copying sibling modifiers and their requirements stays batched", async () => {
  const counts: number[] = [];
  for (const width of [1, 12]) {
    const { session, host, loser } = await setup("feats", "snapshot");
    const modifiers = await Modifiers.createMany(
      db,
      Array.from({ length: width }, (_, i) => ({
        ...STRENGTH_BONUS,
        value: String(i + 1),
        sourceId: loser.id,
        sourceType: "feats",
      })),
    );
    await Requirements.createMany(
      db,
      modifiers.map((m) => ({ entityId: m.id, entityType: "modifiers", level: "1", chainingOperator: "and" })),
    );
    RulesetCache.invalidateAll();
    await withRulesetScope(db, host.id, async () => {});
    const { timing } = await measure(() =>
      RequirementsService.createRequirement(session, host.id, "modifiers", modifiers[0].id, {
        level: "2",
        chainingOperator: "or",
      }),
    );
    counts.push(timing.queryCount);
  }
  expect(counts[1]).toBe(counts[0]);
});

test("installing another extension preserves the local override and exposes unrelated content", async () => {
  const { session, host, winnerId, loser, loserRulesetId } = await setup("feats", "snapshot");
  const [property] = await Properties.create(db, {
    entityId: loser.id,
    entityType: "feats",
    type: "NEW_EXTENSION",
    value: "1",
  });
  RulesetCache.invalidateAll();
  await RulesetExtensionsService.unsubscribeExtension(session, host.id, loserRulesetId);
  const local = await PropertiesService.createProperty(session, host.id, "feats", winnerId, {
    type: "LOCAL",
    value: "1",
  });
  const [unrelated] = await Feats.create(db, { name: "Unrelated extension feat", rulesetId: loserRulesetId });
  await RulesetExtensionsService.subscribeExtension(session, host.id, [loserRulesetId]);
  const visible = await PropertiesService.getProperties(host.id, "feats", local.resolvedEntityId);
  expect(visible.some((p) => p.id === property.id)).toBe(false);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.has(unrelated.id)).toBe(true);
    expect(rulesetData.canonicalize(loser.id)).toBe(local.resolvedEntityId);
  });
  await RulesetChangesService.revertOverride(session, host.id, "feats", winnerId);
  const restored = await PropertiesService.getProperties(host.id, "feats", winnerId);
  expect(restored.some((p) => p.id === property.id)).toBe(true);
});

for (const entityType of ["feats", "powers"] as const) {
  for (const pairing of ["snapshot", "name"] as const) {
    for (const kind of ["property", "modifier"] as const) {
      test(`${pairing} ${entityType}: copying follows display precedence across three extensions (${kind})`, async () => {
        const { session, extensions } = await setup(entityType, pairing, 3);
        for (const [index, { copy }] of extensions.entries()) {
          if (index === 0) continue;
          await Properties.create(db, {
            entityId: copy.id,
            entityType,
            type: "PRECEDENCE",
            value: "same",
            description: `Extension ${index}`,
          });
          const [modifier] = await Modifiers.create(db, {
            ...STRENGTH_BONUS,
            sourceId: copy.id,
            sourceType: entityType,
          });
          await Requirements.create(db, {
            entityId: modifier.id,
            entityType: "modifiers",
            level: "1",
            chainingOperator: index === 1 ? "and" : "or",
          });
        }
        // Keep the same stored rows and reverse only subscription precedence.
        for (const order of [
          [0, 2, 1],
          [0, 1, 2],
        ]) {
          const fork = await createSeededTestRuleset(session.userId);
          await RulesetExtensionsService.subscribeExtension(
            session,
            fork.id,
            order.map((i) => extensions[i].extension.id),
          );
          RulesetCache.invalidateAll();
          const winnerId = extensions[0].copy.id;
          const visible = await withRulesetScope(db, fork.id, async ({ rulesetData }) => ({
            property: rulesetData.propertiesByEntity.get(winnerId)!.find((p) => p.type === "PRECEDENCE")!,
            modifier: rulesetData.modifiersBySource.get(winnerId)!.find((m) => m.target === STRENGTH_BONUS.target)!,
          }));
          expect(visible.property.description).toBe(`Extension ${order[1]}`);
          const sourceRequirements = await Requirements.findMany(db, {
            entityIds: [visible.modifier.id],
            entityType: "modifiers",
          });
          expect(sourceRequirements[0].chainingOperator).toBe(order[1] === 1 ? "and" : "or");
          if (kind === "property") {
            const original = await Properties.findOne(db, { id: visible.property.id });
            const updated = await PropertiesService.updateProperty(
              session,
              fork.id,
              entityType,
              winnerId,
              visible.property.id,
              { type: "PRECEDENCE", value: "changed" },
            );
            expect(updated.value).toBe("changed");
            expect(updated.description).toBe(visible.property.description);
            expect(updated.id).not.toBe(visible.property.id);
            expect(await Properties.findOne(db, { id: visible.property.id })).toEqual(original);
          } else {
            const added = await RequirementsService.createRequirement(
              session,
              fork.id,
              "modifiers",
              visible.modifier.id,
              { level: "2", chainingOperator: "and" },
            );
            expect(added.resolvedEntityId).not.toBe(visible.modifier.id);
            const copiedRequirements = await Requirements.findMany(db, {
              entityIds: [added.resolvedEntityId],
              entityType: "modifiers",
            });
            expect(copiedRequirements).toHaveLength(2);
            expect(copiedRequirements.find((r) => r.level === "1")?.chainingOperator).toBe(
              sourceRequirements[0].chainingOperator,
            );
            expect(
              await Requirements.findMany(db, { entityIds: [visible.modifier.id], entityType: "modifiers" }),
            ).toEqual(sourceRequirements);
          }
        }
      });
    }
  }
}
