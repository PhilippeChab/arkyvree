import { expect, test } from "bun:test";

import type { StoredValues } from "@/engine/core/fields/index.ts";
import type { Aptitude, Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import {
  Entities,
  EntitySnapshots,
  Joins,
  Modifiers,
  Properties,
  Requirements,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { measure } from "@/tests/support/database.ts";
import { STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  type Described,
  invalidateTestRulesets,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import { FEAT_FAMILY, FEAT_WEAPON_FINESSE, SPELL_SUBSCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

type EntityType = "feats" | "spells";
type Pairing = "snapshot" | "name";

/**
 * A single-valued property the seeded Toughness and Magic Missile hold none of, and its value in each extension that
 * gives it one: the copy that wins it shows the first of them in display order.
 */
const PRECEDENCE: Record<EntityType, { type: string; valueOf: (index: number) => string }> = {
  feats: { type: FEAT_WEAPON_FINESSE, valueOf: (index) => String(index === 1) },
  spells: { type: SPELL_SUBSCHOOL, valueOf: (index) => `Extension ${index}` },
};

async function setup(entityType: EntityType, pairing: Pairing, extensionCount = 2) {
  const session = makeSession();
  const host = await createSeededTestRuleset(session.userId);
  const base = (await Entities.findOne(db, {
    entityType,
    rulesetId: host.ancestorRulesetIds[0],
    name: entityType === "feats" ? "Toughness" : "Magic Missile",
  }))!;
  const extensions: Array<{ copy: { id: string }; extension: Awaited<ReturnType<typeof createSeededTestRuleset>> }> =
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
        : (await Entities.create(db, entityType, { name: "Sibling write fixture", rulesetId: extension.id }))[0];
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
    rulesetIds: [host.id, ...extensions.map((e) => e.extension.id)],
  };
}

for (const entityType of ["feats", "spells"] as const) {
  for (const pairing of ["snapshot", "name"] as const) {
    test(`${pairing} ${entityType}: removed requirements and aptitude links stay removed, including after entity deletion`, async () => {
      const { session, host, winnerId, loser, loserRulesetId, rulesetIds } = await setup(entityType, pairing);
      const [requirement] = await Requirements.create(db, {
        entityId: loser.id,
        entityType,
        level: "1",
        target: "abilities.strength.total",
        value: "11",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
      const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
        name: "Sibling aptitude fixture",
        rulesetId: loserRulesetId,
      });
      if (entityType === "feats")
        await Joins.create(db, "feats_aptitudes", { featId: loser.id, aptitudeId: aptitude.id });
      else await Joins.create(db, "spells_aptitudes", { spellId: loser.id, aptitudeId: aptitude.id });

      invalidateTestRulesets(...rulesetIds);
      const local = await ModifiersService.createModifier(session, host.id, entityType, winnerId, STRENGTH_BONUS);
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
        const feat = await EntitiesService.getEntity<Described<"feats">>(host.id, "feats", local.resolvedEntityId);
        expect(feat.featsAptitudesInRules.some((a) => a.aptitudeId === aptitude.id)).toBe(true);
        await EntitiesService.updateEntity(session, host.id, "feats", feat.id, { name: feat.name, aptitudeIds: [] });
      } else {
        const spell = await EntitiesService.getEntity<Described<"spells">>(host.id, "spells", local.resolvedEntityId);
        expect(spell.spellsAptitudesInRules.some((a) => a.aptitudeId === aptitude.id)).toBe(true);
        await EntitiesService.updateEntity(session, host.id, "spells", spell.id, { name: spell.name, aptitudes: [] });
      }
      for (const cold of [false, true]) {
        if (cold) invalidateTestRulesets(...rulesetIds);
        const requirements = await RequirementsService.getRequirements(host.id, entityType, local.resolvedEntityId);
        expect(requirements.some((r) => r.target === requirement.target)).toBe(false);
        if (entityType === "feats") {
          expect(
            (await EntitiesService.getEntity<Described<"feats">>(host.id, "feats", local.resolvedEntityId))
              .featsAptitudesInRules,
          ).toEqual([]);
        } else {
          expect(
            (await EntitiesService.getEntity<Described<"spells">>(host.id, "spells", local.resolvedEntityId))
              .spellsAptitudesInRules,
          ).toEqual([]);
        }
      }
      expect(await Requirements.findOne(db, { id: requirement.id })).toEqual(requirement);
      if (entityType === "feats") await EntitiesService.deleteEntity(session, host.id, "feats", local.resolvedEntityId);
      else await EntitiesService.deleteEntity(session, host.id, "spells", local.resolvedEntityId);

      invalidateTestRulesets(...rulesetIds);
      await withRulesetScope(db, host.id, async ({ rulesetData }) => {
        const entities =
          entityType === "feats" ? Dnd35View.of(rulesetData).featsById : Dnd35View.of(rulesetData).spellsById;
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
          (await EntitiesService.getEntity<Described<"feats">>(host.id, "feats", winnerId)).featsAptitudesInRules.some(
            (a) => a.aptitudeId === aptitude.id,
          ),
        ).toBe(true);
      } else {
        expect(
          (
            await EntitiesService.getEntity<Described<"spells">>(host.id, "spells", winnerId)
          ).spellsAptitudesInRules.some((a) => a.aptitudeId === aptitude.id),
        ).toBe(true);
      }
    });

    for (const action of ["create", "update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling modifier requirement without changing its source`, async () => {
        const { session, host, winnerId, loser, rulesetIds } = await setup(entityType, pairing);
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
        invalidateTestRulesets(...rulesetIds);
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
        await expectRefusedWith(
          RequirementsService.createRequirement(session, host.id, "modifiers", modifier.id, {
            level: "3",
            chainingOperator: "and",
          }),
          404,
        );
        // A subsequent edit using the returned local ID must continue to work.
        await RequirementsService.createRequirement(session, host.id, "modifiers", result.resolvedEntityId, {
          level: "3",
          chainingOperator: "and",
        });
      });
    }

    for (const action of ["update", "delete"] as const) {
      test(`${pairing} ${entityType}: ${action} a sibling modifier survives a fresh read`, async () => {
        const { session, host, winnerId, loser, rulesetIds } = await setup(entityType, pairing);
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
        invalidateTestRulesets(...rulesetIds);
        const result =
          action === "update"
            ? await ModifiersService.updateModifier(session, host.id, entityType, winnerId, modifier.id, {
                ...STRENGTH_BONUS,
                value: "5",
              })
            : await ModifiersService.deleteModifier(session, host.id, entityType, winnerId, modifier.id);
        invalidateTestRulesets(...rulesetIds);
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

test("deduplicated sibling modifier IDs are not writable", async () => {
  const { session, host, winnerId, loser, rulesetIds } = await setup("feats", "snapshot");
  const [, hiddenModifier] = await Modifiers.createMany(
    db,
    [winnerId, loser.id].map((sourceId) => ({ ...STRENGTH_BONUS, sourceId, sourceType: "feats" })),
  );
  invalidateTestRulesets(...rulesetIds);
  await expectRefusedWith(
    RequirementsService.createRequirement(session, host.id, "modifiers", hiddenModifier.id, {
      level: "1",
      chainingOperator: "and",
    }),
    404,
  );
  expect(await EntitySnapshots.findMany(db, { rulesetId: host.id })).toHaveLength(0);
});

test("copying sibling modifiers and their requirements stays batched", async () => {
  const counts: number[] = [];
  for (const width of [1, 12]) {
    const { session, host, loser, rulesetIds } = await setup("feats", "snapshot");
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
    invalidateTestRulesets(...rulesetIds);
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
  const { session, host, winnerId, loser, loserRulesetId, rulesetIds } = await setup("feats", "snapshot");
  // A family of the losing copy's own: a set, which a winner's view unions with its siblings'
  const family = { type: FEAT_FAMILY, value: "New Extension" };
  await Properties.createMany(db, [{ ...family, entityId: loser.id, entityType: "feats" }]);
  const holds = ({ fields }: StoredValues) => (fields[family.type] ?? []).some((value) => value === family.value);
  invalidateTestRulesets(...rulesetIds);
  await RulesetExtensionsService.unsubscribeExtension(session, host.id, loserRulesetId);
  const local = await EntitiesService.updateEntity(session, host.id, "feats", winnerId, {
    name: "Toughness",
    fields: { families: ["Luck"] },
  });
  const [unrelated] = await Entities.create<Feat>(db, "feats", {
    name: "Unrelated extension feat",
    rulesetId: loserRulesetId,
  });
  await RulesetExtensionsService.subscribeExtension(session, host.id, [loserRulesetId]);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(holds(rulesetData.valuesOf(local.id))).toBe(false);
    expect(Dnd35View.of(rulesetData).featsById.has(unrelated.id)).toBe(true);
    expect(rulesetData.canonicalize(loser.id)).toBe(local.id);
  });
  await RulesetChangesService.revertOverride(session, host.id, "feats", winnerId);
  await withRulesetScope(db, host.id, async ({ rulesetData }) => {
    expect(holds(rulesetData.valuesOf(winnerId))).toBe(true);
  });
});

for (const entityType of ["feats", "spells"] as const) {
  for (const pairing of ["snapshot", "name"] as const) {
    test(`${pairing} ${entityType}: copying follows display precedence across three extensions`, async () => {
      const { session, extensions, rulesetIds } = await setup(entityType, pairing, 3);
      const precedence = PRECEDENCE[entityType];
      for (const [index, { copy }] of extensions.entries()) {
        if (index === 0) continue;
        await Properties.createMany(db, [
          { entityId: copy.id, entityType, type: precedence.type, value: precedence.valueOf(index) },
        ]);
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
        invalidateTestRulesets(fork.id, ...rulesetIds);
        const winnerId = extensions[0].copy.id;
        const visible = await withRulesetScope(db, fork.id, async ({ rulesetData }) => ({
          property: String(rulesetData.valuesOf(winnerId).fields[precedence.type]![0]),
          modifier: rulesetData.modifiersBySource.get(winnerId)!.find((m) => m.target === STRENGTH_BONUS.target)!,
        }));
        expect(visible.property).toBe(precedence.valueOf(order[1]));
        const sourceProperties = () =>
          Properties.findMany(db, { entityIds: [extensions[order[1]].copy.id], entityType, type: precedence.type });
        const shownProperties = await sourceProperties();
        const sourceRequirements = await Requirements.findMany(db, {
          entityIds: [visible.modifier.id],
          entityType: "modifiers",
        });
        expect(sourceRequirements[0].chainingOperator).toBe(order[1] === 1 ? "and" : "or");
        const added = await RequirementsService.createRequirement(session, fork.id, "modifiers", visible.modifier.id, {
          level: "2",
          chainingOperator: "and",
        });
        expect(added.resolvedEntityId).not.toBe(visible.modifier.id);
        const copiedRequirements = await Requirements.findMany(db, {
          entityIds: [added.resolvedEntityId],
          entityType: "modifiers",
        });
        expect(copiedRequirements).toHaveLength(2);
        expect(copiedRequirements.find((r) => r.level === "1")?.chainingOperator).toBe(
          sourceRequirements[0].chainingOperator,
        );
        expect(await Requirements.findMany(db, { entityIds: [visible.modifier.id], entityType: "modifiers" })).toEqual(
          sourceRequirements,
        );
        // The entity copied with its modifier holds the property the view showed, its source's left as it was
        const { sourceId: copyId } = (await Modifiers.findOne(db, { id: added.resolvedEntityId }))!;
        const copiedProperties = await Properties.findMany(db, { entityIds: [copyId], entityType });
        expect(copiedProperties.filter((p) => p.type === precedence.type).map((p) => p.value)).toEqual([
          visible.property,
        ]);
        expect(await sourceProperties()).toEqual(shownProperties);
      }
    });
  }
}
