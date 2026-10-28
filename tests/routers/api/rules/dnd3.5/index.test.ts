import { describe, expect, test } from "bun:test";

import type { FormField } from "@/engine/core/fields/index.ts";
import { expectOk, guestApi } from "@/tests/support/api.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  CLASS_CASTER_TYPE,
  CLASS_HD,
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
  FEAT_FAMILY,
  FEAT_GENERATED,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_SPELL_FAILURE,
  ITEM_TYPE,
  ITEM_WEIGHT,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
  RULESET_ABILITY_INCREASES,
  RULESET_FEAT_ADVANCEMENT,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SAVE_EFFECT,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
  WEAPON_FINESSABLE,
  WEAPON_PROFICIENCY,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import { SPELL_COMPONENTS, SPELL_SCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";

/** Where a form's field sends its value: its stored field, a link its role; a group, its label. */
function placeOf(field: FormField) {
  return field.input === "group" ? field.label : (field.field ?? field.role);
}

/** 3.5's fields, as the API answers them, by type. */
async function fieldsOf() {
  const { fields } = await rulesOf();
  return Object.fromEntries(Object.entries(fields).map(([type, described]) => [type, described ?? []]));
}

/** 3.5's rules, as the API answers them to anyone. */
async function rulesOf() {
  return (await expectOk(guestApi.api.rules.$get()))["Dungeons & Dragons: 3.5"];
}

describe("rules", () => {
  test("answers what every base rules' rulesets share, to anyone: words, kinds, levels, lists, progression, level wizard, a new character's form and license", async () => {
    const rules = await expectOk(guestApi.api.rules.$get());
    const dnd35 = rules["Dungeons & Dragons: 3.5"];
    // Its word for every type, the engine's own (characters, modifiers) with its own, an owned type's naming its
    // entity's position
    expect(dnd35.words.spells).toEqual({ many: "Spells", one: "Spell" });
    expect(dnd35.words.classes).toEqual({ many: "Classes", one: "Class" });
    expect(dnd35.words["class-levels"]).toEqual({
      many: "Class Levels",
      one: "Class Level",
      position: { many: "Levels", one: "Level" },
    });
    expect(dnd35.words.characters).toEqual({ many: "Characters", one: "Character" });
    expect(dnd35.words.modifiers).toEqual({ many: "Modifiers", one: "Modifier" });
    // Its kinds, in its page's order: each its picture, and its tab's help where it has one
    expect(dnd35.kinds.map(({ type }) => type)).toEqual([
      "races",
      "languages",
      "skills",
      "feats",
      "spells",
      "items",
      "aptitudes",
      "classes",
      "saves",
      "abilities",
      "mechanics",
    ]);
    expect(dnd35.kinds.filter((kind) => kind.help).map(({ type }) => type)).toEqual(["aptitudes", "mechanics"]);
    // Its pages' help, in its own terms
    expect(Object.keys(dnd35.help)).toEqual(["modifiers", "requirements", "settings", "templateExamples"]);
    expect(dnd35.help.templateExamples).toContain("[abilities.charisma.modifier]");
    // The programs its rulesets import characters from, which the import's dialog names
    expect(dnd35.importers).toEqual(["PCGen"]);
    // Every kind has its word and its list
    for (const { type } of dnd35.kinds) {
      expect(dnd35.words[type]).toBeDefined();
      expect(dnd35.lists[type]).toBeDefined();
    }
    // A new character's form: its sections, and its fields by the keys its create sends them
    expect(dnd35.characterForm.sections.map(({ title }) => title)).toEqual([
      "Basic Information",
      "Ability Scores",
      "Physical Details",
      "Optional Details",
    ]);
    expect(
      dnd35.characterForm.sections.flatMap((section) =>
        section.kind === "fields"
          ? section.lines
              .flat()
              .map((item) => ("key" in item ? item.key : item.kind === "pick" ? item.role : item.kind))
          : [],
      ),
    ).toEqual([
      "name",
      "CHARACTER_XP",
      "ruleset",
      "race",
      "CHARACTER_ALIGNMENT",
      "CHARACTER_GENDER",
      "CHARACTER_AGE",
      "CHARACTER_HEIGHT",
      "CHARACTER_WEIGHT",
      "CHARACTER_DEITY",
      "description",
      "notes",
    ]);
    // And what its row opens
    expect(Object.fromEntries(dnd35.kinds.map(({ opens, type }) => [type, opens]))).toEqual({
      races: "customization",
      languages: "page",
      skills: "page",
      feats: "customization",
      spells: "customization",
      items: "customization",
      aptitudes: "page",
      classes: "progression",
      saves: "page",
      abilities: "page",
      mechanics: "page",
    });
    // The kinds whose customizations have a page of their own: a class's level by its class (its owner), a class's on
    // its own page
    expect(dnd35.customizationPages).toEqual([
      { type: "feats" },
      { type: "spells" },
      { type: "items" },
      { type: "races" },
      { type: "class-levels", owner: "classes" },
    ]);
    // A kind that opens a customization page is one such a page shows, and every kind one shows but an owned kind's
    // (which no tab lists) opens it
    const customized = dnd35.kinds.filter(({ opens }) => opens === "customization").map(({ type }) => type);
    const pages = dnd35.customizationPages.filter(({ owner }) => !owner).map(({ type }) => type);
    expect(customized.toSorted()).toEqual(pages.toSorted());
    // Races and classes narrow by what they're for, abilities take no form, an empty list of saves its own words
    expect(dnd35.kinds.filter((kind) => kind.partitioned).map(({ type }) => type)).toEqual(["races", "classes"]);
    expect(dnd35.kinds.filter((kind) => kind.readOnly).map(({ type }) => type)).toEqual(["abilities"]);
    // A class's new one's form says what each field is for, a mechanic's gives its description room
    expect(dnd35.kinds.filter((kind) => kind.fieldHelp).map(({ type }) => type)).toEqual(["classes"]);
    expect(dnd35.kinds.filter((kind) => kind.longDescription).map(({ type }) => type)).toEqual(["mechanics"]);
    expect(dnd35.kinds.find((kind) => kind.type === "saves")?.empty).toBe(
      "No saving throws available for this ruleset.",
    );
    expect(dnd35.entityKinds).toEqual([
      { label: "Player Character", value: "pc" },
      { label: "Familiar", value: "familiar" },
      { label: "Animal Companion", value: "animalcompanion" },
      { label: "Special Mount", value: "mount" },
    ]);
    expect(dnd35.progression.lastLevel).toBe(20);
    expect(dnd35.tiers.at(0)).toEqual({ label: "Cantrips", level: 0 });
    expect(dnd35.tiers.at(-1)).toEqual({ label: "Level 9", level: 9 });
    expect(dnd35.license).toMatchObject({ text: "ogl" });
    // Its lists: a class's hit die as dice notation, an item's cost and weight in their units, each column by where
    // it's stored, never a key of its own
    expect(dnd35.lists.classes?.columns).toEqual([
      expect.objectContaining({ field: CLASS_HD, labels: expect.objectContaining({ 10: "d10" }) }),
    ]);
    expect(dnd35.lists.items?.columns.map(({ field, unit }) => [field, unit])).toEqual([
      [ITEM_TYPE, undefined],
      [ITEM_IS_TEMPLATE, undefined],
      [ITEM_COST_GP, "gp"],
      [ITEM_WEIGHT, "lbs"],
    ]);
    for (const list of Object.values(dnd35.lists)) {
      for (const column of list?.columns ?? []) {
        expect(Object.keys(column)).not.toContain("key");
        expect([column.field, column.role].filter(Boolean)).toHaveLength(1);
      }
    }
    // Feats and spells narrow by their pools, spells by their level too; feats group by family; items copy
    const kind = (type: string) => dnd35.kinds.find((each) => each.type === type);
    // Each by its aptitudes, at their query key and the URL's, those of its own scope
    const aptitudes = { param: "aptitude", role: "listedIn", type: "aptitudes" };
    expect(dnd35.kinds.filter((each) => each.pools).map(({ pools, type }) => [type, pools])).toEqual([
      ["feats", { ...aptitudes, scope: "feats" }],
      ["spells", { ...aptitudes, scope: "spells" }],
    ]);
    expect(dnd35.kinds.filter((each) => each.levels).map(({ type }) => type)).toEqual(["spells"]);
    expect(dnd35.kinds.filter((each) => each.families).map(({ type }) => type)).toEqual(["feats"]);
    expect(dnd35.kinds.filter((each) => each.wideForm).map(({ type, wideForm }) => [type, wideForm])).toEqual([
      ["spells", "fixed"],
      ["items", "fluid"],
    ]);
    // A class's page links it to its class skills, by the role their activities are named for
    expect(kind("classes")?.links).toEqual({ role: "classSkill", type: "skills" });
    expect(kind("feats")?.lockedName).toEqual({ field: FEAT_GENERATED, reason: "A generated feat keeps its name" });
    // A pool's links read an entity read's links of their role, and a form sends them by it
    expect(dnd35.fields.feats?.find((field) => field.input === "links")).toMatchObject({ role: "listedIn" });
    expect(dnd35.fields.spells?.find((field) => field.input === "leveledLinks")).toMatchObject({ role: "listedIn" });
    // A field says where it's stored alone: its stored field, or its link's role
    for (const fields of Object.values(dnd35.fields))
      for (const field of fields ?? []) expect(Object.keys(field)).not.toContain("key");
    expect(
      dnd35.fields["class-levels"]?.map((field) => [
        field.input,
        field.input === "group" ? "" : (field.field ?? field.role),
      ]),
    ).toEqual([
      ["amounts", "baseBonus"],
      ["grants", "grants"],
      ["number", CLASS_LEVEL_BAB],
      ["number", CLASS_LEVEL_SKILL_POINTS],
    ]);
    expect(kind("items")?.copies).toEqual({
      locked: [ITEM_SLOT, "madeFrom", ITEM_TYPE],
      most: 50,
      source: "madeFrom",
      template: { field: ITEM_IS_TEMPLATE },
    });
    // A pools column reads its list's rows' links of its role, each its pool's name
    expect(dnd35.lists.feats?.columns.map(({ field, reads, role }) => [field, reads, role])).toEqual([
      [undefined, "pools", "listedIn"],
    ]);
    // Its classes' progression: a level's base attack bonus and skill points, a base per save, two spell tables
    expect(dnd35.progression.tracks.map(({ key, source }) => [key, source])).toEqual([
      ["bab", "field"],
      ["saves", "amounts"],
      ["skills", "field"],
    ]);
    expect(dnd35.progression.tracks[0].labels?.[6]).toBe("+6/+1");
    expect(dnd35.progression.tables.map(({ all, key, table, totals }) => [key, all, table, totals])).toEqual([
      ["perDay", undefined, "spells", "spellsPerDay"],
      ["known", "All", "spells-known", "spellsKnown"],
    ]);
    // Its class page's old tabs' addresses, by the tab each opens now
    expect(dnd35.progression.tabAliases).toEqual({
      "feat-pools": "progression",
      levels: "progression",
      "spells-known": "spells?table=known",
      "spells-per-day": "spells",
    });
    // What its levels grant past their columns: feat pools, their picks and totals where its answer and table hold them
    expect(dnd35.progression.grants).toMatchObject({
      picks: "featPicks",
      pools: { scope: "feats", type: "aptitudes" },
      table: "feat-pools",
      totals: "featPools",
    });
    // What they count: its spells, on a class's spell list, on its Spells and Spell List tabs
    expect(dnd35.progression.counts).toMatchObject({
      lists: "spell-lists",
      listTab: "spell-list",
      tab: "spells",
      type: "spells",
    });
    // Its level steps' words are their steps', which a level's steps carry: none in the rules
    expect(dnd35).not.toHaveProperty("levelUp");
  });

  test("answers each type's form's fields, and the ruleset's Settings', as its module declares them, by type", async () => {
    const fields = await fieldsOf();
    // Every type its module declares fields of, by name: its customizable kinds, its skills, its saves, its languages
    // and its rulesets, a language's type and a save's ability among them
    expect(Object.keys(fields)).toEqual([
      ...["class-levels", "classes", "feats", "items", "languages", "races", "rulesets", "saves", "skills", "spells"],
    ]);
    expect(fields.languages).toEqual([
      expect.objectContaining({ field: LANGUAGE_TYPE, input: "text", placement: "beside-name" }),
    ]);
    expect(fields.saves).toEqual([
      expect.objectContaining({ input: "ref", references: "abilities", required: true, role: "keyAbility" }),
    ]);
    // Those beside its name first, then its others, its lists of links among them, which a form lays out after them
    expect(fields.spells.map(placeOf)).toEqual([
      "resistedBy",
      SPELL_SAVE_EFFECT,
      "listedIn",
      SPELL_SCHOOL,
      SPELL_SUBSCHOOL,
      SPELL_DESCRIPTOR,
      SPELL_COMPONENT,
      SPELL_CASTING_TIME,
      SPELL_RANGE_TYPE,
      SPELL_TARGET,
      SPELL_EFFECT,
      SPELL_AREA_OF_EFFECT,
      SPELL_DURATION,
      SPELL_RESISTANCE,
    ]);
    expect(fields.spells.filter((field) => field.input !== "group" && field.placement).map(placeOf)).toEqual([
      "resistedBy",
      SPELL_SAVE_EFFECT,
    ]);
    expect(fields.spells).toContainEqual(
      expect.objectContaining({
        field: SPELL_SCHOOL,
        label: "School",
        input: "choice",
        multiple: false,
        options: SPELL_SCHOOLS,
      }),
    );
    expect(fields.spells).toContainEqual(
      expect.objectContaining({ field: SPELL_COMPONENT, input: "choice", multiple: true, options: SPELL_COMPONENTS }),
    );
    expect(fields.spells).toContainEqual(
      expect.objectContaining({
        field: SPELL_CASTING_TIME,
        input: "text",
        multiple: false,
        placeholder: 'e.g., "1 standard action"',
      }),
    );
    expect(fields.spells).toContainEqual(
      expect.objectContaining({ input: "leveledLinks", max: 9, min: 0, references: "aptitudes", role: "listedIn" }),
    );
    // A feat's flags its rules set, which no form shows
    expect(fields.feats.map(placeOf)).toEqual([
      "listedIn",
      FEAT_FAMILY,
      FEAT_WEAPON_FINESSE,
      FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
      WIZARD_PROHIBITED_SCHOOL,
    ]);
    expect(fields.classes).toEqual([
      expect.objectContaining({
        default: 8,
        field: CLASS_HD,
        input: "choice",
        labels: ["d4", "d6", "d8", "d10", "d12"],
        options: [4, 6, 8, 10, 12],
        placement: "beside-name",
        required: true,
      }),
      expect.objectContaining({ role: "bonusSpellAbility", input: "ref", references: "abilities", required: false }),
      expect.objectContaining({ field: CLASS_CASTER_TYPE, input: "choice", options: ["Arcane", "Divine"] }),
    ]);
    expect(fields.races.slice(0, 2)).toEqual([
      expect.objectContaining({ default: "Medium", field: RACE_SIZE, input: "choice", required: true }),
      expect.objectContaining({ default: 30, field: RACE_BASE_SPEED, input: "number", min: 1, unit: "feet" }),
    ]);
    expect(fields["class-levels"]).toEqual([
      expect.objectContaining({ input: "amounts", max: 12, min: 0, references: "saves", role: "baseBonus" }),
      expect.objectContaining({ input: "grants", references: "feats", role: "grants" }),
      expect.objectContaining({ field: CLASS_LEVEL_BAB, label: "Base Attack Bonus", input: "number", default: 0 }),
      expect.objectContaining({ field: CLASS_LEVEL_SKILL_POINTS, label: "Skill Points", input: "number", default: 0 }),
    ]);
    expect(fields.skills).toContainEqual(
      expect.objectContaining({
        field: SKILL_CHECK_PENALTY_MULTIPLIER,
        shownWhen: [{ path: `fields.${SKILL_IMPACTED_BY_WEIGHT}`, values: [true] }],
      }),
    );
    expect(fields.rulesets).toEqual([
      expect.objectContaining({ role: "skillPointAbility", input: "ref", references: "abilities", required: true }),
      expect.objectContaining({ field: RULESET_FEAT_ADVANCEMENT, input: "progression", levels: 20, max: 10 }),
      expect.objectContaining({ field: RULESET_ABILITY_INCREASES, input: "progression", levels: 20, max: 1 }),
    ]);
  });

  test("lays an item's out: beside its name its cost, weight, type (a template's of its own types), slot and template", async () => {
    const { items } = await fieldsOf();
    const besideName = items.filter((field) => field.input !== "group" && field.placement === "beside-name");
    expect(besideName.map((field) => [placeOf(field), field.input])).toEqual([
      [ITEM_COST_GP, "decimal"],
      [ITEM_WEIGHT, "decimal"],
      [ITEM_TYPE, "choice"],
      [ITEM_TYPE, "choice"],
      [ITEM_SLOT, "choice"],
      ["madeFrom", "template"],
    ]);
    expect(besideName[0]).toMatchObject({ min: 0, unit: "gp" });
    expect(besideName.slice(2, 4)).toEqual([
      expect.objectContaining({ shownWhen: [{ except: true, path: `fields.${ITEM_IS_TEMPLATE}`, values: [true] }] }),
      expect.objectContaining({
        options: ["Weapon", "Armor", "Shield"],
        required: true,
        shownWhen: [{ path: `fields.${ITEM_IS_TEMPLATE}`, values: [true] }],
      }),
    ]);
    expect(besideName[5]).toMatchObject({ role: "madeFrom", typeField: ITEM_TYPE });
    // Whether it's a template its page gives its form: no input of its own
    expect(items.map(placeOf)).not.toContain(ITEM_IS_TEMPLATE);
    const groups = items.flatMap((field) =>
      field.input === "group" ? [[field.label, field.shownWhen?.[0].values]] : [],
    );
    expect(groups).toEqual([
      ["Weapon", ["Weapon"]],
      ["Armor", ["Armor"]],
      ["Shield", ["Shield"]],
    ]);
    const weapon = items.find((field) => placeOf(field) === "Weapon");
    expect(weapon).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({
          field: WEAPON_PROFICIENCY,
          input: "choice",
          options: ["Simple", "Martial", "Exotic"],
        }),
        expect.objectContaining({ field: WEAPON_FINESSABLE, input: "flag", nullable: true }),
      ]),
    });
    // The stats an armor and a shield both keep, held by the item itself: in each one's section, after its own
    expect(items.find((field) => placeOf(field) === ARMOR_MAX_DEX)).toBeUndefined();
    const own = {
      Armor: [ARMOR_TYPE, ARMOR_PROFICIENCY, ARMOR_AC_BONUS],
      Shield: [SHIELD_TYPE, SHIELD_PROFICIENCY, SHIELD_AC_BONUS],
    };
    for (const [section, fieldsOf] of Object.entries(own)) {
      const group = items.find((field) => placeOf(field) === section);
      const places = group?.input === "group" ? group.fields.map(placeOf) : [];
      expect(places).toEqual([...fieldsOf, ARMOR_MAX_DEX, ARMOR_CHECK_PENALTY, ITEM_SPELL_FAILURE]);
    }
  });

  test("answers no columns of its own beside its fields, and no ruleset's fields route", async () => {
    const rules = await rulesOf();
    expect(rules).not.toHaveProperty("columns");
  });
});
