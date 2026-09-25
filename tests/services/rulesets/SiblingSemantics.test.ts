import { afterEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Abilities, Aptitudes, Feats, FeatsAptitudes, Requirements, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { AptitudesMethods } from "@/server/services/rulesets/AptitudesService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import Dnd35TargetPaths from "@/server/rulesets/dnd3.5/TargetPaths.ts";
import type { Requirement } from "@/shared/relations.ts";

afterEach(invalidateAll);

async function setup(configure: (extensionId: string, baseId: string, index: number) => Promise<void>, reverseOrder = false) {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const host = await createSeededTestRuleset(session.userId);
  const extensionIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const extension = await createSeededTestRuleset(session.userId);
    await configure(extension.id, host.ancestorRulesetIds[0], i);
    await Rulesets.update(db, { kind: "extension", status: "Published", private: false, userId: null }, { id: extension.id });
    extensionIds.push(extension.id);
  }
  await RulesetsMethods.subscribeExtension(session, host.id, reverseOrder ? [...extensionIds].reverse() : extensionIds);
  return { session, host };
}

test("editing a shared aptitude preserves references from both extensions", async () => {
  const aptitudeIds: string[] = [];
  const featIds: string[] = [];
  const { session, host } = await setup(async (rulesetId, _baseId, index) => {
    const [aptitude] = await Aptitudes.create(db, { rulesetId, name: "Audit Shared Pool" });
    const [feat] = await Feats.create(db, { rulesetId, name: `Audit Pool Feat ${index}` });
    await FeatsAptitudes.create(db, { featId: feat.id, aptitudeId: aptitude.id });
    aptitudeIds.push(aptitude.id);
    featIds.push(feat.id);
  });
  const read = () => withRulesetScope(db, host.id, async ({ rulesetData }) => ({
    resolved: aptitudeIds.map(id => rulesetData.aptitudesById.get(id)?.id),
    links: featIds.map(id => rulesetData.featsById.get(id)!.featsAptitudesInRules[0].aptitudeId),
  }));
  expect(await read()).toEqual({ resolved: [aptitudeIds[0], aptitudeIds[0]], links: [aptitudeIds[0], aptitudeIds[0]] });
  const local = await AptitudesMethods.updateRulesetAptitude(session, host.id, aptitudeIds[0], { name: "Audit Local Pool" });
  const warm = await read();
  invalidateAll();
  const cold = await read();
  expect({ warm, cold }).toEqual({
    warm: { resolved: [local.id, local.id], links: [local.id, local.id] },
    cold: { resolved: [local.id, local.id], links: [local.id, local.id] },
  });
  await AptitudesMethods.updateRulesetAptitude(session, host.id, local.id, { name: "Renamed Local Pool" });
  expect(await read()).toEqual({ resolved: [local.id, local.id], links: [local.id, local.id] });
  for (const id of aptitudeIds) expect((await Aptitudes.findOne(db, { id }))?.name).toBe("Audit Shared Pool");
  await RulesetsMethods.revertOverride(session, host.id, "aptitudes", aptitudeIds[0]);
  expect(await read()).toEqual({ resolved: [aptitudeIds[0], aptitudeIds[0]], links: [aptitudeIds[0], aptitudeIds[0]] });
});

for (const [chainingOperator, reverseOrder] of [["or", false], ["and", false], ["or", true]] as const) {
  test(`merging A with (${chainingOperator === "or" ? "A OR B" : "A AND B"}) preserves eligibility before and after COW (reverse=${reverseOrder})`, async () => {
    const copies: string[] = [];
    const { session, host } = await setup(async (rulesetId, baseId, index) => {
      const source = (await Feats.findOne(db, { rulesetId: baseId, name: "Toughness" }))!;
      const copy = await cowEntity(db, "feats", source.id, rulesetId, [baseId], []);
      copies.push(copy.id);
      const owner = { entityId: copy.id, entityType: "feats" };
      const conditionA = { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "13", valueType: "number" };
      if (index === 0) await Requirements.create(db, { ...owner, ...conditionA, level: "1" });
      else await Requirements.createMany(db, [
        { ...owner, level: "1", chainingOperator },
        { ...owner, ...conditionA, level: "1.1" },
        { ...owner, ...conditionA, target: "abilities.dexterity.total", value: "15", level: "1.2" },
      ]);
    }, reverseOrder);
    const abilities = new DetailedCharacterAbilities();
    const rows = await Abilities.findAll(pagination => Abilities.findManyByRulesetId(db, { rulesetId: host.ancestorRulesetIds[0], ancestorRulesetIds: [] }, pagination));
    abilities.initialize(rows.map(row => ({ abilityId: row.id, name: row.name, score: row.name === "Strength" ? 13 : 10 })), []);
    const evaluate = (groups: Requirement[][]) => {
      const engine = new DetailedCharacterRequirements(new Dnd35TargetPaths());
      engine.evaluateRequirements({ abilities }, groups);
      const result = engine.getRequirements();
      expect(result.invalidRequirements).toHaveLength(0);
      return result.unmetRequirementGroups.length === 0;
    };
    const originals = await Promise.all(copies.map(entityId => Requirements.findManyByEntity(db, { entityIds: [entityId], entityType: "feats" })));
    const expected = evaluate(originals);
    expect(expected).toBe(chainingOperator === "or");
    const read = () => withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.requirementsByEntity.get(copies[0]) ?? []);
    const before = evaluate([await read()]);
    await PropertiesMethods.createEntityProperty(session, host.id, "feats", copies[0], { type: "AUDIT", value: "1" });
    const after = evaluate([await read()]);
    invalidateAll();
    const cold = evaluate([await read()]);
    expect({ before, after, cold }).toEqual({ before: expected, after: expected, cold: expected });
    expect(await Promise.all(copies.map(entityId => Requirements.findManyByEntity(db, { entityIds: [entityId], entityType: "feats" })))).toEqual(originals);
  });
}
