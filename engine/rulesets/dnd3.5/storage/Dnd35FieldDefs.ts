import { Field, type Fields } from "@/engine/core/fields/index.ts";
import type { FieldDef } from "@/engine/core/module/index.ts";
import { CHARACTER_FIELDS, ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * 3.5's fields' registry rows: each field its vocabulary declares of an owner (an entity type's, a ruleset's Settings',
 * `ENTITY_FIELDS`, and its characters', `CHARACTER_FIELDS`; but a reference's, which a single link keeps), each with
 * its owner's kind, the kind of value it holds and whether it's a set (a list's, a progression's).
 */
export default class Dnd35FieldDefs {
  /** The registry rows of an owner type's fields (`fields`), of its owner's kind (`ownerKind`). */
  private static defsOf(ownerKind: FieldDef["ownerKind"], ownerType: string, fields: Fields): FieldDef[] {
    return Field.storedLeavesOf(fields).map((leaf) => ({
      ownerKind,
      ownerType,
      field: leaf.field,
      ...Field.storedKindOf(leaf),
    }));
  }

  /** Every field definition 3.5 declares. */
  static build(): FieldDef[] {
    return [
      ...Object.entries(ENTITY_FIELDS).flatMap(([ownerType, fields]) =>
        Dnd35FieldDefs.defsOf(ownerType === "rulesets" ? "ruleset" : "entity", ownerType, fields),
      ),
      ...Dnd35FieldDefs.defsOf("character", "characters", CHARACTER_FIELDS),
    ];
  }
}
