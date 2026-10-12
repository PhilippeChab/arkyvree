import { describe, expect, test } from "bun:test";

import type { FieldCodec, Fields, FieldSpec } from "@/engine/core/fields/index.ts";
import Dnd35PropertyTypes from "@/engine/rulesets/dnd3.5/Dnd35PropertyTypes.ts";
import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import { POWER_FIELDS } from "@/engine/rulesets/dnd3.5/entities/powers/fields.ts";
import { RACE_FIELDS } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import { SKILL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";
import { PROPERTY_ENTITY_TYPES, type PropertyEntityType } from "@/shared/customization/entities.ts";

/** Each entity type's fields, the codec its kind keeps them by. */
const CODECS: Record<PropertyEntityType, FieldCodec<Fields>> = {
  feats: FEAT_FIELDS,
  items: ITEM_FIELDS,
  klass_levels: CLASS_LEVEL_FIELDS,
  klasses: CLASS_FIELDS,
  powers: POWER_FIELDS,
  races: RACE_FIELDS,
  rulesets: RULESET_FIELDS,
  skills: SKILL_FIELDS,
};

const PROPERTY_TYPES = new Dnd35PropertyTypes();

/** A spec's fields that hold a value of their own, a group's too. */
function leavesOf(fields: Fields): Exclude<FieldSpec, { kind: "group" }>[] {
  return Object.values(fields).flatMap((field) => (field.kind === "group" ? leavesOf(field.fields) : [field]));
}

describe("The 3.5 property types", () => {
  test.each([...PROPERTY_ENTITY_TYPES])("of %s are its form's fields: each a field, and no other", (entityType) => {
    const declared = Object.keys(PROPERTY_TYPES.getDeclarations(entityType));
    expect(declared.toSorted()).toEqual(CODECS[entityType].types.toSorted());
  });

  test("label each type, and close a choice's values as its field does", () => {
    for (const [entityType, codec] of Object.entries(CODECS)) {
      for (const [type, declaration] of Object.entries(
        PROPERTY_TYPES.getDeclarations(entityType as PropertyEntityType),
      ))
        expect([type, declaration.label.length > 0, declaration.description.length > 0]).toEqual([type, true, true]);
      for (const field of leavesOf(codec.fields)) {
        if (field.kind === "choice") expect(PROPERTY_TYPES.getValues(field.type)).toEqual([...field.values]);
        // A reference names an entity by its id: never a list's value
        if (field.kind === "ref") {
          expect(PROPERTY_TYPES.getReferencedEntityType(field.type)).not.toBeNull();
          expect(PROPERTY_TYPES.getValues(field.type)).toBeNull();
        }
      }
    }
  });

  test("leave out the spell's types no data holds: its level and saving throw, its material and duration type", () => {
    const dropped = ["SPELL_LEVEL", "SPELL_SAVING_THROW", "SPELL_MATERIAL", "SPELL_DURATION_TYPE"];
    const declared = Object.keys(PROPERTY_TYPES.getDeclarations());
    expect(dropped.filter((type) => declared.includes(type) || PROPERTY_TYPES.getValues(type))).toEqual([]);
  });
});
