import { describe, expect, test } from "bun:test";

import { addClassLevels } from "@/database/seeders/dnd3.5/characters/seedCharacter.ts";
import SkillFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SkillFocusFeats.ts";
import type { Aptitude, Feat, RulesetAbility, Skill } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import {
  Entities,
  EntitySnapshots,
  Joins,
  Modifiers,
  Picks,
  Requirements,
  Rulesets,
} from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createSeedCharacter } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { levelUpPlan } from "@/tests/support/dnd3.5/levelPlans.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { getStepOptions } from "@/tests/support/levels.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  createTestRuleset,
} from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { findStoredValues, writeStoredValues } from "@/tests/support/storedValues.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";
import { FEAT_FAMILY, WEAPON_TYPE } from "@/vocabulary/dnd3.5/properties/index.ts";

function skill(abilityId: string, name: string, fields: Record<string, unknown> = {}) {
  return {
    name,
    description: "",
    primaryAbilityId: abilityId,
    fields: { impactedByWeight: true, checkPenaltyMultiplier: 1, usableWithoutTraining: true, ...fields },
  };
}

function spell(aptitudeId: string, name: string, school?: string, fields: Record<string, unknown> = {}) {
  return { name, description: "", aptitudes: [{ id: aptitudeId }], fields: { school, ...fields } };
}

/** A ruleset of its own with Strength, a spell list and, unless left out, the General aptitude generated feats go in. */
async function bareRuleset({ general = true } = {}) {
  const { session, ruleset } = await createTestUserAndRuleset();
  const [strength] = await Entities.create<RulesetAbility>(db, "abilities", {
    name: "Strength",
    description: "",
    rulesetId: ruleset.id,
  });
  const [spells] = await Entities.create<Aptitude>(db, "aptitudes", {
    name: "Wizard Spells",
    description: "",
    rulesetId: ruleset.id,
  });
  const [generalAptitude] = general
    ? await Entities.create<Aptitude>(db, "aptitudes", { name: "General", description: "", rulesetId: ruleset.id })
    : [];
  return { session, ruleset, strength, spells, general: generalAptitude };
}

/** The names of the ruleset's feats, or of those matching `search`. */
async function featNames(rulesetId: string, search?: string) {
  const { items } = await EntitiesService.getEntities(rulesetId, "feats", { search }, { limit: 100, page: 1 });
  return items
    .map((feat) => feat.name)
    .filter((name) => !search || name === search)
    .sort();
}

/** What a feat is made of, ids aside: its description, its stored values, its modifiers and its requirements. */
async function featShape(featId: string) {
  const feat = (await Entities.findOne<Feat>(db, { entityType: "feats", id: featId }))!;
  const strip = <T extends object>(rows: T[]) =>
    rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !/(^id$|Id$|At$)/.test(key))));
  return {
    description: feat.description,
    generated: feat.generated,
    values: await findStoredValues("feats", featId),
    modifiers: strip(await Modifiers.findMany(db, { sourceIds: [featId], sourceType: "feats" })),
    requirements: strip(await Requirements.findMany(db, { entityIds: [featId], entityType: "feats" })),
  };
}

async function findFeat(rulesetId: string, name: string) {
  return (await Entities.findOne<Feat>(db, { entityType: "feats", rulesetId, name }))!;
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
  const climb = (await Entities.findOne<Skill>(db, {
    entityType: "skills",
    rulesetId: fork.ancestorRulesetIds[0],
    name: "Climb",
  }))!;
  const climbBody = {
    name: "Climb",
    primaryAbilityId: climb.primaryAbilityId,
    fields: { impactedByWeight: true, checkPenaltyMultiplier: 1, usableWithoutTraining: true },
  };
  return { session, fork, climb, climbBody, feat: await findFeat(climb.rulesetId, "Skill Focus: Climb") };
}

/** A spell's stored values, its fields as written: `field: value`, sorted. */
async function spellFields(spellId: string) {
  return Object.entries((await findStoredValues("spells", spellId)).fields)
    .flatMap(([field, values]) => values.map((value) => `${field}: ${value}`))
    .sort();
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
    const created = await EntitiesService.createEntity(
      session,
      ruleset.id,
      "spells",
      spell(spells.id, "Fireball", school, fields),
    );
    expect(await spellFields(created.id)).toEqual(expected);
    expect(await featNames(ruleset.id)).toEqual(
      school ? [`Greater Spell Focus: ${school}`, `Spell Focus: ${school}`] : [],
    );
  });

  test("adds 1 to its school's DCs, and Greater Spell Focus requires it", async () => {
    const { session, ruleset, spells } = await bareRuleset();
    await EntitiesService.createEntity(session, ruleset.id, "spells", spell(spells.id, "Fireball", "Evocation"));
    const [focus, greater] = [
      await findFeat(ruleset.id, "Spell Focus: Evocation"),
      await findFeat(ruleset.id, "Greater Spell Focus: Evocation"),
    ];
    expect(await Modifiers.findMany(db, { sourceIds: [focus.id], sourceType: "feats" })).toMatchObject([
      { target: "spells.groups.evocation.*.dc.misc", operator: "add", value: "1" },
    ]);
    expect(await Requirements.findMany(db, { entityIds: [greater.id], entityType: "feats" })).toMatchObject([
      { target: "feats.spellfocusevocation.possessed", operator: "equal", value: "true" },
    ]);
  });

  test("makes its school's feats as the seeded ones are", async () => {
    const { session, ruleset, spells } = await bareRuleset();
    await EntitiesService.createEntity(session, ruleset.id, "spells", spell(spells.id, "Fireball", "Evocation"));
    const { rulesetId: seededId } = await getSeedCtx();
    for (const name of ["Spell Focus: Evocation", "Greater Spell Focus: Evocation"]) {
      const [made, seeded] = [await findFeat(ruleset.id, name), await findFeat(seededId, name)];
      expect(await featShape(made.id)).toEqual(await featShape(seeded.id));
    }
  });

  test("regenerates a spell's fields when it changes, a new school getting its feats next to the old one's", async () => {
    const { session, ruleset, spells } = await bareRuleset();
    const created = await EntitiesService.createEntity(
      session,
      ruleset.id,
      "spells",
      spell(spells.id, "Evolving Spell", "Evocation", { castingTime: "1 standard action" }),
    );
    await EntitiesService.updateEntity(
      session,
      ruleset.id,
      "spells",
      created.id,
      spell(spells.id, "Evolving Spell", "Conjuration", { castingTime: "1 full round" }),
    );

    expect(await spellFields(created.id)).toEqual(["SPELL_CASTING_TIME: 1 full round", "SPELL_SCHOOL: Conjuration"]);
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
      const created = await EntitiesService.createEntity(
        session,
        ruleset.id,
        "spells",
        spell(spells.id, name, "Evocation"),
      );
      await EntitiesService.deleteEntity(session, ruleset.id, "spells", created.id);
    }
    await EntitiesService.createEntity(session, ruleset.id, "spells", spell(spells.id, "Magic Missile", "Evocation"));
    expect(await featNames(ruleset.id)).toEqual(["Greater Spell Focus: Evocation", "Spell Focus: Evocation"]);
  });
});

describe("Skill Focus", () => {
  test("a new skill gets one in General, adding 3 to the skill", async () => {
    const { session, ruleset, strength, general } = await bareRuleset();
    await EntitiesService.createEntity(session, ruleset.id, "skills", skill(strength.id, "Knowledge (Arcana)"));
    const feat = await findFeat(ruleset.id, "Skill Focus: Knowledge (Arcana)");

    expect(feat.description).toBe("You get a +3 bonus on all Knowledge (Arcana) checks.");
    expect(
      await Joins.findMany<{ aptitudeId: string; featId: string }>(db, { join: "feats_aptitudes", fromIds: [feat.id] }),
    ).toMatchObject([{ aptitudeId: general!.id }]);
    expect(await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" })).toMatchObject([
      { target: "skills.knowledgearcana.misc", operator: "add", value: "3", valueType: "number" },
    ]);
  });

  test("is the seeded one's twin: its family, its description, its modifier", async () => {
    const { session, ruleset, strength } = await bareRuleset();
    await EntitiesService.createEntity(session, ruleset.id, "skills", skill(strength.id, "Climb"));
    const { rulesetId: seededId } = await getSeedCtx();
    const [made, seeded] = [
      await findFeat(ruleset.id, "Skill Focus: Climb"),
      await findFeat(seededId, "Skill Focus: Climb"),
    ];
    expect(await featShape(made.id)).toEqual(await featShape(seeded.id));
  });

  test("isn't made again when the ruleset has a feat of its name", async () => {
    const { session, ruleset, strength } = await bareRuleset();
    await Entities.create<Feat>(db, "feats", {
      name: "Skill Focus: Climb",
      description: "Mine",
      rulesetId: ruleset.id,
    });
    await EntitiesService.createEntity(session, ruleset.id, "skills", skill(strength.id, "Climb"));
    expect(await featNames(ruleset.id)).toEqual(["Skill Focus: Climb"]);
    expect((await findFeat(ruleset.id, "Skill Focus: Climb")).description).toBe("Mine");
  });

  test("a ruleset without a General aptitude gets none", async () => {
    const { session, ruleset, strength } = await bareRuleset({ general: false });
    await EntitiesService.createEntity(session, ruleset.id, "skills", skill(strength.id, "Climb"));
    expect(await featNames(ruleset.id)).toEqual([]);
  });

  test("follows its skill's name, and goes with it", async () => {
    const { session, ruleset, strength } = await bareRuleset();
    const climb = await EntitiesService.createEntity(session, ruleset.id, "skills", skill(strength.id, "Climb"));
    const feat = await findFeat(ruleset.id, "Skill Focus: Climb");
    await EntitiesService.updateEntity(session, ruleset.id, "skills", climb.id, {
      ...skill(strength.id, "Climb"),
      description: "Updated description",
    });
    expect((await findFeat(ruleset.id, "Skill Focus: Climb")).id).toBe(feat.id);

    await EntitiesService.updateEntity(session, ruleset.id, "skills", climb.id, skill(strength.id, "Athletics"));
    expect(await featNames(ruleset.id)).toEqual(["Skill Focus: Athletics"]);
    const renamed = await findFeat(ruleset.id, "Skill Focus: Athletics");
    expect(await Modifiers.findMany(db, { sourceIds: [renamed.id], sourceType: "feats" })).toMatchObject([
      { target: "skills.athletics.misc" },
    ]);

    await EntitiesService.deleteEntity(session, ruleset.id, "skills", climb.id);
    expect(await featNames(ruleset.id)).toEqual([]);
    // A deleted feat is gone for good, so its name is free again.
    await EntitiesService.createEntity(session, ruleset.id, "skills", skill(strength.id, "Athletics"));
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

  await EntitiesService.createEntity(session, fork.id, "skills", skill(parent.strength.id, "Swim"));
  await EntitiesService.createEntity(
    session,
    fork.id,
    "spells",
    spell(parent.spells.id, "Lightning Bolt", "Evocation"),
  );
  for (const name of ["Skill Focus: Swim", "Spell Focus: Evocation", "Greater Spell Focus: Evocation"]) {
    const feat = await findFeat(fork.id, name);
    expect(feat.generated).toBe(true);
    expect(
      await Joins.findMany<{ aptitudeId: string; featId: string }>(db, { join: "feats_aptitudes", fromIds: [feat.id] }),
    ).toMatchObject([{ aptitudeId: parent.general!.id }]);
  }
});

describe("an inherited skill's Skill Focus", () => {
  test.each(["rename", "delete"] as const)(
    "is hidden from the fork when it'd %s the skill, the ancestor's rows untouched",
    async (operation) => {
      const { session, fork, climb, climbBody, feat } = await seededForkWithClimb();
      const modifiers = await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" });
      if (operation === "rename") {
        await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, {
          ...climbBody,
          name: "Mountaineering",
        });
      } else {
        await EntitiesService.deleteEntity(session, fork.id, "skills", climb.id);
      }

      expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toEqual(feat);
      expect(await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" })).toEqual(modifiers);
      expect(await Entities.findOne<Skill>(db, { entityType: "skills", id: climb.id })).toEqual(climb);
      expect(await featNames(fork.id, "Skill Focus: Climb")).toEqual([]);
      expect(await featNames(fork.id, "Skill Focus: Mountaineering")).toEqual(
        operation === "rename" ? ["Skill Focus: Mountaineering"] : [],
      );
      await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
        expect(Dnd35View.of(rulesetData).feats.some((f) => f.name === "Skill Focus: Climb")).toBe(false),
      );

      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { rulesetId: fork.id });
      // Its first fighter level's General feats, a family's one match named as its feat
      const plan = levelUpPlan([{ klassId: ctx.klassMap.pc.Fighter, level: 1, hp: 10 }]);
      const available = await getStepOptions(
        session,
        characterId,
        "feats",
        plan,
        { pool: ctx.aptMap.General },
        { search: "Skill Focus: Climb" },
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
    await Picks.createMany(db, "feats", [
      { characterLevelId: levelId, aptitudeId: ctx.aptMap.General, featId: feat.id },
    ]);
    const copy = picked === "inherited" ? undefined : await copyEntity(db, "feats", feat.id, fork);

    const mutation =
      operation === "delete"
        ? EntitiesService.deleteEntity(session, fork.id, "skills", climb.id)
        : EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { ...climbBody, name: "Mountaineering" });
    expect(mutation).rejects.toThrow("Skill Focus feat in use");
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: copy?.id ?? feat.id })).toBeDefined();
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toEqual(feat);
  });

  test.each(["delete and recreate", "rename and rename back"] as const)(
    "stays single after the fork's skill is %sd, and deleting the skill removes it",
    async (mode) => {
      const { session, fork, climb, climbBody, feat } = await seededForkWithClimb();
      const restored =
        mode === "delete and recreate"
          ? (await EntitiesService.deleteEntity(session, fork.id, "skills", climb.id),
            await EntitiesService.createEntity(session, fork.id, "skills", climbBody))
          : await EntitiesService.updateEntity(
              session,
              fork.id,
              "skills",
              (
                await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, {
                  ...climbBody,
                  name: "Mountaineering",
                })
              ).id,
              climbBody,
            );
      expect(await featNames(fork.id, "Skill Focus: Climb")).toEqual(["Skill Focus: Climb"]);

      await EntitiesService.deleteEntity(session, fork.id, "skills", restored.id);
      expect(await featNames(fork.id, "Skill Focus: Climb")).toEqual([]);
      expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toEqual(feat);
    },
  );

  test("is removed by the id the rules the caller loaded have, and left out when they have none", async () => {
    const { fork, feat } = await seededForkWithClimb();
    await withRulesetScope(db, fork.id, async (scope) => {
      const skillFocus = new SkillFocusFeats(scope);
      const inUse = "Cannot remove a Skill Focus feat in use by a character in this ruleset";
      expect(skillFocus.remove("Climb")).toEqual([{ id: feat.id, inUse, type: "feats" }]);
      expect(skillFocus.remove("No generated feat")).toEqual([]);
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
      Dnd35View.of(rulesetData).feats.find((row) => row.name.startsWith(`${family}: `))!,
    );
    expect(
      EntitiesService.updateEntity(session, fork.id, "feats", feat.id, { name: "Renamed generated feat" }),
    ).rejects.toThrow("Generated feats cannot be renamed");
    expect(await EntitySnapshots.findOne(db, { rulesetId: fork.id, sourceEntityId: feat.id })).toBeUndefined();

    const local = await EntitiesService.updateEntity(session, fork.id, "feats", feat.id, {
      name: feat.name,
      description: "Customized description",
    });
    expect(local.description).toBe("Customized description");
    expect(EntitiesService.updateEntity(session, fork.id, "feats", local.id, { name: "Another name" })).rejects.toThrow(
      "Generated feats cannot be renamed",
    );
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toMatchObject({
      name: feat.name,
      description: feat.description,
    });
  });

  test("keep their names when the fork generated them; other feats can be renamed", async () => {
    const { session, fork } = await seededFork();
    const climb = (await Entities.findOne<Skill>(db, {
      entityType: "skills",
      rulesetId: fork.ancestorRulesetIds[0],
      name: "Climb",
    }))!;
    await EntitiesService.createEntity(
      session,
      fork.id,
      "skills",
      skill(climb.primaryAbilityId, "New Skill", { impactedByWeight: false }),
    );
    const generated = await findFeat(fork.id, "Skill Focus: New Skill");
    expect(
      EntitiesService.updateEntity(session, fork.id, "feats", generated.id, { name: "Specialist" }),
    ).rejects.toThrow("Generated feats cannot be renamed");

    const toughness = await findFeat(climb.rulesetId, "Toughness");
    expect(
      await EntitiesService.updateEntity(session, fork.id, "feats", toughness.id, { name: "Resilience" }),
    ).toMatchObject({
      name: "Resilience",
    });
  });

  test("include a feat made in place of one the fork deleted, which stands in for it", async () => {
    const { session, fork } = await seededFork();
    const longsword = await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
      Dnd35View.of(rulesetData).feats.find((row) => row.name === "Weapon Focus: Longsword")!,
    );
    await EntitiesService.deleteEntity(session, fork.id, "feats", longsword.id);
    const made = await EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Weapon Focus: Longsword",
      aptitudeIds: [(await getSeedCtx()).aptMap["General"]],
    });
    expect(made.generated).toBe(true);
  });

  test("are the generators' feats, not those named like them", async () => {
    const { session, fork } = await forkWithExtensions();
    const own = await EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Weapon Focus: Homebrew",
      aptitudeIds: [(await getSeedCtx()).aptMap["General"]],
    });
    expect(
      await EntitiesService.updateEntity(session, fork.id, "feats", own.id, { name: "Homebrew Focus" }),
    ).toMatchObject({
      name: "Homebrew Focus",
    });
    // A class feature's option, written on its own
    const option = await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
      Dnd35View.of(rulesetData).feats.find((row) => row.name.startsWith("Terrain Mastery: "))!,
    );
    expect(
      await EntitiesService.updateEntity(session, fork.id, "feats", option.id, { name: "Desert Mastery" }),
    ).toMatchObject({
      name: "Desert Mastery",
    });
  });

  test("follow a skill renamed again and again, one at a time, dropping the customizations of a local copy", async () => {
    const { session, fork } = await seededFork();
    const climb = (await Entities.findOne<Skill>(db, {
      entityType: "skills",
      rulesetId: fork.ancestorRulesetIds[0],
      name: "Climb",
    }))!;
    const feat = await findFeat(climb.rulesetId, "Skill Focus: Climb");
    const local = await EntitiesService.updateEntity(session, fork.id, "feats", feat.id, {
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
    await writeStoredValues("feats", local.id, [[FEAT_FAMILY, "Remove with feat"]]);

    const names = ["Mountaineering", "Scaling", "Climb"];
    for (const name of names) {
      await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, skill(climb.primaryAbilityId, name));
      await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
        const visible = Dnd35View.of(rulesetData).feats.filter((f) =>
          names.some((label) => f.name === `Skill Focus: ${label}`),
        );
        expect(
          visible.map((f) => [f.name, (rulesetData.modifiersBySource.get(f.id) ?? []).map((m) => m.target)]),
        ).toEqual([[`Skill Focus: ${name}`, [`skills.${name.toLowerCase()}.misc`]]]);
      });
    }
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: local.id })).toBeUndefined();
    expect(await Modifiers.findMany(db, { sourceIds: [local.id], sourceType: "feats" })).toEqual([]);
    expect(await Requirements.findMany(db, { entityIds: [local.id, modifier.id] })).toEqual([]);
    expect(await findStoredValues("feats", local.id)).toEqual({ fields: {}, links: {} });
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toEqual(feat);
  });

  test("of a weapon type outlive its last item", async () => {
    const { session, fork } = await seededFork();
    const weapon = await EntitiesService.createEntity(session, fork.id, "items", {
      name: "Unique Weapon",
      type: "Weapon",
    });
    // A weapon type of its own, outside the catalog an item's fields offer
    await writeStoredValues("items", weapon.id, [[WEAPON_TYPE, "Unique Weapon"]]);
    RulesetViews.invalidate(fork.id);
    const [feat] = await Entities.create<Feat>(db, "feats", {
      rulesetId: fork.id,
      name: "Weapon Focus: Unique Weapon",
      description: "Group content",
    });
    await EntitiesService.deleteEntity(session, fork.id, "items", weapon.id);
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toMatchObject({
      name: feat.name,
      description: feat.description,
    });
  });
});
