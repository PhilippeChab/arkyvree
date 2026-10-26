import { Field } from "@/engine/core/fields/index.ts";
import type { FieldDef } from "@/engine/core/module/index.ts";
import { CHARACTER_FIELDS } from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * 3.5's fields' registry rows: each field its vocabulary declares of an owner (an entity type's, a ruleset's Settings',
 * `ENTITY_FIELDS`, but a reference's, which a single link keeps), then its characters' (`CHARACTER_FIELDS`), each with
 * its owner's kind, the kind of value it holds and whether it's a set (a list's, a progression's).
 */
export default class Dnd35FieldDefs {
  /** Every field definition 3.5 declares. */
  static build(): FieldDef[] {
    return [
      ...Object.entries(ENTITY_FIELDS).flatMap(([ownerType, fields]) =>
        Field.storedLeavesOf(fields).map((leaf): FieldDef => ({
          ownerKind: ownerType === "rulesets" ? "ruleset" : "entity",
          ownerType,
          field: leaf.field,
          ...Field.storedKindOf(leaf),
        })),
      ),
      ...Object.entries(CHARACTER_FIELDS).map(([field, { kind }]): FieldDef => ({
        ownerKind: "character",
        ownerType: "characters",
        field,
        valueKind: kind,
        multiple: false,
      })),
    ];
  }
}
