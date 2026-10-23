import { expect, test } from "bun:test";

import type { Item, Klass, KlassLevel, Race } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers, Properties, Rulesets } from "@/server/repositories/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  invalidateSeededRuleset,
  invalidateTestRulesets,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import { DAMAGE_TYPE, KLASS_CASTER_TYPE, RACE_QUADRUPED } from "@/vocabulary/dnd3.5/properties/index.ts";

type EntityType = "races" | "klasses" | "items";

/**
 * The property each sibling copy is marked with (its first's value, its second's), and what the host reads of them
 * merged: an item's damage types are a set, every sibling's; a race's and a class's one value, the winning copy's.
 */
const MARKERS: Record<EntityType, { merged: string[]; type: string; values: [string, string] }> = {
  races: { type: RACE_QUADRUPED, values: ["true", "false"], merged: ["true"] },
  klasses: { type: KLASS_CASTER_TYPE, values: ["Arcane", "Divine"], merged: ["Arcane"] },
  items: { type: DAMAGE_TYPE, values: ["Bludgeoning", "Piercing"], merged: ["Bludgeoning", "Piercing"] },
};

async function setup(entityType: EntityType, omitLastLevel = false) {
  const session = makeSession();
  const host = await createSeededTestRuleset(session.userId);
  const baseId = host.ancestorRulesetIds[0];
  const source =
    entityType === "races"
      ? (await Entities.findOne<Race>(db, { entityType: "races", rulesetId: baseId, name: "Human" }))!
      : entityType === "klasses"
        ? (await Entities.findOne<Klass>(db, { entityType: "klasses", rulesetId: baseId, name: "Fighter" }))!
        : (await Entities.create<Item>(db, "items", { rulesetId: baseId, name: "Sibling item fixture" }))[0];
  if (entityType === "items") invalidateSeededRuleset(baseId);
  const marker = MARKERS[entityType];
  const extensions: string[] = [];
  const sourceIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const extension = await createSeededTestRuleset(session.userId);
    const copy = await copyEntity(db, entityType, source.id, extension);
    await Properties.createMany(db, [{ entityId: copy.id, entityType, type: marker.type, value: marker.values[i] }]);
    // Classes have modifiers on their levels, not directly on the class.
    if (entityType !== "klasses") {
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
      const last = (await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [copy.id] })).find(
        (level) => level.level === 20,
      )!;
      await ClassLevelsService.deleteClassLevel(session, extension.id, copy.id, last.id);
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
        properties: (rulesetData.propertiesByEntity.get(id) ?? [])
          .filter((p) => p.type === marker.type)
          .map((p) => p.value)
          .sort(),
        modifiers: (rulesetData.modifiersBySource.get(id) ?? [])
          .filter((m) => m.target === "abilities.strength.misc" && Number(m.value) >= 10)
          .map((m) => m.value)
          .sort(),
      };
    });
  const before = await read();
  expect(before).toEqual({ properties: marker.merged, modifiers: entityType === "klasses" ? [] : ["10", "11"] });
  const originals = await Properties.findMany(db, { entityIds: sourceIds });
  const assertCopied = async () => {
    for (const cold of [false, true]) {
      if (cold) invalidateTestRulesets(host.id, ...extensions);
      expect(await read()).toEqual(before);
    }
    const id = await withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.canonicalize(source.id));
    expect(sourceIds).not.toContain(id);
    // Verify rows were actually copied, not merely re-merged into the read view.
    const stored = await Properties.findMany(db, { entityIds: [id], entityType });
    expect(
      stored
        .filter((p) => p.type === marker.type)
        .map((p) => p.value)
        .sort(),
    ).toEqual(before.properties);
    expect(await Properties.findMany(db, { entityIds: sourceIds })).toEqual(originals);
  };
  return { session, host, source, assertCopied };
}

for (const entityType of ["races", "klasses", "items"] as const) {
  test(`${entityType}: ordinary edit copies all visible sibling customizations`, async () => {
    const { session, host, source, assertCopied } = await setup(entityType);
    if (entityType === "races") {
      await EntitiesService.updateEntity(session, host.id, "races", source.id, {
        name: source.name,
        description: "edited description",
        size: "Medium",
        baseSpeed: 30,
      });
    } else if (entityType === "klasses") {
      await EntitiesService.updateEntity(session, host.id, "klasses", source.id, {
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
    const { session, host, source, assertCopied } = await setup("klasses", action === "create level");
    const { assignedSkill, otherSkill, levelId } = await withRulesetScope(db, host.id, async ({ rulesetData }) => {
      const id = rulesetData.canonicalize(source.id);
      const assigned = rulesetData.klassSkillsByKlass.get(id)!;
      return {
        assignedSkill: assigned[0].skillId,
        otherSkill: rulesetData.skills.find((skill) => !assigned.some((row) => row.skillId === skill.id))!.id,
        levelId: [...rulesetData.klassLevelsById.values()].find((level) => level.klassId === id && level.level === 1)!
          .id,
      };
    });
    if (action === "add skill") {
      await ClassSkillsService.addClassSkill(session, host.id, source.id, otherSkill);
    } else if (action === "remove skill") {
      await ClassSkillsService.removeClassSkill(session, host.id, source.id, assignedSkill);
    } else if (action === "create level") {
      await ClassLevelsService.createClassLevel(session, host.id, source.id, {
        level: 20,
        fields: { bab: 20, skills: 2 },
      });
    } else if (action === "update level") {
      await ClassLevelsService.updateClassLevel(session, host.id, source.id, levelId, { fields: { skills: 3 } });
    } else {
      await ClassLevelsService.deleteClassLevel(session, host.id, source.id, levelId);
    }
    await assertCopied();
  });
}
