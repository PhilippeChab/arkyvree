import { expect, test } from "bun:test";

import type { FieldValue } from "@/engine/index.ts";
import { type Item, type Klass, type KlassLevel, type Race } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers, Rulesets } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { findFormValues, viewValuesOf, writeFieldValues } from "@/tests/support/ownerValues.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  invalidateSeededRuleset,
  invalidateTestRulesets,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  CLASS_CASTER_TYPE,
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
  DAMAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_QUADRUPED,
  RACE_SIZE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

type EntityType = "races" | "classes" | "items";

/**
 * The field each sibling copy is marked with (its first's value, its second's), and what the host reads of them merged:
 * an item's damage types are a set, every sibling's; a race's and a class's one value, the winning copy's.
 */
const MARKERS: Record<EntityType, { merged: string[]; type: string; values: [FieldValue, FieldValue] }> = {
  races: { type: RACE_QUADRUPED, values: [true, false], merged: ["true"] },
  classes: { type: CLASS_CASTER_TYPE, values: ["Arcane", "Divine"], merged: ["Arcane"] },
  items: { type: DAMAGE_TYPE, values: ["Bludgeoning", "Piercing"], merged: ["Bludgeoning", "Piercing"] },
};

async function setup(entityType: EntityType, omitLastLevel = false) {
  const session = makeSession();
  const host = await createSeededTestRuleset(session.userId);
  const baseId = host.ancestorRulesetIds[0];
  const source =
    entityType === "races"
      ? (await Entities.findOne<Race>(db, { entityType: "races", rulesetId: baseId, name: "Human" }))!
      : entityType === "classes"
        ? (await Entities.findOne<Klass>(db, { entityType: "classes", rulesetId: baseId, name: "Fighter" }))!
        : (await Entities.create<Item>(db, "items", { rulesetId: baseId, name: "Sibling item fixture" }))[0];
  if (entityType === "items") invalidateSeededRuleset(baseId);
  const marker = MARKERS[entityType];
  const extensions: string[] = [];
  const sourceIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const extension = await createSeededTestRuleset(session.userId);
    const copy = await copyEntity(db, entityType, source.id, extension);
    await writeFieldValues(entityType, copy.id, [[marker.type, marker.values[i]]]);
    // Classes have modifiers on their levels, not directly on the class.
    if (entityType !== "classes") {
      await Modifiers.create(db, {
        sourceId: copy.id,
        sourceType: entityType,
        target: "abilities.strength.misc",
        value: String(i + 10),
        valueType: "number",
        operator: "add",
      });
    }
    if (omitLastLevel) {
      const last = (await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [copy.id] })).find(
        (level) => level.position === 20,
      )!;
      await EntitiesService.deleteOwnedEntity(session, extension.id, "classes", copy.id, last.id);
    }
    await Rulesets.update(
      db,
      { kind: "extension", status: "Published", private: false, userId: null },
      { id: extension.id },
    );
    extensions.push(extension.id);
    sourceIds.push(copy.id);
  }
  await RulesetExtensionsService.subscribeExtension(session, host.id, extensions);
  const read = () =>
    withRulesetScope(db, host.id, async ({ rulesetData }) => {
      const id = rulesetData.canonicalize(source.id);
      return {
        values: (viewValuesOf(rulesetData, id).fields[marker.type] ?? []).map(String).sort(),
        modifiers: (rulesetData.modifiersBySource.get(id) ?? [])
          .filter((m) => m.target === "abilities.strength.misc" && Number(m.value) >= 10)
          .map((m) => m.value)
          .sort(),
      };
    });
  const before = await read();
  expect(before).toEqual({ values: marker.merged, modifiers: entityType === "classes" ? [] : ["10", "11"] });
  const sourcesValues = () => Promise.all(sourceIds.map((id) => findFormValues(entityType, id)));
  const originals = await sourcesValues();
  const assertCopied = async () => {
    for (const cold of [false, true]) {
      if (cold) invalidateTestRulesets(host.id, ...extensions);
      expect(await read()).toEqual(before);
    }
    const id = await withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.canonicalize(source.id));
    expect(sourceIds).not.toContain(id);
    // Verify rows were actually copied, not merely re-merged into the read view.
    const stored = await findFormValues(entityType, id);
    expect((stored.fields[marker.type] ?? []).map(String).sort()).toEqual(before.values);
    expect(await sourcesValues()).toEqual(originals);
  };
  return { session, host, source, assertCopied };
}

for (const entityType of ["races", "classes", "items"] as const) {
  test(`${entityType}: ordinary edit copies all visible sibling customizations`, async () => {
    const { session, host, source, assertCopied } = await setup(entityType);
    if (entityType === "races") {
      await EntitiesService.updateEntity(session, host.id, "races", source.id, {
        name: source.name,
        description: "edited description",
        fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 },
      });
    } else if (entityType === "classes") {
      await EntitiesService.updateEntity(session, host.id, "classes", source.id, {
        name: source.name,
        description: "edited description",
      });
    } else {
      await EntitiesService.updateEntity(session, host.id, "items", source.id, {
        name: source.name,
        description: "edited description",
      });
    }
    await assertCopied();
  });
}

for (const action of ["add skill", "remove skill", "create level", "update level", "delete level"] as const) {
  test(`${action} copies the inherited class with its sibling customizations`, async () => {
    const { session, host, source, assertCopied } = await setup("classes", action === "create level");
    const { assignedSkill, otherSkill, levelId } = await withRulesetScope(db, host.id, async ({ rulesetData }) => {
      const id = rulesetData.canonicalize(source.id);
      const assigned = Dnd35View.of(rulesetData).classSkillsOf(id);
      return {
        assignedSkill: assigned[0].toId,
        otherSkill: Dnd35View.of(rulesetData).skills.find((skill) => !assigned.some((link) => link.toId === skill.id))!
          .id,
        levelId: [...Dnd35View.of(rulesetData).classLevelsById.values()].find(
          (level) => level.ownerId === id && level.position === 1,
        )!.id,
      };
    });
    if (action === "add skill") {
      await EntitiesService.addEntityLink(session, host.id, "classes", source.id, otherSkill);
    } else if (action === "remove skill") {
      await EntitiesService.removeEntityLink(session, host.id, "classes", source.id, assignedSkill);
    } else if (action === "create level") {
      await EntitiesService.createOwnedEntity(session, host.id, "classes", source.id, {
        fields: { [CLASS_LEVEL_BAB]: 20, [CLASS_LEVEL_SKILL_POINTS]: 2 },
        position: 20,
      });
    } else if (action === "update level") {
      await EntitiesService.updateOwnedEntity(session, host.id, "classes", source.id, levelId, {
        fields: { [CLASS_LEVEL_SKILL_POINTS]: 3 },
      });
    } else {
      await EntitiesService.deleteOwnedEntity(session, host.id, "classes", source.id, levelId);
    }
    await assertCopied();
  });
}
