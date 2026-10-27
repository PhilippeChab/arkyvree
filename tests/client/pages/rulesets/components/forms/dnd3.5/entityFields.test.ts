import { describe, expect, test } from "bun:test";

import {
  changedValues,
  choiceOptions,
  emptyFieldValues,
  formSectionsOf,
  isFieldShown,
  linkedEntities,
  noneLabel,
  ownFieldValues,
  ownLinkOf,
  ownLinksOf,
  poolsOf,
  toFieldValues,
  toWholeBody,
  toWholeValues,
  valueAt,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/entityFields.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { Engine } from "@/engine/index.ts";
import {
  CLASS_HD,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_MASTERWORK,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  SPELL_SAVE_EFFECT,
  SPELL_SCHOOL,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A form's values: any, its fields and its links among them. */
interface Form {
  [key: string]: unknown;
  fields?: Record<string, unknown>;
  links?: Record<string, unknown>;
}

/** A field's description, but what it's for. */
const BASE = { help: "" };

/**
 * An entity type's fields, one of each input, each with the stored field that keeps it (a reference, its link's role):
 * a group's, and one shown on another's value.
 */
const FIELDS: EntityField[] = [
  {
    ...BASE,
    field: "SCHOOL",
    label: "School",
    input: "choice",
    multiple: false,
    options: ["Evocation", "Illusion"],
  },
  { ...BASE, field: "TAG", label: "Tags", input: "choice", multiple: true, options: ["Fire"] },
  { ...BASE, field: "NOTE", label: "Notes", input: "text", multiple: true, nullable: true },
  { ...BASE, field: "TARGET", label: "Target", input: "text", multiple: false, nullable: true },
  { ...BASE, field: "WEIGHTED", label: "Weighted", input: "flag", nullable: false },
  {
    ...BASE,
    field: "COUNT",
    label: "Count",
    input: "number",
    default: 1,
    min: 1,
    shownWhen: [{ path: "fields.WEIGHTED", values: [true] }],
  },
  {
    ...BASE,
    label: "Ability",
    input: "ref",
    references: "abilities",
    required: false,
    role: "ability",
  },
  {
    label: "Weapon",
    input: "group",
    shownWhen: [{ path: "fields.TYPE", values: ["Weapon"] }],
    fields: [
      { ...BASE, field: "REACH", label: "Reach", input: "number", default: null },
      { ...BASE, field: "RANGED", label: "Ranged", input: "flag", nullable: true },
    ],
  },
];

/** Two groups that both show a field held at the entity's own level: an armor's and a shield's max Dex bonus. */
const WORN_FIELDS: EntityField[] = [
  {
    label: "Armor",
    input: "group",
    fields: [
      { ...BASE, field: "ARMOR_BONUS", label: "Armor Bonus", input: "number", default: null },
      { ...BASE, field: "MAX_DEX", label: "Max Dex Bonus", input: "number", default: null },
    ],
  },
  {
    label: "Shield",
    input: "group",
    fields: [
      { ...BASE, field: "SHIELD_BONUS", label: "Shield Bonus", input: "number", default: null },
      { ...BASE, field: "MAX_DEX", label: "Max Dex Bonus", input: "number", default: null },
    ],
  },
];

describe("an entity's fields in its form", () => {
  test("start empty: no choice, no text, a flag off (none, a three-state one), a number its default", () => {
    expect(emptyFieldValues(FIELDS)).toEqual({
      fields: { SCHOOL: "", TAG: [], NOTE: [], TARGET: "", WEIGHTED: false, COUNT: 1, REACH: null, RANGED: null },
      links: { ability: "" },
    });
  });

  test("hold an entity's, each off its stored field (a reference off its link), its none as their empty values", () => {
    const entity = {
      name: "Bolt",
      fields: { SCHOOL: "Evocation", TAG: ["Fire", 3], WEIGHTED: true, COUNT: 2, REACH: 10, RANGED: false },
      links: [],
    };
    expect(toFieldValues(FIELDS, entity)).toEqual({
      fields: {
        SCHOOL: "Evocation",
        TAG: ["Fire"],
        NOTE: [],
        TARGET: "",
        WEIGHTED: true,
        COUNT: 2,
        REACH: 10,
        RANGED: false,
      },
      links: { ability: "" },
    });
    const linked = { ...entity, links: [{ role: "ability", toId: "wis", toName: "Wisdom" }] };
    expect(toFieldValues(FIELDS, linked).links.ability).toBe("wis");
  });

  test("hold a progression: its default in an empty form, an entity's when it's of its shape, each a copy", () => {
    const core = { every: 3, extra: [{ amount: 1, level: 1 }] };
    const fields: EntityField[] = [
      { ...BASE, field: "FEATS", label: "Feats", input: "progression", default: core, levels: 20, max: 2 },
    ];
    const empty = emptyFieldValues(fields);
    expect(empty).toEqual({ fields: { FEATS: core }, links: {} });
    expect(empty.fields.FEATS).not.toBe(core);
    const own = { every: 0, extra: [{ amount: 2, level: 5 }] };
    expect(toFieldValues(fields, { fields: { FEATS: own } })).toEqual({ fields: { FEATS: own }, links: {} });
    for (const feats of [[1, 0], { every: 3 }, { every: 3, extra: [{ level: "5", amount: 1 }] }, null])
      expect(toFieldValues(fields, { fields: { FEATS: feats } })).toEqual({ fields: { FEATS: core }, links: {} });
  });

  test("join a form's values once they load, over its own: a new entity's empty, an entity's own", () => {
    const form: Form = { name: "", fields: { COST: "1.00" }, links: { madeFrom: "t" } };
    expect(withEntityFields(form, undefined)).toEqual(form);
    expect(withEntityFields(form, FIELDS.slice(0, 1))).toEqual({ ...form, fields: { COST: "1.00", SCHOOL: "" } });
    expect(withEntityFields(form, FIELDS.slice(0, 1), { fields: { SCHOOL: "Illusion" } })).toEqual({
      ...form,
      fields: { COST: "1.00", SCHOOL: "Illusion" },
    });
  });

  test("join none of those it sends whole, which the form makes itself: beside its name, its lists", () => {
    const beside: EntityField = { ...BASE, field: "COST", label: "Cost", input: "decimal", placement: "beside-name" };
    const lists: EntityField = { ...BASE, input: "links", label: "Pools", references: "aptitudes", role: "pools" };
    const form: Form = { name: "", fields: { COST: "1.00" }, links: { pools: [] } };
    const entity = { fields: { COST: 5, SCHOOL: "Illusion" }, links: [{ role: "pools", toId: "p", toName: "Pool" }] };
    expect(withEntityFields(form, [beside, FIELDS[0], lists], entity)).toEqual({
      ...form,
      fields: { COST: "1.00", SCHOOL: "Illusion" },
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
    const values = { fields: { TYPE: "Weapon", WEIGHTED: false } };
    expect(isFieldShown(FIELDS[0], [])).toBe(true);
    expect(isFieldShown(count, [valueAt(values, "fields.WEIGHTED")])).toBe(false);
    expect(isFieldShown(count, [true])).toBe(true);
    expect(isFieldShown(weapon, [valueAt(values, "fields.TYPE")])).toBe(true);
    expect(valueAt(values, "fields.WEIGHTED.deeper")).toBeUndefined();
    // Every condition holds: an item's template, while it's of a template's type and isn't one itself
    const template: EntityField = {
      ...BASE,

      label: "Template",
      input: "template",
      role: "madeFrom",
      typeField: "TYPE",
      shownWhen: [
        { path: "fields.TYPE", values: ["Weapon"] },
        { path: "fields.TEMPLATE", values: [true], except: true },
      ],
    };
    expect(isFieldShown(template, ["Weapon", false])).toBe(true);
    expect(isFieldShown(template, ["Weapon", true])).toBe(false);
    expect(isFieldShown(template, ["Ring", false])).toBe(false);
  });

  test("hold of their own those another entity doesn't hold the same, a group's by each field", () => {
    const template = {
      fields: { SCHOOL: "Evocation", TAG: ["Fire"], TARGET: "One creature", REACH: 10, RANGED: true },
    };
    const values = { fields: { SCHOOL: "Evocation", TAG: [], TARGET: "You", REACH: 10, RANGED: false } };
    const empty = emptyFieldValues(FIELDS);
    expect(ownFieldValues(FIELDS, values, template)).toEqual({
      ...empty,
      fields: { ...empty.fields, TAG: [], TARGET: "You", REACH: null, RANGED: false },
    });
    expect(ownFieldValues(FIELDS, values, undefined)).toEqual({
      ...empty,
      fields: { ...empty.fields, ...values.fields },
    });
  });

  test("send an edit's changed fields and links alone, a group's by each field, those beside its name whole", () => {
    const beside: EntityField[] = [
      { ...BASE, field: "COST", label: "Cost", input: "decimal", placement: "beside-name" },
      { ...BASE, field: "REACH", label: "Reach", input: "number", default: null },
    ];
    const baseline = { fields: { SCHOOL: "Sorcery", TAG: ["Fire"], REACH: 10, COST: "1.00" }, links: { ability: "a" } };
    expect(
      changedValues(
        {
          name: "Bolt",
          fields: { SCHOOL: "Sorcery", TAG: ["Fire"], REACH: 15, COST: "1.00" },
          links: { ability: "a" },
        } as Form,
        baseline,
        beside,
      ),
    ).toEqual({ name: "Bolt", fields: { REACH: 15, COST: "1.00" }, links: {} });
    expect(changedValues<Form>({ fields: { SCHOOL: "Evocation" }, links: { ability: "b" } }, baseline, [])).toEqual({
      fields: { SCHOOL: "Evocation" },
      links: { ability: "b" },
    });
    expect(changedValues<Form>({ name: "Bolt" }, baseline, [])).toEqual({
      name: "Bolt",
      fields: undefined,
      links: undefined,
    });
    expect(changedValues<Form>({ fields: { SCHOOL: "Illusion" } }, undefined, [])).toEqual({
      fields: { SCHOOL: "Illusion" },
      links: undefined,
    });
  });
});

describe("an entity's fields shown in a group but held at its own level", () => {
  test("hold their value once, at their own stored field, whichever group shows them", () => {
    expect(emptyFieldValues(WORN_FIELDS)).toEqual({
      fields: { ARMOR_BONUS: null, MAX_DEX: null, SHIELD_BONUS: null },
      links: {},
    });
    expect(toFieldValues(WORN_FIELDS, { fields: { ARMOR_BONUS: 4, MAX_DEX: 6 } })).toEqual({
      fields: { ARMOR_BONUS: 4, MAX_DEX: 6, SHIELD_BONUS: null },
      links: {},
    });
  });
});

describe("an entity's fields beside its name in its form", () => {
  /** 3.5's item fields, as the engine describes them: what the item form holds and sends. */
  const ITEM = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"].fields.items ?? [];
  /** 3.5's class fields: a hit die among its own, 8 by default. */
  const CLASS = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"].fields.classes ?? [];

  test("lie beside its name, its lists of links after its others", () => {
    const placesOf = (fields: readonly EntityField[]) =>
      fields.map((field) => (field.input === "group" ? field.label : (field.field ?? field.role)));
    const { beside, body, lists } = formSectionsOf(ITEM);
    expect(placesOf(beside)).toEqual([ITEM_COST_GP, ITEM_WEIGHT, ITEM_TYPE, ITEM_TYPE, ITEM_SLOT, "madeFrom"]);
    expect(placesOf(body)).toContain("Weapon");
    expect(lists).toEqual([]);
    const spell = formSectionsOf(Engine.rules().describeAll()["Dungeons & Dragons: 3.5"].fields.spells ?? []);
    expect(placesOf(spell.beside)).toEqual(["resistedBy", SPELL_SAVE_EFFECT]);
    expect(placesOf(spell.lists)).toEqual(["listedIn"]);
    expect(placesOf(spell.body)[0]).toBe(SPELL_SCHOOL);
  });

  test("start empty: a required choice its default, a decimal no text, a template none", () => {
    expect(toWholeValues(CLASS)).toEqual({ fields: { [CLASS_HD]: 8 }, links: {} });
    expect(toWholeValues(ITEM)).toEqual({
      fields: { [ITEM_COST_GP]: "", [ITEM_WEIGHT]: "", [ITEM_TYPE]: "", [ITEM_SLOT]: "" },
      links: { madeFrom: "" },
    });
  });

  test("hold an entity's: a decimal as its text, a type a template couldn't be of, a die it doesn't offer its default", () => {
    expect(
      toWholeValues(ITEM, {
        fields: { [ITEM_COST_GP]: 15, [ITEM_WEIGHT]: 2.5, [ITEM_TYPE]: "Ring", [ITEM_SLOT]: "Finger" },
        links: [],
      }),
    ).toEqual({
      fields: { [ITEM_COST_GP]: "15.00", [ITEM_WEIGHT]: "2.50", [ITEM_TYPE]: "Ring", [ITEM_SLOT]: "Finger" },
      links: { madeFrom: "" },
    });
    expect(toWholeValues(CLASS, { fields: { [CLASS_HD]: 7 } })).toEqual({ fields: { [CLASS_HD]: 8 }, links: {} });
    // Its template, its link's of the template's role
    const madeFrom = { role: "madeFrom", toId: "t", toName: "Longsword" };
    expect(toWholeValues(ITEM, { fields: {}, links: [madeFrom] })).toMatchObject({ links: { madeFrom: "t" } });
  });

  test("name its template off its link of the role its kind's copies name it by, none without one, and list a role's links", () => {
    const { kinds } = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"];
    const source = kinds.find((kind) => kind.type === "items")?.copies?.source ?? "";
    expect(source).toBe("madeFrom");
    const madeFrom = { role: source, toId: "t", toName: "Longsword" };
    const keyAbility = { role: "keyAbility", toId: "a", toName: "Strength" };
    expect(ownLinkOf({ fields: {}, links: [keyAbility, madeFrom] }, source)?.toName).toBe("Longsword");
    expect(ownLinkOf({ fields: {}, links: [keyAbility] }, source)).toBeUndefined();
    expect(ownLinkOf({ fields: {} }, source)).toBeUndefined();
    // A list of links of a role, a spell's spell lists, in the order its server sends them
    const wizard = { role: "listedIn", toId: "w", toName: "Wizard" };
    const cleric = { role: "listedIn", toId: "c", toName: "Cleric" };
    expect(ownLinksOf({ links: [wizard, keyAbility, cleric] }, "listedIn")).toEqual([wizard, cleric]);
    expect(ownLinksOf({ fields: {} }, "listedIn")).toEqual([]);
  });

  test("send a decimal's number, none null, and a field beside its name the form hides null", () => {
    const ring: Form & { fields: Record<string, unknown> } = {
      name: "Ring",
      fields: {
        [ITEM_COST_GP]: "1500",
        [ITEM_WEIGHT]: "",
        [ITEM_TYPE]: "Ring",
        [ITEM_SLOT]: "Finger",
        [ITEM_IS_TEMPLATE]: false,
        [ITEM_MASTERWORK]: true,
      },
      links: { madeFrom: "" },
    };
    expect(toWholeBody(ITEM, ring)).toEqual({
      name: "Ring",
      fields: {
        [ITEM_COST_GP]: 1500,
        [ITEM_WEIGHT]: null,
        [ITEM_TYPE]: "Ring",
        [ITEM_SLOT]: "Finger",
        [ITEM_IS_TEMPLATE]: false,
        [ITEM_MASTERWORK]: true,
      },
      links: { madeFrom: null },
    });
    // A weapon's template shows, its slot doesn't; a template's own template never does
    const weapon = {
      ...ring,
      fields: { ...ring.fields, [ITEM_TYPE]: "Weapon" },
      links: { madeFrom: "t1" },
    };
    expect(toWholeBody(ITEM, weapon)).toMatchObject({ fields: { [ITEM_SLOT]: null }, links: { madeFrom: "t1" } });
    expect(toWholeBody(ITEM, { ...weapon, fields: { ...weapon.fields, [ITEM_IS_TEMPLATE]: true } })).toMatchObject({
      fields: { [ITEM_SLOT]: null, [ITEM_TYPE]: "Weapon" },
      links: { madeFrom: null },
    });
  });
});

describe("an entity's pools in its form", () => {
  /**
   * A pool's links, a feat's and a spell's each at its tier, which an entity read holds among its links, by their
   * roles, and a form holds and sends by them.
   */
  const POOLS: EntityField[] = [
    {
      ...BASE,

      label: "Pools",
      input: "links",
      references: "pools",
      required: "Pick a pool",
      role: "pool",
    },
    {
      ...BASE,

      label: "Lists",
      input: "leveledLinks",
      references: "pools",
      max: 9,
      min: 0,
      role: "list",
    },
  ];
  const entity = {
    links: [
      { role: "pool", toId: "b", toName: "Bonus Feats" },
      { role: "pool", toId: "a", toName: "General" },
      { role: "pool" },
      { role: "list", toId: "w", toName: "Wizard", tier: 3 },
      { role: "list", toId: "c", toName: "Cleric", tier: null },
    ],
  };

  test("read them off the entity's links, by their aptitudes' names, a level where one is held, none left without one", () => {
    expect(toWholeValues(POOLS, entity)).toEqual({
      fields: {},
      links: { pool: [{ toId: "b" }, { toId: "a" }], list: [{ toId: "c" }, { toId: "w", tier: 3 }] },
    });
    // An entity read without its links holds none, and a link of another role is none of its field's
    expect(toWholeValues(POOLS, {})).toEqual({ fields: {}, links: { pool: [], list: [] } });
    expect(toWholeValues(POOLS, { links: [{ role: "other", toId: "x", toName: "Other" }] }).links.pool).toEqual([]);
  });

  test("name the entities it links, which its pickers show by name", () => {
    expect(linkedEntities(POOLS, entity).map(({ name }) => name)).toEqual([
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
