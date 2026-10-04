import { describe, expect, test } from "bun:test";

import { eq, inArray } from "drizzle-orm";

import * as r from "@/database/packages/dnd35/content/requirements.ts";
import type { ClassSeed, ItemDef, RaceDefinition, SpellSeed } from "@/database/packages/dnd35/content/types.ts";
import { seedAptitudes } from "@/database/packages/dnd35/seed/aptitudes.ts";
import { seedBond } from "@/database/packages/dnd35/seed/bonds.ts";
import { seedClass } from "@/database/packages/dnd35/seed/classes.ts";
import type { SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { cowFeatsIntoExtension, cowSpellsIntoExtension } from "@/database/packages/dnd35/seed/cow.ts";
import { requirementRows } from "@/database/packages/dnd35/seed/customization.ts";
import { seedDomains } from "@/database/packages/dnd35/seed/domains.ts";
import { seedFeats } from "@/database/packages/dnd35/seed/feats.ts";
import { seedItems } from "@/database/packages/dnd35/seed/items.ts";
import { linkPower, seedPowers } from "@/database/packages/dnd35/seed/powers.ts";
import { seedRaces } from "@/database/packages/dnd35/seed/races.ts";
import { seedWizardSchools } from "@/database/packages/dnd35/seed/wizardSchools.ts";
import {
  entitySnapshotsInRules,
  featsAptitudesInRules,
  featsInRules,
  itemsInRules,
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelSavesInRules,
  klassSkillsInRules,
  powersAptitudesInRules,
  powersInRules,
  racesInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  FEAT_FAMILY,
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
} from "@/shared/dnd3.5/properties/index.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { customizationsOf, freshExtensionContext, freshSeedContext, namesOf } from "@/tests/seeds/freshSeed.ts";

const feats = (...names: string[]) => names.map((name) => ({ name, description: "", aptitudes: [] }));
const spell = (name: string, level: number, fields: Partial<SpellSeed> = {}): SpellSeed => ({
  name,
  description: "",
  level,
  aptitudes: [],
  properties: [],
  ...fields,
});
const race = (name: string, fields: Partial<RaceDefinition> = {}): RaceDefinition => ({
  name,
  description: "",
  size: "Medium",
  baseSpeed: 30,
  ...fields,
});
const item = (name: string, fields: Partial<ItemDef> = {}): ItemDef => ({
  name,
  description: "",
  weight: "1",
  costGp: "1",
  type: "Gear",
  properties: [],
  ...fields,
});
const klass = (name: string, fields: Partial<ClassSeed> = {}): ClassSeed => ({
  name,
  description: "",
  hd: 8,
  levels: 1,
  skillPoints: 2,
  bab: "poor",
  saves: { fortitude: "poor", reflex: "poor", will: "poor" },
  classSkills: [],
  ...fields,
});

/** The spell lists a power is in, "aptitude level" each. */
async function spellListsOf(ctx: SeedContext, powerId: string) {
  const aptitudes = namesOf(ctx.aptMap);
  return (await db.select().from(powersAptitudesInRules).where(eq(powersAptitudesInRules.powerId, powerId)))
    .map((link) => `${aptitudes[link.aptitudeId]} ${link.level}`)
    .sort();
}

async function aptitudesOfFeat(ctx: SeedContext, featId: string) {
  const aptitudes = namesOf(ctx.aptMap);
  return (await db.select().from(featsAptitudesInRules).where(eq(featsAptitudesInRules.featId, featId)))
    .map((link) => aptitudes[link.aptitudeId])
    .sort();
}

/** The class level each spell level opens at, the first at the first: 1, 3, 5… */
const SPELL_LEVELS = Object.fromEntries(Array.from({ length: 10 }, (_, level) => [level, Math.max(1, 2 * level - 1)]));

/** A spell list's slot at each spell level, as `customizationsOf` reads it, gated from the second on by `classTarget`. */
const gatedSlots = (list: string, classTarget: string) =>
  Array.from({ length: 9 }, (_, i) => {
    const gate = i === 0 ? "" : `\n  if 1 ${classTarget} greater_than_or_equal ${2 * i + 1}`;
    return [
      `aptitudes.${list}.${i + 1}.allowed set -1 number${gate}`,
      `aptitudes.${list}.${i + 1}.uses add 1 number${gate}`,
    ];
  }).flat();

describe("Seeding", () => {
  test("numbers an entity's requirements by their place in the tree", () => {
    const rows = requirementRows("feat-id", "feats", [
      r.eq(r.feat("Dodge")),
      r.or(r.gte("combat.bab", 4), r.and(r.eq(r.feat("Mobility")), r.gte("skills.tumble.ranks", 5))),
    ]);
    expect(
      rows.map((row) => `${row.entityId} ${row.entityType} ${row.level} ${row.target ?? row.chainingOperator}`),
    ).toEqual([
      "feat-id feats 1 feats.dodge.possessed",
      "feat-id feats 2 or",
      "feat-id feats 2.1 combat.bab",
      "feat-id feats 2.2 and",
      "feat-id feats 2.2.1 feats.mobility.possessed",
      "feat-id feats 2.2.2 skills.tumble.ranks",
    ]);
  });

  describe("feats", () => {
    test("seeds them with their defaults, aptitudes and customizations, a modifier's requirements its own, and names them", async () => {
      const ctx = await freshSeedContext();
      await seedAptitudes(db, ctx, ["General", "Fighter Bonus Feat"]);
      await seedFeats(db, ctx, [
        {
          name: "Test Dodge",
          description: "Dodge",
          aptitudes: ["General", "Fighter Bonus Feat"],
          requirements: [r.gte("abilities.dexterity.score", 13)],
          modifiers: [
            { target: "combat.ac.dodge", operator: "add", value: "1", valueType: "number" },
            {
              target: "combat.ac.dodge",
              operator: "add",
              value: "4",
              valueType: "number",
              requirements: [r.or(r.eq(r.feat("Mobility")), r.gte("combat.bab", 6))],
            },
          ],
          properties: [{ type: FEAT_FAMILY, value: "Dodge" }],
        },
        { name: "Test Toughness", description: "", aptitudes: [], stackable: true, selectable: false },
      ]);

      const rows = await db.select().from(featsInRules).where(eq(featsInRules.rulesetId, ctx.rulesetId));
      expect(
        rows
          .map(({ id, name, description, stackable, selectable }) => ({
            named: ctx.featMap[name] === id,
            name,
            description,
            stackable,
            selectable,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { named: true, name: "Test Dodge", description: "Dodge", stackable: false, selectable: true },
        { named: true, name: "Test Toughness", description: "", stackable: true, selectable: false },
      ]);
      expect(await aptitudesOfFeat(ctx, ctx.featMap["Test Dodge"])).toEqual(["Fighter Bonus Feat", "General"]);
      expect(await customizationsOf(ctx.featMap["Test Dodge"])).toEqual({
        requirements: ["1 abilities.dexterity.score greater_than_or_equal 13"],
        modifiers: [
          "combat.ac.dodge add 1 number",
          "combat.ac.dodge add 4 number\n  if 1 or\n  if 1.1 feats.mobility.possessed equal true\n  if 1.2 combat.bab greater_than_or_equal 6",
        ],
        properties: ["FEAT_FAMILY Dodge"],
      });
      expect(await customizationsOf(ctx.featMap["Test Toughness"])).toEqual({
        requirements: [],
        modifiers: [],
        properties: [],
      });
    });

    test("refuses an aptitude that isn't seeded", async () => {
      const ctx = await freshSeedContext();
      await expect(seedFeats(db, ctx, [{ name: "Test Feat", description: "", aptitudes: ["Nope"] }])).rejects.toThrow(
        `Test Feat's aptitude: "Nope" isn't seeded`,
      );
    });
  });

  describe("a class", () => {
    /** Each level's properties (base attack, skill points), saves, modifiers, requirements and granted feats. */
    async function levelsOf(ctx: SeedContext, levelIds: Record<number, string>) {
      const saves = namesOf(ctx.saveMap);
      const feats = namesOf(ctx.featMap);
      const aptitudes = namesOf(ctx.aptMap);
      const ids = Object.values(levelIds);
      const levelSaves = await db
        .select()
        .from(klassLevelSavesInRules)
        .where(inArray(klassLevelSavesInRules.klassLevelId, ids));
      const granted = await db
        .select()
        .from(klassLevelFeatsInRules)
        .where(inArray(klassLevelFeatsInRules.klassLevelId, ids));
      const levels = [];
      for (const [level, id] of Object.entries(levelIds)) {
        const { properties, modifiers, requirements } = await customizationsOf(id);
        levels.push({
          level: Number(level),
          properties,
          saves: Object.fromEntries(
            levelSaves.filter((s) => s.klassLevelId === id).map((s) => [saves[s.saveId], s.base]),
          ),
          modifiers,
          requirements,
          feats: granted
            .filter((g) => g.klassLevelId === id)
            .map((g) => `${feats[g.featId]} in ${aptitudes[g.aptitudeId]}${g.free ? ", free" : ""}`)
            .sort(),
        });
      }
      return levels;
    }
    /** A level's properties: its base attack and skill points. */
    const levelProperties = (bab: number, skillPoints: number) => [
      `${KLASS_LEVEL_BAB} ${bab}`,
      `${KLASS_LEVEL_SKILL_POINTS} ${skillPoints}`,
    ];

    test("seeds its levels: base attack, saves, skill points, spell slots, picks, modifiers, granted feats and what it takes to reach each", async () => {
      const ctx = await freshSeedContext({ named: true });
      await seedAptitudes(db, ctx, ["Test Class Feature", "Test Bonus Feat"]);
      await seedFeats(db, ctx, feats("Test Evasion", "Test Proficiency", "Test Bonus"));
      const { klassId, levelIds } = await seedClass(
        db,
        ctx,
        klass("Test Mage", {
          description: "A mage",
          hd: 6,
          levels: 3,
          skillPoints: 4,
          bab: "medium",
          saves: { fortitude: "good", reflex: "poor", will: "good" },
          classSkills: ["Climb", "Spot"],
          requirements: [r.or(r.gte("combat.bab", 2), r.gte("skills.spot.ranks", 4))],
          classFeatureAptitude: "Test Class Feature",
          classFeatures: [[2, "Test Evasion"]],
          proficiencies: ["Test Proficiency"],
          freeFeats: [[3, "Test Bonus", "Test Bonus Feat"]],
          aptitudePicks: [{ levels: [1, 3], target: "aptitudes.testbonusfeat.allowed" }],
          modifiers: [{ level: 2, target: "combat.ac.misc", operator: "add", value: "1", valueType: "number" }],
          bonusSpellAbility: "Charisma",
          casterType: "Arcane",
          spells: {
            slug: "testmagespells",
            perDay: [
              [3, 1],
              [4, 2],
              [4, 2, 1],
            ],
            known: [
              [4, 2],
              [5, 2],
              [5, 3, 1],
            ],
          },
          casterLevelAdvancement: { type: "dual", levels: [2] },
        }),
      );

      const [row] = await db.select().from(klassesInRules).where(eq(klassesInRules.id, klassId));
      expect(row).toMatchObject({
        rulesetId: ctx.rulesetId,
        name: "Test Mage",
        description: "A mage",
        hd: 6,
        kind: "pc",
      });
      expect(await customizationsOf(klassId)).toEqual({
        requirements: [],
        modifiers: [],
        properties: [
          `${KLASS_BONUS_SPELL_ABILITY_ID} ${ctx.abilityMap["Charisma"]}`,
          `${KLASS_CASTER_TYPE} Arcane`,
        ].sort(),
      });
      const skills = namesOf(ctx.skillMap);
      expect(
        (await db.select().from(klassSkillsInRules).where(eq(klassSkillsInRules.klassId, klassId)))
          .map((s) => skills[s.skillId])
          .sort(),
      ).toEqual(["Climb", "Spot"]);

      const slot = (spellLevel: number, kind: string, operator: string, value: number) =>
        `aptitudes.testmagespells.${spellLevel}.${kind} ${operator} ${value} number`;
      expect(await levelsOf(ctx, levelIds)).toEqual([
        {
          level: 1,
          properties: levelProperties(0, 4),
          saves: { Fortitude: 2, Reflex: 0, Will: 2 },
          modifiers: [
            "aptitudes.testbonusfeat.allowed add 1 number",
            slot(0, "allowed", "add", 4),
            slot(0, "uses", "add", 3),
            slot(1, "allowed", "add", 2),
            slot(1, "uses", "add", 1),
          ].sort(),
          requirements: [
            "1 or",
            "1.1 combat.bab greater_than_or_equal 2",
            "1.2 skills.spot.ranks greater_than_or_equal 4",
          ],
          feats: ["Test Proficiency in General, free"],
        },
        {
          level: 2,
          properties: levelProperties(1, 4),
          saves: { Fortitude: 3, Reflex: 0, Will: 3 },
          modifiers: [
            "aptitudes.bonusarcanecasterlevel.allowed add 1 number",
            "aptitudes.bonusdivinecasterlevel.allowed add 1 number",
            "combat.ac.misc add 1 number",
            slot(0, "allowed", "add", 1),
            slot(0, "uses", "add", 1),
            slot(1, "uses", "add", 1),
          ].sort(),
          requirements: ["1 classes.testmage.level greater_than 1"],
          feats: ["Test Evasion in Test Class Feature, free"],
        },
        {
          level: 3,
          properties: levelProperties(2, 4),
          saves: { Fortitude: 3, Reflex: 1, Will: 3 },
          modifiers: [
            "aptitudes.testbonusfeat.allowed add 1 number",
            slot(1, "allowed", "add", 1),
            slot(2, "allowed", "add", 1),
            slot(2, "uses", "add", 1),
          ].sort(),
          requirements: ["1 classes.testmage.level greater_than 2"],
          feats: ["Test Bonus in Test Bonus Feat, free"],
        },
      ]);
    });

    test("that knows every spell it casts can prepare any at each spell level it opens, from the first when it has no cantrips", async () => {
      const ctx = await freshSeedContext({ named: true });
      const { klassId, levelIds } = await seedClass(
        db,
        ctx,
        klass("Test Healer", {
          levels: 3,
          bab: "good",
          kind: "npc",
          spells: { slug: "testhealerspells", perDay: [[1], [2], [2, 1]], knowAll: true, noCantrips: true },
        }),
      );
      expect((await db.select().from(klassesInRules).where(eq(klassesInRules.id, klassId)))[0].kind).toBe("npc");
      expect(await customizationsOf(klassId)).toEqual({ requirements: [], modifiers: [], properties: [] });
      const levels = await levelsOf(ctx, levelIds);
      expect(levels.map(({ level, properties, modifiers }) => ({ level, properties, modifiers }))).toEqual([
        {
          level: 1,
          properties: levelProperties(1, 2),
          modifiers: [
            "aptitudes.testhealerspells.1.allowed set -1 number",
            "aptitudes.testhealerspells.1.uses add 1 number",
          ],
        },
        { level: 2, properties: levelProperties(2, 2), modifiers: ["aptitudes.testhealerspells.1.uses add 1 number"] },
        {
          level: 3,
          properties: levelProperties(3, 2),
          modifiers: [
            "aptitudes.testhealerspells.2.allowed set -1 number",
            "aptitudes.testhealerspells.2.uses add 1 number",
          ],
        },
      ]);
    });

    test("refuses a class skill or a granted feat that isn't seeded", async () => {
      const ctx = await freshSeedContext({ named: true });
      await seedAptitudes(db, ctx, ["Test Class Feature"]);
      await expect(seedClass(db, ctx, klass("Test Skilled", { classSkills: ["Nope"] }))).rejects.toThrow(
        `Test Skilled's class skill: "Nope" isn't seeded`,
      );
      await expect(
        seedClass(
          db,
          ctx,
          klass("Test Featured", {
            levels: 2,
            classFeatureAptitude: "Test Class Feature",
            classFeatures: [[2, "Nope"]],
          }),
        ),
      ).rejects.toThrow(`Test Featured's class feature at level 2: "Nope" isn't seeded`);
    });
  });

  test("seeds items as templates, and the items made from them", async () => {
    const ctx = await freshSeedContext();
    expect(await seedItems(db, ctx.rulesetId, [])).toEqual({});
    const templates = await seedItems(
      db,
      ctx.rulesetId,
      [
        item("Test Blade", {
          type: "Weapon",
          slot: "Main Hand",
          properties: [{ type: "WEAPON_DAMAGE", value: "1d8" }],
          requirements: [r.eq(r.feat("Martial Weapon Proficiency"))],
        }),
      ],
      { isTemplate: true },
    );
    const made = await seedItems(
      db,
      ctx.rulesetId,
      [
        item("Test Flaming Blade", {
          sourceItem: "Test Blade",
          slot: "Main Hand",
          modifiers: [{ target: "combat.tohit.misc", operator: "add", value: "1", valueType: "number" }],
        }),
        item("Test Rope"),
      ],
      { templateMap: templates },
    );

    const names = namesOf({ ...templates, ...made });
    const rows = await db.select().from(itemsInRules).where(eq(itemsInRules.rulesetId, ctx.rulesetId));
    expect(
      rows
        .map(({ name, isTemplate, slot, sourceItemId }) => ({
          name,
          isTemplate,
          slot,
          source: sourceItemId && names[sourceItemId],
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { name: "Test Blade", isTemplate: true, slot: "Main Hand", source: null },
      { name: "Test Flaming Blade", isTemplate: false, slot: "Main Hand", source: "Test Blade" },
      { name: "Test Rope", isTemplate: false, slot: "Other", source: null },
    ]);
    expect(await customizationsOf(templates["Test Blade"])).toEqual({
      requirements: ["1 feats.martialweaponproficiency.possessed equal true"],
      modifiers: [],
      properties: ["WEAPON_DAMAGE 1d8"],
    });
    expect(await customizationsOf(made["Test Flaming Blade"])).toEqual({
      requirements: [],
      modifiers: ["combat.tohit.misc add 1 number"],
      properties: [],
    });
  });

  test("seeds spells with their saving throw, once in each spell list the ruleset has, and adds them to more", async () => {
    const ctx = await freshSeedContext({ named: true });
    await seedAptitudes(db, ctx, ["Test Arcane Spells", "Test Divine Spells"]);
    const school = { type: SPELL_SCHOOL, value: "Evocation" };
    await seedPowers(db, ctx, [
      spell("Test Bolt", 3, {
        aptitudes: ["Test Arcane Spells", "Test Divine Spells", "Test Unknown Spells"],
        aptitudeLevels: { "Test Divine Spells": 4 },
        savingThrow: "Reflex half",
        properties: [school, school],
      }),
      spell("Test Charm", 1, { aptitudes: ["Test Arcane Spells", "Test Arcane Spells"], savingThrow: "Will negates" }),
      spell("Test Ward", 0, { savingThrow: "None" }),
      spell("Test Wish", 9, { savingThrow: "See text" }),
      spell("Test Light", 0),
    ]);

    const saves = namesOf(ctx.saveMap);
    const powers = await db.select().from(powersInRules).where(eq(powersInRules.rulesetId, ctx.rulesetId));
    expect(
      powers
        .map(({ id, name, saveId, saveEffect }) => ({
          named: ctx.powerMap[name] === id,
          name,
          save: saveId && saves[saveId],
          saveEffect,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { named: true, name: "Test Bolt", save: "Reflex", saveEffect: "half" },
      { named: true, name: "Test Charm", save: "Will", saveEffect: "negates" },
      { named: true, name: "Test Light", save: null, saveEffect: null },
      { named: true, name: "Test Ward", save: null, saveEffect: null },
      { named: true, name: "Test Wish", save: null, saveEffect: "See text" },
    ]);
    expect(await spellListsOf(ctx, ctx.powerMap["Test Bolt"])).toEqual([
      "Test Arcane Spells 3",
      "Test Divine Spells 4",
    ]);
    expect(await spellListsOf(ctx, ctx.powerMap["Test Charm"])).toEqual(["Test Arcane Spells 1"]);
    expect((await customizationsOf(ctx.powerMap["Test Bolt"])).properties).toEqual([`${SPELL_SCHOOL} Evocation`]);

    await linkPower(db, ctx.powerMap["Test Charm"], [
      { aptitudeId: ctx.aptMap["Test Arcane Spells"], level: 5 },
      { aptitudeId: ctx.aptMap["Test Divine Spells"], level: 2 },
      { aptitudeId: ctx.aptMap["Test Divine Spells"], level: 7 },
    ]);
    expect(await spellListsOf(ctx, ctx.powerMap["Test Charm"])).toEqual([
      "Test Arcane Spells 1",
      "Test Divine Spells 2",
    ]);
  });

  test("seeds races of their own kind, else of the kind given, else a character's", async () => {
    const ctx = await freshSeedContext();
    const dexterity = { target: "abilities.dexterity.score", operator: "add", value: "2", valueType: "number" };
    await seedRaces(db, ctx, [race("Test Elf", { modifiers: [dexterity] })]);
    await seedRaces(
      db,
      ctx,
      [race("Test Hawk", { size: "Tiny", baseSpeed: 10 }), race("Test Steed", { size: "Large", kind: "mount" })],
      "familiar",
    );

    const rows = await db.select().from(racesInRules).where(eq(racesInRules.rulesetId, ctx.rulesetId));
    expect(
      rows
        .map(({ name, size, baseSpeed, kind }) => ({ name, size, baseSpeed, kind }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { name: "Test Elf", size: "Medium", baseSpeed: 30, kind: "pc" },
      { name: "Test Hawk", size: "Tiny", baseSpeed: 10, kind: "familiar" },
      { name: "Test Steed", size: "Large", baseSpeed: 30, kind: "mount" },
    ]);
    expect((await customizationsOf(rows.find((row) => row.name === "Test Elf")!.id)).modifiers).toEqual([
      "abilities.dexterity.score add 2 number",
    ]);
  });

  test("seeds a cleric domain: a feat in Cleric Domain whose spell list opens as the cleric casts each level, with the domain's spells", async () => {
    const ctx = await freshSeedContext();
    await seedAptitudes(db, ctx, ["Cleric Domain"]);
    await seedPowers(db, ctx, [spell("Test Bless", 1), spell("Test Aid", 2)]);
    const classSkill = { target: "skills.spot.innate", operator: "set", value: "true", valueType: "boolean" };
    await seedDomains(
      db,
      ctx,
      [
        {
          name: "Test Luck",
          description: "Luck",
          modifiers: [classSkill],
          spells: [
            { name: "Test Bless", level: 1 },
            { name: "Test Aid", level: 2 },
            { name: "Test Aid", level: 2 },
            { name: "Test Missing", level: 3 },
          ],
        },
      ],
      SPELL_LEVELS,
    );

    const featId = ctx.featMap["Test Luck Domain"];
    const [feat] = await db.select().from(featsInRules).where(eq(featsInRules.id, featId));
    expect(feat.description).toBe("Luck");
    expect(await aptitudesOfFeat(ctx, featId)).toEqual(["Cleric Domain"]);
    expect(await customizationsOf(featId)).toEqual({
      requirements: [],
      modifiers: [
        ...gatedSlots("testluckdomainspells", "classes.cleric.level"),
        "skills.spot.innate set true boolean",
      ].sort(),
      properties: [],
    });
    expect(await spellListsOf(ctx, ctx.powerMap["Test Bless"])).toEqual(["Test Luck Domain Spells 1"]);
    expect(await spellListsOf(ctx, ctx.powerMap["Test Aid"])).toEqual(["Test Luck Domain Spells 2"]);
  });

  test("gives a wizard school's specialist feat its spell list, of the school's wizard spells", async () => {
    const ctx = await freshSeedContext();
    await seedAptitudes(db, ctx, [
      "Wizard Spells",
      "Wizard Specialization",
      "Evocation Specialist Spells",
      "Universal Specialist Spells",
    ]);
    await seedFeats(db, ctx, [{ name: "Evocation Specialist", description: "", aptitudes: ["Wizard Specialization"] }]);
    const school = (value: string) => [{ type: SPELL_SCHOOL, value }];
    await seedPowers(db, ctx, [
      spell("Test Bolt", 3, { aptitudes: ["Wizard Spells"], properties: school("Evocation") }),
      spell("Test Flame", 2, { properties: school("Evocation") }),
      spell("Test Mirror", 2, { aptitudes: ["Wizard Spells"], properties: school("Illusion") }),
      spell("Test Detect", 0, { aptitudes: ["Wizard Spells"], properties: school("Universal") }),
    ]);
    await seedWizardSchools(
      db,
      ctx,
      [
        { name: "Evocation", description: "", prohibitedSchoolCount: 1 },
        { name: "Illusion", description: "", prohibitedSchoolCount: 1 },
      ],
      SPELL_LEVELS,
    );

    expect((await customizationsOf(ctx.featMap["Evocation Specialist"])).modifiers).toEqual(
      gatedSlots("evocationspecialistspells", "classes.wizard.level").sort(),
    );
    expect({
      bolt: await spellListsOf(ctx, ctx.powerMap["Test Bolt"]),
      flame: await spellListsOf(ctx, ctx.powerMap["Test Flame"]),
      mirror: await spellListsOf(ctx, ctx.powerMap["Test Mirror"]),
      detect: await spellListsOf(ctx, ctx.powerMap["Test Detect"]),
    }).toEqual({
      bolt: ["Evocation Specialist Spells 3", "Wizard Spells 3"],
      flame: [],
      mirror: ["Wizard Spells 2"],
      detect: ["Wizard Spells 0"],
    });
  });

  test("seeds a bonded creature: its aptitudes, feats, races and class, all of its kind", async () => {
    const ctx = await freshSeedContext({ named: true });
    await seedBond(db, ctx, {
      kind: "familiar",
      aptitudes: ["Test Familiar Feature"],
      feats: [{ name: "Test Alertness", description: "", aptitudes: ["Test Familiar Feature"] }],
      races: [race("Test Cat", { size: "Tiny" })],
      klass: klass("Test Familiar", {
        kind: "familiar",
        classFeatureAptitude: "Test Familiar Feature",
        classFeatures: [[1, "Test Alertness"]],
      }),
    });

    expect(await aptitudesOfFeat(ctx, ctx.featMap["Test Alertness"])).toEqual(["Test Familiar Feature"]);
    expect(await db.select().from(racesInRules).where(eq(racesInRules.rulesetId, ctx.rulesetId))).toMatchObject([
      { name: "Test Cat", kind: "familiar" },
    ]);
    expect(await db.select().from(klassesInRules).where(eq(klassesInRules.rulesetId, ctx.rulesetId))).toMatchObject([
      { name: "Test Familiar", kind: "familiar" },
    ]);
    expect(
      await db
        .select()
        .from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.featId, ctx.featMap["Test Alertness"])),
    ).toMatchObject([{ aptitudeId: ctx.aptMap["Test Familiar Feature"], free: true }]);
  });

  describe("an extension", () => {
    test("copies the inherited feats it changes, each recorded, and adds its class levels to their `or` of requirements", async () => {
      const core = await freshSeedContext();
      await seedAptitudes(db, core, ["General"]);
      const dodge = r.eq(r.feat("Dodge"));
      await seedFeats(db, core, [
        {
          name: "Test Grouped",
          description: "Grouped",
          aptitudes: ["General"],
          requirements: [r.or(r.gte("classes.fighter.level", 4), r.gte("combat.bab", 6)), dodge],
          modifiers: [
            { target: "combat.ac.misc", operator: "add", value: "1", valueType: "number", requirements: [dodge] },
          ],
          properties: [{ type: FEAT_FAMILY, value: "Test" }],
        },
        { name: "Test Single", description: "", aptitudes: ["General"], requirements: [r.gte("combat.bab", 1)] },
        { name: "Test Open", description: "", aptitudes: ["General"] },
      ]);
      const original = { ...core.featMap };
      const before = await customizationsOf(original["Test Grouped"]);

      const ctx = await freshExtensionContext(core);
      await seedAptitudes(db, ctx, ["Test Class Feature"]);
      await cowFeatsIntoExtension(db, ctx, [
        {
          feat: "Test Grouped",
          requirements: [
            { className: "ranger", level: 4 },
            { className: "rogue", level: 6 },
          ],
          aptitudes: ["Test Class Feature", "Nope"],
        },
        { feat: "Test Single", requirements: [{ className: "ranger", level: 2 }], aptitudes: [] },
        { feat: "Test Open", requirements: [{ className: "ranger", level: 2 }], aptitudes: ["Test Class Feature"] },
        { feat: "Test Unseeded", requirements: [{ className: "ranger", level: 2 }], aptitudes: [] },
      ]);

      const copies = await db.select().from(featsInRules).where(eq(featsInRules.rulesetId, ctx.rulesetId));
      expect(
        copies
          .map(({ id, name }) => ({ named: ctx.featMap[name] === id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ).toEqual([
        { named: true, name: "Test Grouped" },
        { named: true, name: "Test Open" },
        { named: true, name: "Test Single" },
      ]);
      const snapshots = await db
        .select()
        .from(entitySnapshotsInRules)
        .where(eq(entitySnapshotsInRules.rulesetId, ctx.rulesetId));
      expect(
        snapshots
          .map(({ entityType, sourceEntityId, forkedEntityId, contentHash }) => ({
            entityType,
            sourceEntityId,
            forkedEntityId,
            contentHash,
          }))
          .sort((a, b) => a.sourceEntityId.localeCompare(b.sourceEntityId)),
      ).toEqual(
        ["Test Grouped", "Test Single", "Test Open"]
          .map((name) => ({
            entityType: "feats",
            sourceEntityId: original[name],
            forkedEntityId: ctx.featMap[name],
            contentHash: "seed",
          }))
          .sort((a, b) => a.sourceEntityId.localeCompare(b.sourceEntityId)),
      );

      const classLevel = (className: string, level: number, at: string) =>
        `${at} classes.${className}.level greater_than_or_equal ${level}`;
      expect(await customizationsOf(ctx.featMap["Test Grouped"])).toEqual({
        requirements: [
          "1 or",
          "1.1 classes.fighter.level greater_than_or_equal 4",
          "1.2 combat.bab greater_than_or_equal 6",
          classLevel("ranger", 4, "1.3"),
          classLevel("rogue", 6, "1.4"),
          "2 feats.dodge.possessed equal true",
        ],
        modifiers: before.modifiers,
        properties: before.properties,
      });
      expect((await customizationsOf(ctx.featMap["Test Single"])).requirements).toEqual([
        "1 or",
        "1.1 combat.bab greater_than_or_equal 1",
        classLevel("ranger", 2, "1.2"),
      ]);
      expect((await customizationsOf(ctx.featMap["Test Open"])).requirements).toEqual([]);
      expect(await aptitudesOfFeat(ctx, ctx.featMap["Test Grouped"])).toEqual(["General", "Test Class Feature"]);
      expect(await aptitudesOfFeat(ctx, ctx.featMap["Test Single"])).toEqual(["General"]);
      expect(await aptitudesOfFeat(ctx, ctx.featMap["Test Open"])).toEqual(["General", "Test Class Feature"]);

      // The originals are as they were, and the core rules' context too
      expect(await customizationsOf(original["Test Grouped"])).toEqual(before);
      expect(await aptitudesOfFeat(ctx, original["Test Grouped"])).toEqual(["General"]);
      expect(core.featMap).toEqual(original);
      expect(Object.keys(core.aptMap)).toEqual(["General"]);
    });

    test("copies the inherited spells it adds to its spell lists, which keep the originals' spell lists", async () => {
      const core = await freshSeedContext();
      await seedAptitudes(db, core, ["Wizard Spells", "Cleric Spells", "Test Source"]);
      const school = { type: SPELL_SCHOOL, value: "Evocation" };
      await seedPowers(db, core, [
        spell("Test Bolt", 3, {
          aptitudes: ["Wizard Spells", "Test Source"],
          savingThrow: "See text",
          properties: [school],
        }),
        spell("Test Ward", 1, { aptitudes: ["Cleric Spells"] }),
        spell("Test Light", 0, { aptitudes: ["Cleric Spells"] }),
      ]);

      const ctx = await freshExtensionContext(core);
      await seedAptitudes(db, ctx, ["Arcane Spells"]);
      await seedPowers(db, ctx, [spell("Test Ward", 2, { aptitudes: ["Arcane Spells"] })]);
      const ownWard = ctx.powerMap["Test Ward"];
      await cowSpellsIntoExtension(db, ctx, [
        {
          spell: "Test Bolt",
          aptitudes: [
            { aptitude: "Arcane Spells", level: 2 },
            { aptitude: "Wizard Spells", level: 9 },
            { aptitude: "Nope Spells", level: 1 },
          ],
        },
        { spell: "Test Ward", aptitudes: [{ aptitude: "Arcane Spells", level: 5 }] },
        { spell: "Test Unseeded", aptitudes: [{ aptitude: "Arcane Spells", level: 1 }] },
      ]);

      const boltId = ctx.powerMap["Test Bolt"];
      const [bolt] = await db.select().from(powersInRules).where(eq(powersInRules.id, boltId));
      expect(bolt).toMatchObject({ rulesetId: ctx.rulesetId, name: "Test Bolt", saveEffect: "See text" });
      expect(await spellListsOf(ctx, boltId)).toEqual(["Arcane Spells 2", "Wizard Spells 3"]);
      expect((await customizationsOf(boltId)).properties).toEqual([`${SPELL_SCHOOL} Evocation`]);
      // Its own spell keeps the inherited one's lists, and isn't copied
      expect(ctx.powerMap["Test Ward"]).toBe(ownWard);
      expect(await spellListsOf(ctx, ownWard)).toEqual(["Arcane Spells 2", "Cleric Spells 1"]);
      const snapshots = await db
        .select()
        .from(entitySnapshotsInRules)
        .where(eq(entitySnapshotsInRules.rulesetId, ctx.rulesetId));
      expect(snapshots).toMatchObject([
        {
          entityType: "powers",
          sourceEntityId: core.powerMap["Test Bolt"],
          forkedEntityId: boltId,
          contentHash: "seed",
        },
      ]);
      expect(await spellListsOf(ctx, core.powerMap["Test Bolt"])).toEqual(["Test Source 3", "Wizard Spells 3"]);

      // An extension of the extension copies the core's spells too
      const grandchild = await freshExtensionContext(ctx);
      await cowSpellsIntoExtension(db, grandchild, [
        { spell: "Test Light", aptitudes: [{ aptitude: "Arcane Spells", level: 1 }] },
      ]);
      const light = grandchild.powerMap["Test Light"];
      expect(light).not.toBe(core.powerMap["Test Light"]);
      expect((await db.select().from(powersInRules).where(eq(powersInRules.id, light)))[0]).toMatchObject({
        rulesetId: grandchild.rulesetId,
        name: "Test Light",
      });
      expect(await spellListsOf(grandchild, light)).toEqual(["Arcane Spells 1", "Cleric Spells 0"]);
    });
  });
});
