import { describe, expect, test } from "bun:test";

import Field, { type Fields, type FieldSpec } from "@/engine/core/fields/Field.ts";
import { CHARACTER_FIELDS } from "@/vocabulary/dnd3.5/fields/characterFields.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/entityFields.ts";

/**
 * The keys each kind of field declares: what a codec reads of it, and no other (a misspelled key reads as none). What
 * every field's form reads of it: where it shows it, on which of its values. A leaf's: its label and what it's for, and
 * where its form places it. A stored field's own: how sibling copies merge it, the role it's read off another through,
 * whether its form takes it, whether its values are read kind-wide, whether its owner keeps its form's fields only
 * while it holds a value of it.
 */
const SHOWN = ["kind", "shownIn", "shownWhen", "when"] as const;
const LEAF = [...SHOWN, "description", "label", "placement"] as const;
const STORED = [...LEAF, "field", "form", "inherits", "keepsForm", "kindWide", "merge"] as const;
const KEYS: { [K in FieldSpec["kind"]]: readonly (keyof Extract<FieldSpec, { kind: K }>)[] } = {
  choice: [...STORED, "required", "values"],
  flag: [...STORED, "absent", "default", "write"],
  group: [...SHOWN, "fields", "label"],
  links: [...LEAF, "entries", "max", "min", "references", "required", "role", "via"],
  list: [...STORED, "placeholder", "values"],
  number: [...STORED, "default", "labels", "max", "min", "scale", "unit", "values", "write"],
  progression: [...STORED, "default", "levels", "max"],
  ref: [...LEAF, "references", "required", "role", "typeField"],
  text: [...STORED, "default", "narrowed", "placeholder", "required", "values", "write"],
};

/**
 * What's wrong with the fields at a level (`fields`, under `path`), a group's too: a key its kind doesn't declare, a
 * condition on no field at its level, a section that's no group at its level, a group's field that would keep its
 * form's fields (`keepsForm`, which only a field of the top level does: `Field.keepersOf`).
 */
function findIssues(fields: Fields, path: string): string[] {
  const groups = Object.keys(fields).filter((name) => fields[name]?.kind === "group");
  return Object.entries(fields).flatMap(([name, field]) => [
    ...Object.keys(field)
      .filter((key) => !(KEYS[field.kind] as readonly string[]).includes(key))
      .map((key) => `${path}${name}: ${key}`),
    ...(field.when && "field" in field.when && !(field.when.field in fields) ? [`${path}${name}: when`] : []),
    ...(path && "keepsForm" in field ? [`${path}${name}: keepsForm in a group`] : []),
    ...(field.shownIn ?? []).filter((group) => !groups.includes(group)).map((group) => `${path}${name}: ${group}`),
    ...(field.kind === "group" ? findIssues(field.fields, `${path}${name}.`) : []),
  ]);
}

describe("The 3.5 entities' fields", () => {
  test("declare each stored field once, across every entity type, each with its merge", () => {
    const fields = Object.values(ENTITY_FIELDS).flatMap((owned) =>
      Field.storedLeavesOf(owned).map((leaf) => leaf.field),
    );
    expect(fields.filter((field, index) => fields.indexOf(field) !== index)).toEqual([]);
    const leaves = Object.values(ENTITY_FIELDS).flatMap((owned) => Field.storedLeavesOf(owned));
    expect(leaves.filter((leaf) => !leaf.merge).map((leaf) => leaf.field)).toEqual([]);
  });

  test.each(Object.keys(ENTITY_FIELDS))(
    "of %s declare their kind's keys alone, on fields and groups they name",
    (type) => {
      expect(findIssues(ENTITY_FIELDS[type as keyof typeof ENTITY_FIELDS], "")).toEqual([]);
    },
  );

  test("and a character's, declared alike: their kind's keys alone, a stored field none of the entities' keeps", () => {
    expect(findIssues(CHARACTER_FIELDS, "")).toEqual([]);
    const entities = Object.values(ENTITY_FIELDS).flatMap((owned) => Field.storedLeavesOf(owned));
    const kept = new Set(entities.map((leaf) => leaf.field));
    expect(Field.storedLeavesOf(CHARACTER_FIELDS).filter((leaf) => kept.has(leaf.field))).toEqual([]);
  });
});
