import { describe, expect, test } from "bun:test";

import { expectOk, guestApi } from "@/tests/support/api.ts";
import {
  CLASS_HD,
  FEAT_FAMILY,
  FEAT_GENERATED,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("rules", () => {
  test("answers what every base rules' rulesets share, to anyone: words, kinds, levels, lists, progression, level wizard, a new character's form and license", async () => {
    const rules = await expectOk(guestApi.api.rules.$get());
    const dnd35 = rules["Dungeons & Dragons: 3.5"];
    // Its word for every type, the engine's own (modifiers) with its own
    expect(dnd35.words.spells).toEqual({ many: "Spells", one: "Spell" });
    expect(dnd35.words.classes).toEqual({ many: "Classes", one: "Class" });
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
      "xp",
      "ruleset",
      "race",
      "alignment",
      "gender",
      "age",
      "height",
      "weight",
      "deity",
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
      { type: "class_levels", owner: "classes" },
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
    expect(dnd35.kinds.filter((each) => each.families).map(({ families, type }) => [type, families])).toEqual([
      ["feats", { field: FEAT_FAMILY }],
    ]);
    expect(dnd35.kinds.filter((each) => each.wideForm).map(({ type, wideForm }) => [type, wideForm])).toEqual([
      ["spells", "fixed"],
      ["items", "fluid"],
    ]);
    // A class's page links it to its class skills, by the role their activities are named for
    expect(kind("classes")?.links).toEqual({ role: "classSkill", targetName: "skillName", type: "skills" });
    expect(kind("feats")?.lockedName).toEqual({ field: FEAT_GENERATED, reason: "A generated feat keeps its name" });
    // A pool's links column reads an entity read's links of its role, and a form sends them by it
    expect(dnd35.columns.feats?.find((column) => column.input === "links")).toMatchObject({ role: "listedIn" });
    expect(dnd35.columns.spells?.find((column) => column.input === "leveledLinks")).toMatchObject({
      role: "listedIn",
    });
    // A column says where it's stored alone: its field, or its role
    for (const columns of Object.values(dnd35.columns))
      for (const column of columns ?? []) expect(Object.keys(column)).not.toContain("key");
    expect(
      dnd35.columns.class_levels?.map((column) => [column.input, column.input === "group" ? "" : column.role]),
    ).toEqual([
      ["amounts", "baseBonus"],
      ["grants", "grants"],
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
});
