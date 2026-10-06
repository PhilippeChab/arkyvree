import { describe, expect, test } from "bun:test";

import { addClassLevels } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Aptitudes,
  CharacterLevelFeats,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Modifiers,
  Properties,
  Requirements,
  Rulesets,
  Skills,
} from "@/server/repositories/index.ts";
import { Dnd35SkillsHooks } from "@/server/rulesets/dnd3.5/hooks/SkillsHooks.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import { WEAPON_TYPE } from "@/shared/dnd3.5/properties/index.ts";
import { measure } from "@/tests/support/database.ts";
import { createSeedCharacter } from "@/tests/support/levelFixtures.ts";
import {
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  createTestRuleset,
  createTestUserAndRuleset,
} from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

function skill(abilityId: string, name: string, fields: Record<string, unknown> = {}) {
  return {
    name,
    description: "",
    primaryAbilityId: abilityId,
    impactedByWeight: true,
    checkPenaltyMultiplier: 1,
    usableWithoutTraining: true,
    ...fields,
  };
}

function spell(aptitudeId: string, name: string, school?: string, fields: Record<string, unknown> = {}) {
  return {
    name,
    description: "",
    aptitudes: [{ id: aptitudeId }],
    school,
    ...fields,
  };
}

async function findFeat(rulesetId: string, name: string) {
  return (await Feats.findOne(db, { rulesetId, name }))!;
}

/** A ruleset of its own with Strength, a spell list and, unless left out, the General aptitude generated feats go in. */
async function bareRuleset({ general = true } = {}) {
  const { session, ruleset } = await createTestUserAndRuleset();
  const [strength] = await Abilities.create(db, { name: "Strength", description: "", rulesetId: ruleset.id });
  const [spells] = await Aptitudes.create(db, { name: "Wizard Spells", description: "", rulesetId: ruleset.id });
  const [generalAptitude] = general
    ? await Aptitudes.create(db, { name: "General", description: "", rulesetId: ruleset.id })
    : [];
  return { session, ruleset, strength, spells, general: generalAptitude };
}

/** The names of the ruleset's feats, or of those matching `search`. */
async function featNames(rulesetId: string, search?: string) {
  const { items } = await FeatsService.getFeats(rulesetId, { search }, { limit: 100, page: 1 });
  return items
    .map((feat) => feat.name)
    .filter((name) => !search || name === search)
    .sort();
}

async function forkWithExtensions() {
  const session = makeSession();
  return { session, fork: await createSeededTestRulesetWithExtensions(session.userId) };
}

async function seededFork() {
  const session = makeSession();
  return { session, fork: await createSeededTestRuleset(session.userId) };
}

/** The seed user's fork of the seeded ruleset, and its inherited Climb. */
async function seededForkWithClimb() {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const climb = (await Skills.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Climb" }))!;
  const climbBody = {
    name: "Climb",
    primaryAbilityId: climb.primaryAbilityId,
    impactedByWeight: true,
    checkPenaltyMultiplier: 1,
    usableWithoutTraining: true,
  };
  return { session, fork, climb, climbBody, feat: await findFeat(climb.rulesetId, "Skill Focus: Climb") };
}

/** A spell's generated properties, read through the service. */
async function spellFields(rulesetId: string, powerId: string) {
  return (await PowersService.getPower(rulesetId, powerId)).properties.map((p) => `${p.type}: ${p.value}`).sort();
}

describe("Spell Focus", () => {
  test.each([
    [
      "every field, several descriptors and components",
      "Evocation",
      {
        subschool: "Creation",
        descriptors: ["Fire", "Light"],
        castingTime: "1 standard action",
        rangeType: "Long",
        target: "One creature",
        areaOfEffect: "20-ft. radius",
        duration: "Instantaneous",
        spellResistance: "Yes",
        components: ["Verbal", "Somatic", "Material"],
      },
      [
        "SPELL_AREA_OF_EFFECT: 20-ft. radius",
        "SPELL_CASTING_TIME: 1 standard action",
        "SPELL_COMPONENT: Material",
        "SPELL_COMPONENT: Somatic",
        "SPELL_COMPONENT: Verbal",
        "SPELL_DESCRIPTOR: Fire",
        "SPELL_DESCRIPTOR: Light",
        "SPELL_DURATION: Instantaneous",
        "SPELL_RANGE_TYPE: Long",
        "SPELL_RESISTANCE: Yes",
        "SPELL_SCHOOL: Evocation",
        "SPELL_SUBSCHOOL: Creation",
        "SPELL_TARGET: One creature",
      ],
    ],
    ["a school alone", "Conjuration", {}, ["SPELL_SCHOOL: Conjuration"]],
    ["no school", undefined, {}, []],
  ])("a spell with %s stores its fields and gets its school's feats", async (_, school, fields, expected) => {
    const { session, ruleset, spells } = await bareRuleset();
    const power = await PowersService.createPower(session, ruleset.id, spell(spells.id, "Fireball", school, fields));
    expect(await spellFields(ruleset.id, power.id)).toEqual(expected);
    expect(await featNames(ruleset.id)).toEqual(
      school ? [`Greater Spell Focus: ${school}`, `Spell Focus: ${school}`] : [],
    );
  });

  test("adds 1 to its school's DCs, and Greater Spell Focus requires it", async () => {
    const { session, ruleset, spells } = await bareRuleset();
    await PowersService.createPower(session, ruleset.id, spell(spells.id, "Fireball", "Evocation"));
    const [focus, greater] = [
      await findFeat(ruleset.id, "Spell Focus: Evocation"),
      await findFeat(ruleset.id, "Greater Spell Focus: Evocation"),
    ];
    expect(await Modifiers.findMany(db, { sourceIds: [focus.id], sourceType: "feats" })).toMatchObject([
      { target: "powers.groups.evocation.*.dc.misc", operator: "add", value: "1" },
    ]);
    expect(await Requirements.findMany(db, { entityIds: [greater.id], entityType: "feats" })).toMatchObject([
      { target: "feats.spellfocusevocation.possessed", operator: "equal", value: "true" },
    ]);
  });

  test("regenerates a spell's fields when it changes, a new school getting its feats next to the old one's", async () => {
    const { session, ruleset, spells } = await bareRuleset();
    const power = await PowersService.createPower(
      session,
      ruleset.id,
      spell(spells.id, "Evolving Spell", "Evocation", { castingTime: "1 standard action" }),
    );
    await PowersService.updatePower(
      session,
      ruleset.id,
      power.id,
      spell(spells.id, "Evolving Spell", "Conjuration", { castingTime: "1 full round" }),
    );

    expect(await spellFields(ruleset.id, power.id)).toEqual([
      "SPELL_CASTING_TIME: 1 full round",
      "SPELL_SCHOOL: Conjuration",
    ]);
    expect(await featNames(ruleset.id)).toEqual([
      "Greater Spell Focus: Conjuration",
      "Greater Spell Focus: Evocation",
      "Spell Focus: Conjuration",
      "Spell Focus: Evocation",
    ]);
  });

  test("feats outlive their school's spells, once each, and serve the school's next spell", async () => {
    const { session, ruleset, spells } = await bareRuleset();
    for (const name of ["Fireball", "Lightning Bolt"]) {
      const power = await PowersService.createPower(session, ruleset.id, spell(spells.id, name, "Evocation"));
      await PowersService.deletePower(session, ruleset.id, power.id);
    }
    await PowersService.createPower(session, ruleset.id, spell(spells.id, "Magic Missile", "Evocation"));
    expect(await featNames(ruleset.id)).toEqual(["Greater Spell Focus: Evocation", "Spell Focus: Evocation"]);
  });
});

describe("Skill Focus", () => {
  test("a new skill gets one in General, adding 3 to the skill", async () => {
    const { session, ruleset, strength, general } = await bareRuleset();
    await SkillsService.createSkill(session, ruleset.id, skill(strength.id, "Knowledge (Arcana)"));
    const feat = await findFeat(ruleset.id, "Skill Focus: Knowledge (Arcana)");

    expect(feat.description).toBe("You get a +3 bonus on all Knowledge (Arcana) checks.");
    expect(await FeatsAptitudes.findMany(db, { featId: feat.id })).toMatchObject([{ aptitudeId: general!.id }]);
    expect(await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" })).toMatchObject([
      { target: "skills.knowledgearcana.misc", operator: "add", value: "3", valueType: "number" },
    ]);
  });

  test("a ruleset without a General aptitude gets none", async () => {
    const { session, ruleset, strength } = await bareRuleset({ general: false });
    await SkillsService.createSkill(session, ruleset.id, skill(strength.id, "Climb"));
    expect(await featNames(ruleset.id)).toEqual([]);
  });

  test("follows its skill's name, and goes with it", async () => {
    const { session, ruleset, strength } = await bareRuleset();
    const climb = await SkillsService.createSkill(session, ruleset.id, skill(strength.id, "Climb"));
    const feat = await findFeat(ruleset.id, "Skill Focus: Climb");
    await SkillsService.updateSkill(
      session,
      ruleset.id,
      climb.id,
      skill(strength.id, "Climb", { description: "Updated description" }),
    );
    expect((await findFeat(ruleset.id, "Skill Focus: Climb")).id).toBe(feat.id);

    await SkillsService.updateSkill(session, ruleset.id, climb.id, skill(strength.id, "Athletics"));
    expect(await featNames(ruleset.id)).toEqual(["Skill Focus: Athletics"]);
    const renamed = await findFeat(ruleset.id, "Skill Focus: Athletics");
    expect(await Modifiers.findMany(db, { sourceIds: [renamed.id], sourceType: "feats" })).toMatchObject([
      { target: "skills.athletics.misc" },
    ]);

    await SkillsService.deleteSkill(session, ruleset.id, climb.id);
    expect(await featNames(ruleset.id)).toEqual([]);
    // A deleted feat is gone for good, so its name is free again.
    await SkillsService.createSkill(session, ruleset.id, skill(strength.id, "Athletics"));
    expect(await featNames(ruleset.id)).toEqual(["Skill Focus: Athletics"]);
  });
});

test("a fork's new skills and spells put their feats in the General aptitude it inherits", async () => {
  const parent = await bareRuleset();
  await Rulesets.update(db, { status: "Published" }, { id: parent.ruleset.id });
  const { user, session } = await createTestUser();
  const fork = await createTestRuleset(user.id, {
    rulesetId: parent.ruleset.id,
    ancestorRulesetIds: [parent.ruleset.id],
  });

  await SkillsService.createSkill(session, fork.id, skill(parent.strength.id, "Swim"));
  await PowersService.createPower(session, fork.id, spell(parent.spells.id, "Lightning Bolt", "Evocation"));
  for (const name of ["Skill Focus: Swim", "Spell Focus: Evocation", "Greater Spell Focus: Evocation"]) {
    const feat = await findFeat(fork.id, name);
    expect(feat.generated).toBe(true);
    expect(await FeatsAptitudes.findMany(db, { featId: feat.id })).toMatchObject([{ aptitudeId: parent.general!.id }]);
  }
});

describe("an inherited skill's Skill Focus", () => {
  test.each(["rename", "delete"] as const)(
    "is hidden from the fork when it'd %s the skill, the ancestor's rows untouched",
    async (operation) => {
      const { session, fork, climb, climbBody, feat } = await seededForkWithClimb();
      const modifiers = await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" });
      if (operation === "rename")
        await SkillsService.updateSkill(session, fork.id, climb.id, { ...climbBody, name: "Mountaineering" });
      else await SkillsService.deleteSkill(session, fork.id, climb.id);

      expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
      expect(await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" })).toEqual(modifiers);
      expect(await Skills.findOne(db, { id: climb.id })).toEqual(climb);
      expect(await featNames(fork.id, "Skill Focus: Climb")).toEqual([]);
      expect(await featNames(fork.id, "Skill Focus: Mountaineering")).toEqual(
        operation === "rename" ? ["Skill Focus: Mountaineering"] : [],
      );
      await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
        expect(rulesetData.feats.some((f) => f.name === "Skill Focus: Climb")).toBe(false),
      );

      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id });
      const available = await CharacterLevelsService.getAvailableFeats(
        session,
        characterId,
        ctx.aptMap.General,
        ctx.klassMap.pc.Fighter,
        1,
        { search: "Skill Focus: Climb" },
        { limit: 100, page: 1 },
      );
      expect(available.items.some((f) => f.name === "Skill Focus: Climb")).toBe(false);
      // Another fork still has it.
      expect(await featNames((await createSeededTestRuleset(session.userId)).id, "Skill Focus: Climb")).toEqual([
        "Skill Focus: Climb",
      ]);
    },
  );

  test.each([
    ["delete", "inherited"],
    ["rename", "inherited"],
    ["delete", "copied into the fork"],
    ["rename", "copied into the fork"],
  ] as const)("keeps the skill from being %sd while a character picked it, %s", async (operation, picked) => {
    const { session, fork, climb, climbBody, feat } = await seededForkWithClimb();
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id });
    const [levelId] = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
    // A pick stays under the ancestor's id after the fork copies the feat.
    await CharacterLevelFeats.createMany(db, [
      { characterLevelId: levelId, aptitudeId: ctx.aptMap.General, featId: feat.id },
    ]);
    const copy =
      picked === "inherited" ? undefined : await cowEntity(db, "feats", feat.id, fork.id, fork.ancestorRulesetIds, []);

    const mutation =
      operation === "delete"
        ? SkillsService.deleteSkill(session, fork.id, climb.id)
        : SkillsService.updateSkill(session, fork.id, climb.id, { ...climbBody, name: "Mountaineering" });
    await expect(mutation).rejects.toThrow("Skill Focus feat in use");
    expect(await Feats.findOne(db, { id: copy?.id ?? feat.id })).toBeDefined();
    expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
  });

  test.each(["delete and recreate", "rename and rename back"] as const)(
    "stays single after the fork's skill is %sd, and deleting the skill removes it",
    async (mode) => {
      const { session, fork, climb, climbBody, feat } = await seededForkWithClimb();
      const restored =
        mode === "delete and recreate"
          ? (await SkillsService.deleteSkill(session, fork.id, climb.id),
            await SkillsService.createSkill(session, fork.id, climbBody))
          : await SkillsService.updateSkill(
              session,
              fork.id,
              (
                await SkillsService.updateSkill(session, fork.id, climb.id, {
                  ...climbBody,
                  name: "Mountaineering",
                })
              ).id,
              climbBody,
            );
      expect(await featNames(fork.id, "Skill Focus: Climb")).toEqual(["Skill Focus: Climb"]);

      await SkillsService.deleteSkill(session, fork.id, restored.id);
      expect(await featNames(fork.id, "Skill Focus: Climb")).toEqual([]);
      expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
    },
  );

  test("is cleaned up from the rules the caller loaded, without another lookup", async () => {
    const { fork } = await seededForkWithClimb();
    await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
      const { timing } = await measure(() =>
        new Dnd35SkillsHooks().deleteSkillFeat(db, fork.id, rulesetData, "No generated feat"),
      );
      expect(timing).toMatchObject({ queryCount: 0, cacheHits: 0, cacheMisses: 0 });
    });
  });
});

describe("generated feats", () => {
  test.each([
    "Skill Focus",
    "Spell Focus",
    "Greater Spell Focus",
    "Weapon Focus",
    "Improved Critical",
    "Simple Weapon Proficiency",
    "Martial Weapon Proficiency",
    "Rapid Reload",
    "Favored Enemy",
    "Favored Enemy Specialization",
    "War Domain Weapon",
    // The extensions' families
    "Power Critical",
    "Deity's Weapon Focus",
    "Arcane Defense",
  ])("keep their %s names, inherited or copied into the fork", async (family) => {
    const { session, fork } = await forkWithExtensions();
    const feat = await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
      rulesetData.feats.find((row) => row.name.startsWith(`${family}: `))!,
    );
    await expect(
      FeatsService.updateFeat(session, fork.id, feat.id, { name: "Renamed generated feat" }),
    ).rejects.toThrow("Generated feats cannot be renamed");
    expect(await EntitySnapshots.findOne(db, { rulesetId: fork.id, sourceEntityId: feat.id })).toBeUndefined();

    const local = await FeatsService.updateFeat(session, fork.id, feat.id, {
      name: feat.name,
      description: "Customized description",
    });
    expect(local.description).toBe("Customized description");
    await expect(FeatsService.updateFeat(session, fork.id, local.id, { name: "Another name" })).rejects.toThrow(
      "Generated feats cannot be renamed",
    );
    expect(await Feats.findOne(db, { id: feat.id })).toMatchObject({ name: feat.name, description: feat.description });
  });

  test("keep their names when the fork generated them; other feats can be renamed", async () => {
    const { session, fork } = await seededFork();
    const climb = (await Skills.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Climb" }))!;
    await SkillsService.createSkill(
      session,
      fork.id,
      skill(climb.primaryAbilityId, "New Skill", { impactedByWeight: false }),
    );
    const generated = await findFeat(fork.id, "Skill Focus: New Skill");
    await expect(FeatsService.updateFeat(session, fork.id, generated.id, { name: "Specialist" })).rejects.toThrow(
      "Generated feats cannot be renamed",
    );

    const toughness = await findFeat(climb.rulesetId, "Toughness");
    expect(await FeatsService.updateFeat(session, fork.id, toughness.id, { name: "Resilience" })).toMatchObject({
      name: "Resilience",
    });
  });

  test("include a feat made in place of one the fork deleted, which stands in for it", async () => {
    const { session, fork } = await seededFork();
    const longsword = await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
      rulesetData.feats.find((row) => row.name === "Weapon Focus: Longsword")!,
    );
    await FeatsService.deleteFeat(session, fork.id, longsword.id);
    const made = await FeatsService.createFeat(session, fork.id, {
      name: "Weapon Focus: Longsword",
      aptitudeIds: [(await getSeedCtx()).aptMap["General"]],
    });
    expect(made.generated).toBe(true);
  });

  test("are the generators' feats, not those named like them", async () => {
    const { session, fork } = await forkWithExtensions();
    const own = await FeatsService.createFeat(session, fork.id, {
      name: "Weapon Focus: Homebrew",
      aptitudeIds: [(await getSeedCtx()).aptMap["General"]],
    });
    expect(await FeatsService.updateFeat(session, fork.id, own.id, { name: "Homebrew Focus" })).toMatchObject({
      name: "Homebrew Focus",
    });
    // A class feature's option, written on its own
    const option = await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
      rulesetData.feats.find((row) => row.name.startsWith("Terrain Mastery: "))!,
    );
    expect(await FeatsService.updateFeat(session, fork.id, option.id, { name: "Desert Mastery" })).toMatchObject({
      name: "Desert Mastery",
    });
  });

  test("follow a skill renamed again and again, one at a time, dropping the customizations of a local copy", async () => {
    const { session, fork } = await seededFork();
    const climb = (await Skills.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Climb" }))!;
    const feat = await findFeat(climb.rulesetId, "Skill Focus: Climb");
    const local = await FeatsService.updateFeat(session, fork.id, feat.id, {
      name: feat.name,
      description: "Local customization",
    });
    const [modifier] = await Modifiers.findMany(db, { sourceIds: [local.id], sourceType: "feats" });
    for (const [entityId, entityType] of [
      [local.id, "feats"],
      [modifier.id, "modifiers"],
    ]) {
      await Requirements.create(db, {
        entityId,
        entityType,
        level: "1",
        target: "identity.meta.level",
        operator: "greater_than_or_equal",
        value: "1",
        valueType: "number",
      });
    }
    await Properties.create(db, { entityId: local.id, entityType: "feats", type: "NOTE", value: "Remove with feat" });

    const names = ["Mountaineering", "Scaling", "Climb"];
    for (const name of names) {
      await SkillsService.updateSkill(session, fork.id, climb.id, skill(climb.primaryAbilityId, name));
      await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
        const visible = rulesetData.feats.filter((f) => names.some((label) => f.name === `Skill Focus: ${label}`));
        expect(
          visible.map((f) => [f.name, (rulesetData.modifiersBySource.get(f.id) ?? []).map((m) => m.target)]),
        ).toEqual([[`Skill Focus: ${name}`, [`skills.${name.toLowerCase()}.misc`]]]);
      });
    }
    expect(await Feats.findOne(db, { id: local.id })).toBeUndefined();
    expect(await Modifiers.findMany(db, { sourceIds: [local.id], sourceType: "feats" })).toEqual([]);
    expect(await Requirements.findMany(db, { entityIds: [local.id, modifier.id] })).toEqual([]);
    expect(await Properties.findMany(db, { entityIds: [local.id], entityType: "feats" })).toEqual([]);
    expect(await Feats.findOne(db, { id: feat.id })).toEqual(feat);
  });

  test("of a weapon type outlive its last item", async () => {
    const { session, fork } = await seededFork();
    const weapon = await ItemsService.createItem(session, fork.id, { name: "Unique Weapon", type: "Weapon" });
    await PropertiesService.createProperty(session, fork.id, "items", weapon.id, {
      type: WEAPON_TYPE,
      value: "Unique Weapon",
    });
    const [feat] = await Feats.create(db, {
      rulesetId: fork.id,
      name: "Weapon Focus: Unique Weapon",
      description: "Group content",
    });
    await ItemsService.deleteItem(session, fork.id, weapon.id);
    expect(await Feats.findOne(db, { id: feat.id })).toMatchObject({ name: feat.name, description: feat.description });
  });
});
