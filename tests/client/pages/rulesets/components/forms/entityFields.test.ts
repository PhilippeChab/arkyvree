import { describe, expect, test } from "bun:test";

import {
  changedFieldValues,
  choiceOptions,
  emptyFieldValues,
  type EntityFieldValues,
  isFieldShown,
  noneLabel,
  toFieldValues,
  valueAt,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/entityFields.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

/** A field's description, but what it's for. */
const BASE = { help: "" };

/** An entity type's fields, one of each input: a group's, and one shown on another's value. */
const FIELDS: EntityField[] = [
  { ...BASE, key: "school", label: "School", input: "choice", multiple: false, options: ["Evocation", "Illusion"] },
  { ...BASE, key: "tags", label: "Tags", input: "choice", multiple: true, options: ["Fire"] },
  { ...BASE, key: "notes", label: "Notes", input: "text", multiple: true },
  { ...BASE, key: "target", label: "Target", input: "text", multiple: false },
  { ...BASE, key: "weighted", label: "Weighted", input: "flag", nullable: false },
  {
    ...BASE,
    key: "count",
    label: "Count",
    input: "number",
    default: 1,
    min: 1,
    shownWhen: { path: "fields.weighted", values: [true] },
  },
  { ...BASE, key: "abilityId", label: "Ability", input: "ref", references: "abilities", required: false },
  {
    key: "weapon",
    label: "Weapon",
    input: "group",
    shownWhen: { path: "type", values: ["Weapon"] },
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

  test("show a field on its condition, off the form's value at its path", () => {
    const [, , , , , count, , weapon] = FIELDS;
    const values = { type: "Weapon", fields: { weighted: false } };
    expect(isFieldShown(FIELDS[0], undefined)).toBe(true);
    expect(isFieldShown(count, valueAt(values, "fields.weighted"))).toBe(false);
    expect(isFieldShown(count, true)).toBe(true);
    expect(isFieldShown(weapon, valueAt(values, "type"))).toBe(true);
    expect(valueAt(values, "fields.weighted.deeper")).toBeUndefined();
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
