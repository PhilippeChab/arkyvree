import { Field, type LeafSpec } from "@/engine/core/fields/index.ts";
import type { FieldDef, Merge, ValueKind } from "@/engine/core/module/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The fields 3.5's kinds' and characters' columns are stored in: each a single value, the winning copy's. */
const COLUMN_FIELDS: [ownerType: string, field: string, valueKind: ValueKind][] = [
  ["classes", "CLASS_HD", "number"],
  ["feats", "FEAT_STACKABLE", "flag"],
  ["feats", "FEAT_SELECTABLE", "flag"],
  ["feats", "FEAT_GENERATED", "flag"],
  ["races", "RACE_SIZE", "text"],
  ["races", "RACE_BASE_SPEED", "number"],
  ["items", "ITEM_WEIGHT", "number"],
  ["items", "ITEM_COST_GP", "number"],
  ["items", "ITEM_TYPE", "text"],
  ["items", "ITEM_SLOT", "text"],
  ["items", "ITEM_IS_TEMPLATE", "flag"],
  ["languages", "LANGUAGE_TYPE", "text"],
  ["spells", "SPELL_SAVE_EFFECT", "text"],
  ["characters", "CHARACTER_XP", "number"],
  ["characters", "CHARACTER_ALIGNMENT", "text"],
  ["characters", "CHARACTER_AGE", "number"],
  ["characters", "CHARACTER_GENDER", "text"],
  ["characters", "CHARACTER_HEIGHT", "text"],
  ["characters", "CHARACTER_WEIGHT", "text"],
  ["characters", "CHARACTER_DEITY", "text"],
];

/**
 * The role of the link an owner type's entities read their declared fields off when they hold none (an item's, off its
 * template): none for the others.
 */
const INHERITS_VIA: Readonly<Record<string, string>> = { items: "madeFrom" };

/**
 * The fields 3.5's owners keep past their kinds' columns, in their stored values (an entity type's, or a ruleset's
 * Settings), as its vocabulary declares them (`ENTITY_FIELDS`, a reference's aside: a link keeps it), in their order:
 * each a set when it's a list or a progression, read off its template by an item that has none.
 */
function declaredFieldDefs(): FieldDef[] {
  return Object.entries(ENTITY_FIELDS).flatMap(([ownerType, fields]) =>
    Field.leavesOf(fields).flatMap((leaf): FieldDef[] => {
      if (leaf.kind === "ref") return [];
      const { multiple, valueKind } = storedKindOf(leaf);
      return [
        {
          ownerKind: ownerKindOf(ownerType),
          ownerType,
          field: leaf.field,
          valueKind,
          multiple,
          merge: valueFieldMerge(ownerType, multiple),
          inheritsVia: INHERITS_VIA[ownerType] ?? null,
        },
      ];
    }),
  );
}

/** A field's owner's kind, by its type. */
function ownerKindOf(ownerType: string): FieldDef["ownerKind"] {
  if (ownerType === "rulesets") return "ruleset";
  if (ownerType === "characters") return "character";
  return "entity";
}

/**
 * How a declared field's values are stored, by its kind: the kind of value each is (a flag's, a number's, text), and
 * whether it's a set (a list's, a progression's). A kind this doesn't name fails to type-check, never stores as text.
 */
function storedKindOf(leaf: Exclude<LeafSpec, { kind: "ref" }>): { multiple: boolean; valueKind: ValueKind } {
  switch (leaf.kind) {
    case "flag":
    case "number":
      return { multiple: false, valueKind: leaf.kind };
    case "choice":
    case "text":
      return { multiple: false, valueKind: "text" };
    case "list":
    case "progression":
      return { multiple: true, valueKind: "text" };
    default: {
      const unknown: never = leaf;
      throw new Error(`No stored kind for the field ${JSON.stringify(unknown)}`);
    }
  }
}

/**
 * How a field kept past its kind's columns merges across sibling copies: a ruleset's setting is the nearest ruleset's
 * in its chain, whole; a set unions its siblings' values; a single value is the winning copy's, else a sibling's.
 */
function valueFieldMerge(ownerType: string, multiple: boolean): Merge {
  if (ownerType === "rulesets") return "winner";
  return multiple ? "union" : "fallback";
}

/**
 * 3.5's fields, the field definitions' registry rows: its columns' (each a single value, the winning copy's) and those
 * its owners keep past them (a set's values union across sibling copies, a single value is the winning copy's else a
 * sibling's).
 */
export default class Dnd35FieldDefs {
  /** Every field definition 3.5 declares. */
  static build(): FieldDef[] {
    return [
      ...COLUMN_FIELDS.map(([ownerType, field, valueKind]): FieldDef => ({
        ownerKind: ownerKindOf(ownerType),
        ownerType,
        field,
        valueKind,
        multiple: false,
        merge: "winner",
        inheritsVia: null,
      })),
      ...declaredFieldDefs(),
    ];
  }
}
