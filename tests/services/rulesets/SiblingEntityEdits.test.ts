import { expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Items, Klasses, KlassLevels, Modifiers, Properties, Races, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { RacesMethods } from "@/server/services/rulesets/RacesService.ts";
import { ClassesMethods } from "@/server/services/rulesets/ClassesService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { ClassSkillsMethods } from "@/server/services/rulesets/classes/ClassSkillsService.ts";
import { ClassLevelsMethods } from "@/server/services/rulesets/classes/ClassLevelsService.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";

type EntityType = "races" | "klasses" | "items";

async function setup(entityType: EntityType, omitLastLevel = false) {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const host = await createSeededTestRuleset(session.userId);
  const baseId = host.ancestorRulesetIds[0];
  const source = entityType === "races" ? (await Races.findOne(db, { rulesetId: baseId, name: "Human" }))!
    : entityType === "klasses" ? (await Klasses.findOne(db, { rulesetId: baseId, name: "Fighter" }))!
    : (await Items.create(db, { rulesetId: baseId, name: "Sibling item fixture" }))[0];
  const extensions: string[] = [];
  const sourceIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const extension = await createSeededTestRuleset(session.userId);
    const copy = await cowEntity(db, entityType, source.id, extension.id, extension.ancestorRulesetIds, []);
    await Properties.create(db, { entityId: copy.id, entityType, type: "SIBLING_MARKER", value: String(i) });
    // Classes have modifiers on their levels, not directly on the class.
    if (entityType !== "klasses") await Modifiers.create(db, { sourceId: copy.id, sourceType: entityType, target: "abilities.strength.misc", value: String(i + 10), valueType: "number", operator: "add" });
    if (omitLastLevel) {
      const last = (await KlassLevels.findManyByKlass(db, { klassId: copy.id })).find(level => level.level === 20)!;
      await ClassLevelsMethods.deleteClassLevel(session, extension.id, copy.id, last.id);
    }
    await Rulesets.update(db, { kind: "extension", status: "Published", private: false, userId: null }, { id: extension.id });
    extensions.push(extension.id);
    sourceIds.push(copy.id);
  }
  await RulesetsMethods.subscribeExtension(session, host.id, extensions);
  const read = () => withRulesetScope(db, host.id, async ({ rulesetData }) => {
    const id = rulesetData.canonicalize(source.id);
    return {
      properties: (rulesetData.propertiesByEntity.get(id) ?? []).filter(p => p.type === "SIBLING_MARKER").map(p => p.value).sort(),
      modifiers: (rulesetData.modifiersBySource.get(id) ?? []).filter(m => m.target === "abilities.strength.misc" && Number(m.value) >= 10).map(m => m.value).sort(),
    };
  });
  const before = await read();
  expect(before).toEqual({ properties: ["0", "1"], modifiers: entityType === "klasses" ? [] : ["10", "11"] });
  const originals = await Properties.findManyByEntityIds(db, { entityIds: sourceIds });
  const assertCopied = async () => {
    for (const cold of [false, true]) {
      if (cold) invalidateAll();
      expect(await read()).toEqual(before);
    }
    const id = await withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.canonicalize(source.id));
    expect(sourceIds).not.toContain(id);
    // Verify rows were actually copied, not merely re-merged into the read view.
    const stored = await Properties.findManyByEntity(db, { entityIds: [id], entityType });
    expect(stored.filter(p => p.type === "SIBLING_MARKER").map(p => p.value).sort()).toEqual(before.properties);
    expect(await Properties.findManyByEntityIds(db, { entityIds: sourceIds })).toEqual(originals);
  };
  return { session, host, source, assertCopied };
}

for (const entityType of ["races", "klasses", "items"] as const) {
  test(`${entityType}: ordinary edit copies all visible sibling customizations`, async () => {
    const { session, host, source, assertCopied } = await setup(entityType);
    if (entityType === "races") await RacesMethods.updateRulesetRace(session, host.id, source.id, { name: source.name, description: "edited description", size: "Medium", baseSpeed: 30 });
    else if (entityType === "klasses") await ClassesMethods.updateRulesetKlass(session, host.id, source.id, { name: source.name, description: "edited description" });
    else await ItemsMethods.updateRulesetItem(session, host.id, source.id, { name: source.name, description: "edited description" });
    await assertCopied();
  });
}

for (const action of ["add skill", "remove skill", "create level", "update level", "delete level"] as const) {
  test(`${action} copies the inherited class with its sibling customizations`, async () => {
    const { session, host, source, assertCopied } = await setup("klasses", action === "create level");
    const { assignedSkill, otherSkill, levelId } = await withRulesetScope(db, host.id, async ({ rulesetData }) => {
      const id = rulesetData.canonicalize(source.id);
      const assigned = rulesetData.klassSkillsByKlassId.get(id)!;
      return {
        assignedSkill: assigned[0].skillId,
        otherSkill: rulesetData.skills.find(skill => !assigned.some(row => row.skillId === skill.id))!.id,
        levelId: [...rulesetData.klassLevelsById.values()].find(level => level.klassId === id && level.level === 1)!.id,
      };
    });
    if (action === "add skill") await ClassSkillsMethods.addClassSkill(session, host.id, source.id, otherSkill);
    else if (action === "remove skill") await ClassSkillsMethods.removeClassSkill(session, host.id, source.id, assignedSkill);
    else if (action === "create level") await ClassLevelsMethods.createClassLevel(session, host.id, source.id, { level: 20, bab: 20, skills: 2 });
    else if (action === "update level") await ClassLevelsMethods.updateClassLevel(session, host.id, source.id, levelId, { skills: 3 });
    else await ClassLevelsMethods.deleteClassLevel(session, host.id, source.id, levelId);
    await assertCopied();
  });
}
