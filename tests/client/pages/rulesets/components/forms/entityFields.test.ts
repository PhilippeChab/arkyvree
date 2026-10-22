import { describe, expect, test } from "bun:test";

import {
  changedFieldValues,
  choiceOptions,
  emptyFieldValues,
  type EntityFieldValues,
  isFieldShown,
  linkedAptitudes,
  noneLabel,
  ownFieldValues,
  poolsOf,
  toColumnsBody,
  toColumnValues,
  toFieldValues,
  valueAt,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/entityFields.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { Engine } from "@/engine/index.ts";

/** A field's description, but what it's for. */
const BASE = { help: "" };

/** An entity type's fields, one of each input: a group's, and one shown on another's value. */
const FIELDS: EntityField[] = [
  { ...BASE, key: "school", label: "School", input: "choice", multiple: false, options: ["Evocation", "Illusion"] },
  { ...BASE, key: "tags", label: "Tags", input: "choice", multiple: true, options: ["Fire"] },
  { ...BASE, key: "notes", label: "Notes", input: "text", multiple: true, nullable: true },
  { ...BASE, key: "target", label: "Target", input: "text", multiple: false, nullable: true },
  { ...BASE, key: "weighted", label: "Weighted", input: "flag", nullable: false },
  {
    ...BASE,
    key: "count",
    label: "Count",
    input: "number",
    default: 1,
    min: 1,
    shownWhen: [{ path: "fields.weighted", values: [true] }],
  },
  { ...BASE, key: "abilityId", label: "Ability", input: "ref", references: "abilities", required: false },
  {
    key: "weapon",
    label: "Weapon",
    input: "group",
    shownWhen: [{ path: "type", values: ["Weapon"] }],
    fields: [
      { ...BASE, key: "weapon.reach", label: "Reach", input: "number", default: null },
      { ...BASE, key: "weapon.ranged", label: "Ranged", input: "flag", nullable: true },
    ],
  },
];

/** Two groups that both show a field held at the entity's own level: an armor's and a shield's max Dex bonus. */
const WORN_FIELDS: EntityField[] = [
  {
    key: "armor",
    label: "Armor",
    input: "group",
    fields: [
      { ...BASE, key: "armor.bonus", label: "Armor Bonus", input: "number", default: null },
      { ...BASE, key: "maxDex", label: "Max Dex Bonus", input: "number", default: null },
    ],
  },
  {
    key: "shield",
    label: "Shield",
    input: "group",
    fields: [
      { ...BASE, key: "shield.bonus", label: "Shield Bonus", input: "number", default: null },
      { ...BASE, key: "maxDex", label: "Max Dex Bonus", input: "number", default: null },
    ],
  },
];

/** An aptitude as an entity read's link names it. */
function aptitude(id: string, name: string) {
  return { id, name, rulesetId: "r", description: null };
}

describe("an entity's fields in its form", () => {
  test("start empty: no choice, no text, a flag off (none, a three-state one), a number its default", () => {
    expect(emptyFieldValues(FIELDS)).toEqual({
      school: "",
      tags: [],
      notes: [],
      target: "",
      weighted: false,
      count: 1,
      abilityId: "",
      weapon: { reach: null, ranged: null },
    });
  });

  test("hold an entity's, its none as their empty values, a group's off its own object", () => {
    const entity = {
      name: "Bolt",
      school: "Evocation",
      tags: ["Fire", 3],
      target: null,
      weighted: true,
      count: 2,
      abilityId: null,
      weapon: { reach: 10, ranged: false },
    };
    expect(toFieldValues(FIELDS, entity)).toEqual({
      school: "Evocation",
      tags: ["Fire"],
      notes: [],
      target: "",
      weighted: true,
      count: 2,
      abilityId: "",
      weapon: { reach: 10, ranged: false },
    });
  });

  test("hold a progression: its default in an empty form, an entity's when it's of its shape, each a copy", () => {
    const core = { every: 3, extra: [{ amount: 1, level: 1 }] };
    const fields: EntityField[] = [
      { ...BASE, key: "feats", label: "Feats", input: "progression", default: core, levels: 20, max: 2 },
    ];
    const empty = emptyFieldValues(fields);
    expect(empty).toEqual({ feats: core });
    expect(empty.feats).not.toBe(core);
    const own = { every: 0, extra: [{ amount: 2, level: 5 }] };
    expect(toFieldValues(fields, { feats: own })).toEqual({ feats: own });
    for (const feats of [[1, 0], { every: 3 }, { every: 3, extra: [{ level: "5", amount: 1 }] }, null])
      expect(toFieldValues(fields, { feats })).toEqual({ feats: core });
  });

  test("join a form's values once they load: a new entity's empty, an entity's own", () => {
    const form: { fields?: EntityFieldValues; name: string } = { name: "" };
    expect(withEntityFields(form, undefined)).toEqual({ name: "", fields: {} });
    expect(withEntityFields(form, FIELDS.slice(0, 1))).toEqual({ name: "", fields: { school: "" } });
    expect(withEntityFields(form, FIELDS.slice(0, 1), { school: "Illusion" })).toEqual({
      name: "",
      fields: { school: "Illusion" },
    });
  });

  test("offer a choice's options, and those the saved form holds that its ruleset no longer lists", () => {
    expect(choiceOptions(["Evocation"], "")).toEqual(["Evocation"]);
    expect(choiceOptions(["Evocation"], "Sorcery")).toEqual(["Evocation", "Sorcery"]);
    expect(choiceOptions(["Fire"], ["Fire", "Fire or Cold"])).toEqual(["Fire", "Fire or Cold"]);
    expect([noneLabel(["Evocation"]), noneLabel(["Slot", "None"])]).toEqual(["None", "Default"]);
  });

  test("show a field on its conditions, off the form's values at their paths, each in or, `except`, out of its values", () => {
    const [, , , , , count, , weapon] = FIELDS;
    const values = { type: "Weapon", fields: { weighted: false } };
    expect(isFieldShown(FIELDS[0], [])).toBe(true);
    expect(isFieldShown(count, [valueAt(values, "fields.weighted")])).toBe(false);
    expect(isFieldShown(count, [true])).toBe(true);
    expect(isFieldShown(weapon, [valueAt(values, "type")])).toBe(true);
    expect(valueAt(values, "fields.weighted.deeper")).toBeUndefined();
    // Every condition holds: an item's template, while it's of a template's type and isn't one itself
    const template: EntityField = {
      ...BASE,
      key: "sourceItemId",
      label: "Template",
      input: "template",
      typeKey: "type",
      shownWhen: [
        { path: "type", values: ["Weapon"] },
        { path: "isTemplate", values: [true], except: true },
      ],
    };
    expect(isFieldShown(template, ["Weapon", false])).toBe(true);
    expect(isFieldShown(template, ["Weapon", true])).toBe(false);
    expect(isFieldShown(template, ["Ring", false])).toBe(false);
  });

  test("hold of their own those another entity doesn't hold the same, a group's by each field", () => {
    const template = {
      school: "Evocation",
      tags: ["Fire"],
      target: "One creature",
      weapon: { reach: 10, ranged: true },
    };
    const values = { school: "Evocation", tags: [], target: "You", weapon: { reach: 10, ranged: false } };
    expect(ownFieldValues(FIELDS, values, template)).toEqual({
      ...emptyFieldValues(FIELDS),
      tags: [],
      target: "You",
      weapon: { reach: null, ranged: false },
    });
    expect(ownFieldValues(FIELDS, values, undefined)).toEqual(toFieldValues(FIELDS, values));
  });

  test("send an edit's changed fields alone, a group whole", () => {
    const baseline = { school: "Sorcery", tags: ["Fire"], weapon: { reach: 10, ranged: null } };
    expect(
      changedFieldValues({ school: "Sorcery", tags: ["Fire"], weapon: { reach: 15, ranged: null } }, baseline),
    ).toEqual({ weapon: { reach: 15, ranged: null } });
    expect(changedFieldValues({ school: "Evocation", tags: ["Fire"] }, baseline)).toEqual({ school: "Evocation" });
    expect(changedFieldValues(undefined, baseline)).toEqual({});
    expect(changedFieldValues({ school: "Illusion" }, undefined)).toEqual({ school: "Illusion" });
  });
});

describe("an entity's fields shown in a group but held at its own level", () => {
  test("hold their value once, at their own key, whichever group shows them", () => {
    expect(emptyFieldValues(WORN_FIELDS)).toEqual({ armor: { bonus: null }, maxDex: null, shield: { bonus: null } });
    expect(toFieldValues(WORN_FIELDS, { armor: { bonus: 4 }, maxDex: 6, shield: { bonus: null } })).toEqual({
      armor: { bonus: 4 },
      maxDex: 6,
      shield: { bonus: null },
    });
  });
});

describe("an entity's columns in its form", () => {
  /** 3.5's item columns, as the engine describes them: what the item form holds and sends. */
  const ITEM = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"].columns.items ?? [];
  /** 3.5's class columns: a hit die among its own, 8 by default. */
  const CLASS = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"].columns.klasses ?? [];

  test("start empty: a required choice its default, a decimal no text, a template none", () => {
    expect(toColumnValues(CLASS)).toEqual({ hd: 8 });
    expect(toColumnValues(ITEM)).toEqual({ costGp: "", slot: "", sourceItemId: "", type: "", weight: "" });
  });

  test("hold an entity's: a decimal as its text, a type a template couldn't be of, a die it doesn't offer its default", () => {
    expect(
      toColumnValues(ITEM, { costGp: 15, weight: "2.5", type: "Ring", slot: "Finger", sourceItemId: null }),
    ).toEqual({
      costGp: "15.00",
      slot: "Finger",
      sourceItemId: "",
      type: "Ring",
      weight: "2.50",
    });
    expect(toColumnValues(CLASS, { hd: 7 })).toEqual({ hd: 8 });
  });

  test("send a decimal's number, none null, and a column the form hides null", () => {
    const ring = { costGp: "1500", weight: "", type: "Ring", slot: "Finger", sourceItemId: "", isTemplate: false };
    expect(toColumnsBody(ITEM, ring)).toEqual({
      costGp: 1500,
      slot: "Finger",
      sourceItemId: null,
      type: "Ring",
      weight: null,
    });
    // A weapon's template shows, its slot doesn't; a template's own template never does
    const weapon = { ...ring, type: "Weapon", slot: "Finger", sourceItemId: "t1" };
    expect(toColumnsBody(ITEM, weapon)).toMatchObject({ slot: null, sourceItemId: "t1" });
    expect(toColumnsBody(ITEM, { ...weapon, isTemplate: true })).toMatchObject({
      slot: null,
      sourceItemId: null,
      type: "Weapon",
    });
  });
});

describe("an entity's pools in its form", () => {
  /** A pool's links, a feat's and a spell's each at its level, which an entity read holds apart from the form's keys. */
  const POOLS: EntityField[] = [
    { ...BASE, key: "aptitudeIds", label: "Pools", input: "aptitudes", links: "poolLinks", required: true },
    {
      ...BASE,
      key: "aptitudes",
      label: "Lists",
      input: "aptitudeLevels",
      links: "listLinks",
      max: 9,
      min: 0,
      required: false,
    },
  ];
  const entity = {
    poolLinks: [{ aptitudesInRule: aptitude("b", "Bonus Feats") }, { aptitudesInRule: aptitude("a", "General") }, {}],
    listLinks: [
      { aptitudesInRule: aptitude("w", "Wizard"), level: 3 },
      { aptitudesInRule: aptitude("c", "Cleric"), level: null },
    ],
  };

  test("read them off the entity's links, by their aptitudes' names, a level where one is held, none left without one", () => {
    expect(toColumnValues(POOLS, entity)).toEqual({
      aptitudeIds: ["b", "a"],
      aptitudes: [{ id: "c" }, { id: "w", level: 3 }],
    });
    // An entity read without its links holds none
    expect(toColumnValues(POOLS, {})).toEqual({ aptitudeIds: [], aptitudes: [] });
  });

  test("name the aptitudes it links, which its pickers show by name", () => {
    expect(linkedAptitudes(POOLS, entity).map(({ name }) => name)).toEqual([
      "Bonus Feats",
      "General",
      "Cleric",
      "Wizard",
    ]);
  });

  test("offer the aptitudes it links in its server's order, a link without its aptitude left out", () => {
    expect(poolsOf(POOLS, entity).map(({ id }) => id)).toEqual(["b", "a", "w", "c"]);
    expect(poolsOf(POOLS, {})).toEqual([]);
  });
});
