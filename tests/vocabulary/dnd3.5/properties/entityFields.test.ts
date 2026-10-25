import { describe, expect, test } from "bun:test";

import Field, { type Fields, type FieldSpec } from "@/engine/core/fields/Field.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/entityFields.ts";

/** The keys each kind of field declares: what a codec reads of it, and no other (a misspelled key reads as none). */
const KEYS: { [K in FieldSpec["kind"]]: readonly (keyof Extract<FieldSpec, { kind: K }>)[] } = {
  choice: ["description", "field", "kind", "label", "shownIn", "values", "when"],
  flag: ["absent", "description", "field", "kind", "label", "shownIn", "when"],
  group: ["fields", "kind", "label", "shownIn", "when"],
  list: ["description", "field", "kind", "label", "placeholder", "shownIn", "values", "when"],
  number: ["default", "description", "field", "kind", "label", "max", "min", "shownIn", "when", "write"],
  progression: ["default", "description", "field", "kind", "label", "levels", "max", "shownIn", "when"],
  ref: ["description", "kind", "label", "references", "required", "role", "shownIn", "when"],
  text: ["description", "field", "kind", "label", "placeholder", "shownIn", "values", "when"],
};

/**
 * What's wrong with the fields at a level (`fields`, under `path`), a group's too: a key its kind doesn't declare, a
 * condition on no field at its level, a section that's no group at its level.
 */
function findIssues(fields: Fields, path: string): string[] {
  const groups = Object.keys(fields).filter((name) => fields[name]?.kind === "group");
  return Object.entries(fields).flatMap(([name, field]) => [
    ...Object.keys(field)
      .filter((key) => !(KEYS[field.kind] as readonly string[]).includes(key))
      .map((key) => `${path}${name}: ${key}`),
    ...(field.when && "field" in field.when && !(field.when.field in fields) ? [`${path}${name}: when`] : []),
    ...(field.shownIn ?? []).filter((group) => !groups.includes(group)).map((group) => `${path}${name}: ${group}`),
    ...(field.kind === "group" ? findIssues(field.fields, `${path}${name}.`) : []),
  ]);
}

describe("The 3.5 entities' fields", () => {
  test("declare each stored field once, across every entity type", () => {
    const fields = Object.values(ENTITY_FIELDS).flatMap((owned) =>
      Field.leavesOf(owned).flatMap((leaf) => (leaf.kind === "ref" ? [] : [leaf.field])),
    );
    expect(fields.filter((field, index) => fields.indexOf(field) !== index)).toEqual([]);
  });

  test.each(Object.keys(ENTITY_FIELDS))(
    "of %s declare their kind's keys alone, on fields and groups they name",
    (type) => {
      expect(findIssues(ENTITY_FIELDS[type as keyof typeof ENTITY_FIELDS], "")).toEqual([]);
    },
  );
});
