import { beforeEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { invalidateAll } from "@/server/cache/index.ts";
import { EntitySnapshots, Feats, Modifiers, Properties, Requirements, Sessions, Skills } from "@/server/repositories/index.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { SkillsMethods } from "@/server/services/rulesets/SkillsService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { stripSeparators } from "@/shared/utils.ts";

beforeEach(() => invalidateAll());

async function setup() {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  return { session, fork };
}

for (const family of ["Skill Focus", "Spell Focus", "Greater Spell Focus", "Weapon Focus", "Improved Critical", "Martial Weapon Proficiency", "Rapid Reload", "Favored Enemy"]) {
  test(`${family} names are protected on inherited and locally customized feats`, async () => {
    const { session, fork } = await setup();
    const feat = await withRulesetScope(db, fork.id, async ({ rulesetData }) => rulesetData.feats.find(row => row.name.startsWith(`${family}: `))!);
    expect(feat).toBeDefined();
    await expect(FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: "Renamed generated feat" })).rejects.toThrow("Generated feats cannot be renamed");
    expect(await EntitySnapshots.findBySourceAndRuleset(db, { rulesetId: fork.id, sourceEntityId: feat.id })).toBeUndefined();
    const local = await FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: feat.name, description: "Customized description" });
    expect(local.description).toBe("Customized description");
    await expect(FeatsMethods.updateRulesetFeat(session, fork.id, local.id, { name: "Another name" })).rejects.toThrow("Generated feats cannot be renamed");
    expect((await Feats.findOne(db, { id: feat.id }))?.description).toBe(feat.description);
  });
}

test("a runtime-generated local Skill Focus cannot be renamed; ordinary feats still can", async () => {
  const { session, fork } = await setup();
  const climb = (await Skills.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Climb" }))!;
  await SkillsMethods.createRulesetSkill(session, fork.id, { name: "New Skill", primaryAbilityId: climb.primaryAbilityId, impactedByWeight: false, usableWithoutTraining: true });
  const generated = (await Feats.findOne(db, { rulesetId: fork.id, name: "Skill Focus: New Skill" }))!;
  await expect(FeatsMethods.updateRulesetFeat(session, fork.id, generated.id, { name: "Specialist" })).rejects.toThrow("Generated feats cannot be renamed");
  const ordinary = (await Feats.findOne(db, { rulesetId: climb.rulesetId, name: "Toughness" }))!;
  const renamed = await FeatsMethods.updateRulesetFeat(session, fork.id, ordinary.id, { name: "Resilience" });
  expect(renamed.name).toBe("Resilience");
});

test("skill renaming cascades old customizations and recreates one feat through repeated renames", async () => {
  const { session, fork } = await setup();
  const skill = (await Skills.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Climb" }))!;
  const originalFeat = (await Feats.findOne(db, { rulesetId: skill.rulesetId, name: "Skill Focus: Climb" }))!;
  const local = await FeatsMethods.updateRulesetFeat(session, fork.id, originalFeat.id, { name: originalFeat.name, description: "Local customization" });
  const [modifier] = await Modifiers.findManyBySource(db, { sourceIds: [local.id], sourceType: "feats" });
  for (const [entityId, entityType] of [[local.id, "feats"], [modifier.id, "modifiers"]]) {
    await Requirements.create(db, { entityId, entityType, level: "1", target: "identity.meta.level", operator: "greater_than_or_equal", value: "1", valueType: "number" });
  }
  await Properties.create(db, { entityId: local.id, entityType: "feats", type: "NOTE", value: "Remove with feat" });
  const names = ["Mountaineering", "Scaling", "Climb"];
  for (const name of names) {
    await SkillsMethods.updateRulesetSkill(session, fork.id, skill.id, { name, primaryAbilityId: skill.primaryAbilityId, impactedByWeight: true, usableWithoutTraining: true });
    await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
      const visible = rulesetData.feats.filter(feat => [...names, "Climb"].some(label => feat.name === `Skill Focus: ${label}`));
      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe(`Skill Focus: ${name}`);
      expect((rulesetData.modifiersBySource.get(visible[0].id) ?? []).map(row => row.target)).toEqual([`skills.${stripSeparators(name)}.misc`]);
    });
  }
  expect(await Feats.findOne(db, { id: local.id })).toBeUndefined();
  expect(await Modifiers.findManyBySource(db, { sourceIds: [local.id], sourceType: "feats" })).toHaveLength(0);
  expect(await Requirements.findManyByEntityIds(db, { entityIds: [local.id, modifier.id] })).toHaveLength(0);
  expect(await Properties.findManyByEntity(db, { entityIds: [local.id], entityType: "feats" })).toHaveLength(0);
  expect(await Feats.findOne(db, { id: originalFeat.id })).toEqual(originalFeat);
});

test("removing the last item of a weapon type leaves its weapon feats intact", async () => {
  const { session, fork } = await setup();
  const weapon = await ItemsMethods.createRulesetItem(session, fork.id, { name: "Unique Weapon", type: "Weapon" });
  await PropertiesMethods.createEntityProperty(session, fork.id, "items", weapon.id, { type: "WEAPON_TYPE", value: "Unique Weapon" });
  const [feat] = await Feats.create(db, { rulesetId: fork.id, name: "Weapon Focus: Unique Weapon", description: "Group content" });
  await ItemsMethods.deleteRulesetItem(session, fork.id, weapon.id);
  expect(await Feats.findOne(db, { id: feat.id })).toMatchObject({ name: feat.name, description: feat.description });
});
