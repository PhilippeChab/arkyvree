import { describe, expect, test } from "bun:test";

import { ALL_DOMAINS } from "@/content/dnd3.5/generated/srd/domains.ts";
import { stripSeparators } from "@/shared/text.ts";
import { UNARMED_STRIKE } from "@/vocabulary/dnd3.5/combat.ts";
import { CREATURE_TYPES } from "@/vocabulary/dnd3.5/creatureTypes.ts";
import {
  FEAT_FAMILY,
  FEAT_STACKABLE,
  LANGUAGE_TYPE,
  WEAPON_MAX_RANGE_INCREMENTS,
  WEAPON_RANGE,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import { SECRET_LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/languages.ts";
import { WEAPON_TYPE_DEFINITIONS } from "@/vocabulary/dnd3.5/weapons.ts";

import { describeRequirement, seededRows } from "./seededRows.ts";

const bab1 = "2 combat.bab greater_than_or_equal 1";
/** The cleric level each spell level opens at, the first at the first. */
const CLERIC_OPENS_AT = [1, 3, 5, 7, 9, 11, 13, 15, 17];

/** An item creation feat's caster level: the character's highest, of either kind. */
function casterLevel(level: number) {
  return [`1 spellcasting.casterlevel greater_than_or_equal ${level}`];
}

/** What a slot of the spell level opening at `clericLevel` requires: a cleric level, but the first's. */
function clericGate(clericLevel: number) {
  return clericLevel === 1 ? "" : ` classes.cleric.level greater_than_or_equal ${clericLevel}`;
}

/** The grant of a language, as a modifier's target, operator and value read. */
function grant(slug: string) {
  return `languages.${slug}.known set true boolean`;
}

/** The languages an entity's modifiers grant (`languages.<slug>.known` set true), by slug, A to Z. */
function grantedLanguages(rows: Awaited<ReturnType<typeof seededRows>>, sourceId: string) {
  return rows
    .modifiersOf(sourceId)
    .filter(({ target }) => target?.startsWith("languages."))
    .map(({ operator, target, value, valueType }) => `${target} ${operator} ${value} ${valueType}`)
    .sort();
}

function proficiency(kind: string, weapon: string) {
  return [
    "1 or",
    `1.1 feats.${kind}weaponproficiency.possessed equal true`,
    `1.2 feats.${kind}weaponproficiency${weapon}.possessed equal true`,
  ];
}

function umbrellaSlots(rows: Awaited<ReturnType<typeof seededRows>>) {
  return rows
    .modifiersOf(rows.feat("Favored Enemy (Ranger)").id)
    .filter((m) => m.target === "aptitudes.favoredenemy.allowed");
}

describe("The seeded core rules", () => {
  test.each([
    ["feats", "Weapon Focus: Longsword", [...proficiency("martial", "longsword"), bab1]],
    ["feats", "Weapon Focus: Dagger", [...proficiency("simple", "dagger"), bab1]],
    ["feats", "Weapon Focus: Spiked Gauntlet", [...proficiency("simple", "spikedgauntlet"), bab1]],
    // A spell has no proficiency to require
    ["feats", "Weapon Focus: Ranged Spell", ["1 combat.bab greater_than_or_equal 1"]],
    [
      "feats",
      "Weapon Specialization: Longsword",
      ["1 feats.weaponfocuslongsword.possessed equal true", "2 classes.fighter.level greater_than_or_equal 4"],
    ],
    [
      "feats",
      "Greater Weapon Specialization: Greatsword",
      [
        "1 feats.greaterweaponfocusgreatsword.possessed equal true",
        "2 feats.weaponfocusgreatsword.possessed equal true",
        "3 feats.weaponspecializationgreatsword.possessed equal true",
        "4 classes.fighter.level greater_than_or_equal 12",
      ],
    ],
    ["feats", "Greater Spell Focus: Evocation", ["1 feats.spellfocusevocation.possessed equal true"]],
    ["feats", "Brew Potion", casterLevel(3)],
    ["feats", "Forge Ring", casterLevel(12)],
    ["feats", "Advance Wizard Spellcasting", ["1 classes.wizard.level greater_than_or_equal 1"]],
    ["feats", "Advance Bard Spellcasting", ["1 classes.bard.level greater_than_or_equal 1"]],
    ["feats", "Necromancy Specialist", ["1 classes.wizard.level greater_than_or_equal 1"]],
    ["items", "Handaxe", proficiency("martial", "handaxe")],
    ["items", "Longsword", proficiency("martial", "longsword")],
    ["items", "Spiked Gauntlet", proficiency("simple", "spikedgauntlet")],
  ] as const)("%s: %s has its requirements", async (type, name, expected) => {
    const rows = await seededRows();
    const entity = type === "feats" ? rows.feat(name) : rows.items.find((item) => item.name === name)!;
    expect(rows.requirementsOf(entity.id).map(describeRequirement).sort()).toEqual([...expected]);
  });

  test.each([
    ["Dwarf", ["common", "dwarven"]],
    ["Elf", ["common", "elven"]],
    ["Gnome", ["common", "gnome"]],
    ["Half-Elf", ["common", "elven"]],
    ["Half-Orc", ["common", "orc"]],
    ["Halfling", ["common", "halfling"]],
    ["Human", ["common"]],
  ])(
    "give the %s its automatic languages, as its modifiers' grants, each a language of the rules",
    async (race, slugs) => {
      const rows = await seededRows();
      const { id } = rows.races.find((row) => row.name === race && row.partition === "pc")!;
      expect(grantedLanguages(rows, id)).toEqual(slugs.map((slug) => grant(slug)));
      const known = new Set(rows.languages.map(({ name }) => stripSeparators(name)));
      expect(slugs.filter((slug) => !known.has(slug))).toEqual([]);
    },
  );

  test("grant the druid Druidic at its first level, the one secret language, and no class any other", async () => {
    const rows = await seededRows();
    expect(grantedLanguages(rows, rows.classLevel("Druid", 1).id)).toEqual([grant("druidic")]);
    const levelIds = new Set(rows.classLevels.map(({ id }) => id));
    const granting = rows.modifiers.filter(
      ({ sourceId, target }) => levelIds.has(sourceId) && target?.startsWith("languages."),
    );
    expect(granting.map(({ sourceId }) => sourceId)).toEqual([rows.classLevel("Druid", 1).id]);
    expect(
      rows.languages.filter(({ fields }) => fields[LANGUAGE_TYPE] === SECRET_LANGUAGE_TYPE).map(({ name }) => name),
    ).toEqual(["Druidic"]);
  });

  test("name a weapon's feats as its item, and the unarmed strike's, a simple weapon that's no item", async () => {
    const rows = await seededRows();
    const weapons = [...new Set(rows.items.map((item) => item.name))].filter((name) => WEAPON_TYPE_DEFINITIONS[name]);
    expect(weapons.length).toBe(Object.keys(WEAPON_TYPE_DEFINITIONS).length);
    for (const weapon of [...weapons, UNARMED_STRIKE]) {
      const proficiency = WEAPON_TYPE_DEFINITIONS[weapon]?.proficiency ?? "Simple";
      expect(rows.feat(`${proficiency} Weapon Proficiency: ${weapon}`)).toBeDefined();
      expect(rows.feat(`Weapon Focus: ${weapon}`)).toBeDefined();
    }
  });

  test("give the SRD's projectile weapons ten range increments and the net one, and no other item a count", async () => {
    // "A net's maximum range is 10 feet"; a thrown weapon, without a count, reaches five
    const rows = await seededRows();
    const reaches = rows.items
      .flatMap((item) =>
        rows
          .valuesOf(item.id, WEAPON_MAX_RANGE_INCREMENTS)
          .map((increments) => [item.name, increments, rows.valuesOf(item.id, WEAPON_RANGE)[0]]),
      )
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
    expect(reaches).toEqual([
      ["Composite Longbow", 10, 110],
      ["Composite Shortbow", 10, 70],
      ["Hand Crossbow", 10, 30],
      ["Heavy Crossbow", 10, 120],
      ["Light Crossbow", 10, 80],
      ["Longbow", 10, 100],
      ["Net", 1, 10],
      ["Repeating Heavy Crossbow", 10, 120],
      ["Repeating Light Crossbow", 10, 80],
      ["Shortbow", 10, 60],
      ["Sling", 10, 50],
    ]);
  });

  test("give each skill a check is made with its Skill Focus, Use Psionic Device's too, and Speak Language none", async () => {
    const rows = await seededRows();
    const focused = rows.feats.flatMap(({ name }) => (name.startsWith("Skill Focus: ") ? [name.slice(13)] : []));
    const skills = rows.skills.map(({ name }) => name).filter((name) => name !== "Speak Language");
    expect(focused.sort()).toEqual(skills.sort());
    expect(focused).toContain("Use Psionic Device");
    const psionic = rows.feat("Skill Focus: Use Psionic Device");
    expect(rows.modifiersOf(psionic.id).map(({ target, value }) => `${target} ${value}`)).toEqual([
      "skills.usepsionicdevice.misc 3",
    ]);
  });

  describe("cleric domains", () => {
    test("each have a feat in Cleric Domain without requirements, and a spell list of their spells", async () => {
      const rows = await seededRows();
      const clericDomain = rows.aptitude("Cleric Domain");
      expect(rows.feats.filter((feat) => feat.name.endsWith(" Domain")).length).toBe(ALL_DOMAINS.length);
      for (const domain of ALL_DOMAINS) {
        const feat = rows.feat(`${domain.name} Domain`);
        expect(feat.listedIn.map((link) => link.toId)).toEqual([clericDomain.id]);
        expect(rows.requirementsOf(feat.id)).toEqual([]);

        const spellList = rows.aptitude(`${domain.name} Domain Spells`);
        const spells = rows.spells.flatMap((spell) =>
          spell.listedIn
            .filter((link) => link.toId === spellList.id)
            .map((link) => `${link.tier} ${spell.name.toLowerCase()}`),
        );
        expect({ domain: domain.name, spells: spells.sort() }).toEqual({
          domain: domain.name,
          spells: domain.spells.map((s) => `${s.level} ${s.name.toLowerCase()}`).sort(),
        });
      }
    });

    test("fill the cleric's one domain slot a spell level, which his feature opens as he reaches it", async () => {
      const rows = await seededRows();
      const feature = rows.feat("Deity, Domains, and Domain Spells (Cleric)");
      const slots = rows.modifiersOf(feature.id).map((m) => {
        const clericLevel = rows.requirementsOf(m.id).map((r) => `${r.target} ${r.operator} ${r.value}`);
        return `${m.target} ${m.operator} ${m.value} ${clericLevel.join()}`.trim();
      });
      expect(slots.sort()).toEqual(
        CLERIC_OPENS_AT.map(
          (clericLevel, i) => `aptitudes.domainspells.${i + 1}.uses add 1${clericGate(clericLevel)}`,
        ).sort(),
      );
      expect(rows.aptitude("Domain Spells")).toBeDefined();
    });

    test("each make a domain spell a spell level known, as the cleric reaches it, join the cleric's list, and carry their granted power's modifiers", async () => {
      const rows = await seededRows();
      for (const domain of ALL_DOMAINS) {
        const feat = rows.feat(`${domain.name} Domain`);
        const spells = `aptitudes.${stripSeparators(domain.name)}domainspells.`;
        const modifiers = rows.modifiersOf(feat.id);
        const slots = modifiers
          .filter((m) => m.target.startsWith(spells))
          .map((m) => {
            const clericLevel = rows.requirementsOf(m.id).map((r) => `${r.target} ${r.operator} ${r.value}`);
            return `${m.target.slice(spells.length)} ${m.operator} ${m.value} ${clericLevel.join()}`.trim();
          });
        expect({ domain: domain.name, slots: slots.sort() }).toEqual({
          domain: domain.name,
          slots: CLERIC_OPENS_AT.map((clericLevel, i) => `${i + 1}.allowed set -1${clericGate(clericLevel)}`)
            .concat("joinsclasslist set true")
            .sort(),
        });
        const others = modifiers
          .filter((m) => !m.target.startsWith(spells))
          .map(({ target, operator, value, valueType }) => ({ target, operator, value, valueType }));
        expect({ domain: domain.name, others }).toEqual({ domain: domain.name, others: domain.modifiers ?? [] });
      }
    });

    test.each([
      ["Animal", ["knowledgenature"]],
      [
        "Knowledge",
        [
          "knowledgearcana",
          "knowledgearchitectureandengineering",
          "knowledgedungeoneering",
          "knowledgegeography",
          "knowledgehistory",
          "knowledgelocal",
          "knowledgenature",
          "knowledgenobilityandroyalty",
          "knowledgepsionics",
          "knowledgereligion",
          "knowledgetheplanes",
        ],
      ],
      ["Travel", ["survival"]],
      ["Trickery", ["bluff", "disguise", "hide"]],
    ])("%s makes its skills cleric class skills", async (domain, skills) => {
      const rows = await seededRows();
      const classSkills = rows
        .modifiersOf(rows.feat(`${domain} Domain`).id)
        .filter((m) => m.target.endsWith(".innate"));
      expect(classSkills.map((m) => `${m.target} ${m.operator} ${m.value}`).sort()).toEqual(
        skills.map((skill) => `skills.${skill}.innate set true`),
      );
    });

    test("a cleric picks two at the first level", async () => {
      const rows = await seededRows();
      const picks = rows
        .modifiersOf(rows.classLevel("Cleric", 1).id)
        .filter((m) => m.target === "aptitudes.clericdomain.allowed");
      expect(picks).toMatchObject([{ operator: "add", value: "2" }]);
    });
  });

  test("put each class's own feat of a class feature, and a spell's Weapon Focus, in its family, and only those", async () => {
    const rows = await seededRows();
    const familyOf = (name: string) => rows.valuesOf(rows.feat(name).id, FEAT_FAMILY);
    expect(
      [
        "Sneak Attack (Rogue)",
        "Evasion (Monk)",
        "Evasion (Animal Companion)",
        "Rage (Barbarian)",
        "Summon Familiar (Wizard)",
        "Weapon Focus: Touch Spell",
        "Improved Evasion (Monk)",
      ].map((name) => [name, familyOf(name)]),
    ).toEqual([
      ["Sneak Attack (Rogue)", ["Sneak Attack"]],
      ["Evasion (Monk)", ["Evasion"]],
      ["Evasion (Animal Companion)", ["Evasion"]],
      ["Rage (Barbarian)", ["Rage"]],
      ["Summon Familiar (Wizard)", ["Summon Familiar"]],
      ["Weapon Focus: Touch Spell", ["Weapon Focus"]],
      ["Improved Evasion (Monk)", []],
    ]);
  });

  describe("favored enemies", () => {
    const variants = CREATURE_TYPES.map((type) => `Favored Enemy: ${type}`);

    test("are a feat a creature type, not stackable, in the shared aptitude and the Favored Enemy family", async () => {
      const rows = await seededRows();
      const aptitude = rows.aptitude("Favored Enemy");
      for (const name of variants) {
        const feat = rows.feat(name);
        const family = rows.valuesOf(feat.id, FEAT_FAMILY);
        expect({
          name,
          fields: { [FEAT_STACKABLE]: feat.fields[FEAT_STACKABLE] },
          listedIn: feat.listedIn.map((link) => link.toId),
          family,
        }).toEqual({ name, fields: { [FEAT_STACKABLE]: false }, listedIn: [aptitude.id], family: ["Favored Enemy"] });
      }
    });

    test("get a slot from the ranger's umbrella feat", async () => {
      expect(umbrellaSlots(await seededRows())).toMatchObject([{ operator: "add", value: "1" }]);
    });
  });
});
