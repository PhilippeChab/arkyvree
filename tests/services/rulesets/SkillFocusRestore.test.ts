import { beforeEach, expect, test } from "bun:test";
import { invalidateAll } from "@/server/cache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevelFeats, Feats, Modifiers, Sessions, Skills } from "@/server/repositories/index.ts";
import { addClassLevels, createCharacter, getSeedContext } from "@/database/seeds/helpers.ts";
import { SkillsMethods } from "@/server/services/rulesets/SkillsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { ModifiersMethods } from "@/server/services/rulesets/customization/ModifiersService.ts";

beforeEach(() => invalidateAll());

async function setup() {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  const skill = (await Skills.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Climb" }))!;
  const feat = (await Feats.findOne(db, { rulesetId: skill.rulesetId, name: "Skill Focus: Climb" }))!;
  return { session, fork, skill, feat };
}

async function selectFeat(rulesetId: string, featId: string) {
  const ctx = await getSeedContext(db);
  const characterId = await createCharacter(db, ctx, {
    rulesetId, name: "Skill Focus lifecycle", raceName: "Human", xp: 0,
    alignment: "True Neutral", age: 25, gender: "Male", height: "180", weight: "80", description: "", languages: [],
    abilities: Object.fromEntries(Object.keys(ctx.abilityMap).map(name => [name, 10])),
  });
  const levels = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
  await CharacterLevelFeats.create(db, { characterLevelId: levels[0], aptitudeId: ctx.aptMap.General, featId });
}

for (const action of ["rename", "delete"] as const) {
  test(`restoring a skill after ${action} leaves its feat hidden until explicitly restored`, async () => {
    const { session, fork, skill, feat } = await setup();
    if (action === "rename") await SkillsMethods.updateRulesetSkill(session, fork.id, skill.id, {
      name: "Mountaineering", primaryAbilityId: skill.primaryAbilityId, impactedByWeight: true, usableWithoutTraining: true,
    });
    else await SkillsMethods.deleteRulesetSkill(session, fork.id, skill.id);
    await RulesetsMethods.revertOverride(session, fork.id, "skills", skill.id);
    // Check normal invalidation first, then a cold read; neither may retain a tombstone.
    for (const cold of [false, true]) {
      if (cold) invalidateAll();
      await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
        expect(rulesetData.skillsById.get(skill.id)?.name).toBe("Climb");
        expect(rulesetData.featsById.has(feat.id)).toBe(false);
        expect(rulesetData.feats.some(row => row.name === "Skill Focus: Mountaineering")).toBe(false);
      });
    }
    expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
    await RulesetsMethods.revertOverride(session, fork.id, "feats", feat.id);
    // The restored skill must remain editable/removable on subsequent requests.
    await SkillsMethods.deleteRulesetSkill(session, fork.id, skill.id);
    await RulesetsMethods.revertOverride(session, fork.id, "skills", skill.id);
    await RulesetsMethods.revertOverride(session, fork.id, "feats", feat.id);
    const visible = await FeatsMethods.getRulesetFeats(fork.id, { search: "Skill Focus: Climb" }, { limit: 100, page: 1 });
    expect(visible.items.filter(row => row.name === "Skill Focus: Climb")).toHaveLength(1);
  });
}

for (const action of ["rename", "delete"] as const) test(`${action} cleans up a renamed inherited Skill Focus feat`, async () => {
  const { session, fork, skill, feat } = await setup();
  const renamed = await FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: "Climbing Specialist", description: "Renamed generated feat" });
  const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [renamed.id], sourceType: "feats" });
  expect(modifiers).not.toHaveLength(0);
  if (action === "rename") await SkillsMethods.updateRulesetSkill(session, fork.id, skill.id, {
    name: "Mountaineering", primaryAbilityId: skill.primaryAbilityId, impactedByWeight: true, usableWithoutTraining: true,
  });
  else await SkillsMethods.deleteRulesetSkill(session, fork.id, skill.id);
  invalidateAll();
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.skills.some(row => row.name === "Climb")).toBe(false);
    expect(rulesetData.featsById.has(renamed.id)).toBe(false);
  });
  expect(await Modifiers.findManyBySource(db, { sourceIds: [renamed.id], sourceType: "feats" })).toHaveLength(0);
  expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
});

test("renamed inherited Skill Focus still protects ancestor-ID character selections", async () => {
  const { session, fork, skill, feat } = await setup();
  await selectFeat(fork.id, feat.id);
  await FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: "Climbing Specialist" });
  await expect(SkillsMethods.deleteRulesetSkill(session, fork.id, skill.id)).rejects.toThrow("Skill Focus feat in use");
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.skillsById.get(skill.id)?.name).toBe("Climb");
    expect(rulesetData.featsById.get(feat.id)?.name).toBe("Climbing Specialist");
  });
});

test("COW ancestry identifies a renamed inherited feat after its modifier target changes", async () => {
  const { session, fork, skill, feat } = await setup();
  const renamed = await FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: "Climbing Specialist" });
  const [modifier] = await Modifiers.findManyBySource(db, { sourceIds: [renamed.id], sourceType: "feats" });
  await ModifiersMethods.updateEntityModifier(session, fork.id, "feats", renamed.id, modifier.id, {
    target: "skills.swim.misc", value: "4", operator: "add",
  });
  await SkillsMethods.deleteRulesetSkill(session, fork.id, skill.id);
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(feat.id)).toBe(false));
  expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
});

test("restore rolls back when a character selected the replacement generated feat", async () => {
  const { session, fork, skill } = await setup();
  await SkillsMethods.updateRulesetSkill(session, fork.id, skill.id, {
    name: "Mountaineering", primaryAbilityId: skill.primaryAbilityId, impactedByWeight: true, usableWithoutTraining: true,
  });
  const replacement = (await Feats.findOne(db, { rulesetId: fork.id, name: "Skill Focus: Mountaineering" }))!;
  await selectFeat(fork.id, replacement.id);
  await expect(RulesetsMethods.revertOverride(session, fork.id, "skills", skill.id)).rejects.toThrow("Skill Focus feat in use");
  invalidateAll();
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.skillsById.get(skill.id)?.name).toBe("Mountaineering");
    expect(rulesetData.featsById.has(replacement.id)).toBe(true);
  });
});

test("reverting a skill description preserves an independent feat deletion", async () => {
  const { session, fork, skill, feat } = await setup();
  await FeatsMethods.deleteRulesetFeat(session, fork.id, feat.id);
  await SkillsMethods.updateRulesetSkill(session, fork.id, skill.id, {
    name: skill.name, description: "Description only", primaryAbilityId: skill.primaryAbilityId,
    impactedByWeight: true, usableWithoutTraining: true,
  });
  await RulesetsMethods.revertOverride(session, fork.id, "skills", skill.id);
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.skillsById.get(skill.id)?.description).toBe(skill.description);
    expect(rulesetData.featsById.has(feat.id)).toBe(false);
  });
});

test("skill restore preserves a feat restored and edited separately", async () => {
  const { session, fork, skill, feat } = await setup();
  await SkillsMethods.deleteRulesetSkill(session, fork.id, skill.id);
  await RulesetsMethods.revertOverride(session, fork.id, "feats", feat.id);
  const custom = await FeatsMethods.updateRulesetFeat(session, fork.id, feat.id, { name: "Climbing Specialist", description: "Keep this" });
  await RulesetsMethods.revertOverride(session, fork.id, "skills", skill.id);
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.get(feat.id)?.id).toBe(custom.id);
    expect(rulesetData.featsById.get(feat.id)?.description).toBe("Keep this");
  });
});

test("restoring a deleted skill preserves a prior independent feat deletion", async () => {
  const { session, fork, skill, feat } = await setup();
  await FeatsMethods.deleteRulesetFeat(session, fork.id, feat.id);
  await SkillsMethods.deleteRulesetSkill(session, fork.id, skill.id);
  await RulesetsMethods.revertOverride(session, fork.id, "skills", skill.id);
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.skillsById.has(skill.id)).toBe(true);
    expect(rulesetData.featsById.has(feat.id)).toBe(false);
  });
});

test("a newly generated local feat keeps its dependency after being renamed", async () => {
  const { session, fork, skill } = await setup();
  const localSkill = await SkillsMethods.createRulesetSkill(session, fork.id, {
    name: "New Skill", primaryAbilityId: skill.primaryAbilityId, impactedByWeight: false, usableWithoutTraining: true,
  });
  const generated = (await Feats.findOne(db, { rulesetId: fork.id, name: "Skill Focus: New Skill" }))!;
  await FeatsMethods.updateRulesetFeat(session, fork.id, generated.id, { name: "Expertise" });
  await SkillsMethods.deleteRulesetSkill(session, fork.id, localSkill.id);
  expect(await Feats.findOne(db, { id: generated.id })).toBeUndefined();
});

test("repeated feat and skill renames preserve cleanup, including returning to previous names", async () => {
  const { session, fork, skill, feat } = await setup();
  let currentFeatId = feat.id;
  const names = ["Mountaineering", "Scaling", "Climb", "Mountaineering"];
  for (const [index, name] of names.entries()) {
    const renamed = await FeatsMethods.updateRulesetFeat(session, fork.id, currentFeatId, { name: `Expertise ${index}` });
    await FeatsMethods.updateRulesetFeat(session, fork.id, renamed.id, { name: `Specialist ${index}` });
    await SkillsMethods.updateRulesetSkill(session, fork.id, skill.id, {
      name, primaryAbilityId: skill.primaryAbilityId, impactedByWeight: true, usableWithoutTraining: true,
    });
    if (index % 2 === 1) invalidateAll();
    if (name === skill.name) {
      // Returning to an old source name must not undo its feat tombstone.
      await withRulesetScope(db, fork.id, async ({ rulesetData }) => expect(rulesetData.featsById.has(feat.id)).toBe(false));
      await RulesetsMethods.revertOverride(session, fork.id, "feats", feat.id);
    }
    await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
      const dependents = rulesetData.feats.filter(row => names.some(label => row.name === `Skill Focus: ${label}`));
      expect(dependents).toHaveLength(1);
      expect(dependents[0].name).toBe(`Skill Focus: ${name}`);
      expect(rulesetData.featsById.has(renamed.id)).toBe(false);
      currentFeatId = dependents[0].id;
    });
    const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [currentFeatId], sourceType: "feats" });
    expect(modifiers.map(modifier => modifier.target)).toEqual([`skills.${stripSeparators(name)}.misc`]);
  }
  await RulesetsMethods.revertOverride(session, fork.id, "skills", skill.id);
  await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.featsById.has(feat.id)).toBe(false);
    expect(rulesetData.feats.some(row => row.name === "Skill Focus: Mountaineering")).toBe(false);
  });
  expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
});
