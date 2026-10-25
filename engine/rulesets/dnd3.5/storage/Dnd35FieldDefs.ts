import type { FieldDef, Merge, ValueKind } from "@/engine/core/module/index.ts";

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
 * The fields 3.5's owners keep past their kinds' columns, in their stored values (an entity type's, or a ruleset's
 * Settings), each its owner's type, its name, its value's kind, whether it's a set, and whether an item reads it off
 * its template when it has none.
 */
const VALUE_FIELDS: [ownerType: string, field: string, valueKind: ValueKind, multiple: boolean, inherits: boolean][] = [
  ["feats", "FEAT_FAMILY", "text", true, false],
  ["feats", "FEAT_WEAPON_FINESSE", "flag", false, false],
  ["feats", "FEAT_OVERSIZED_TWO_WEAPON_FIGHTING", "flag", false, false],
  ["feats", "WIZARD_PROHIBITED_SCHOOL", "text", true, false],
  ["items", "WEAPON_TYPE", "text", false, true],
  ["items", "WEAPON_PROFICIENCY", "text", false, true],
  ["items", "WEAPON_FAMILY", "text", false, true],
  ["items", "WEAPON_SIZE", "text", false, true],
  ["items", "WEAPON_BASE_DAMAGE", "text", false, true],
  ["items", "WEAPON_DOUBLE_DAMAGE", "text", false, true],
  ["items", "DAMAGE_TYPE", "text", true, true],
  ["items", "WEAPON_CRITICAL_RANGE", "number", false, true],
  ["items", "WEAPON_CRITICAL_MULTIPLIER", "number", false, true],
  ["items", "WEAPON_STRENGTH_DAMAGE", "text", false, true],
  ["items", "WEAPON_MIGHTY", "number", false, true],
  ["items", "WEAPON_RANGED", "flag", false, true],
  ["items", "WEAPON_RANGE", "number", false, true],
  ["items", "WEAPON_MAX_RANGE_INCREMENTS", "number", false, true],
  ["items", "WEAPON_REACH", "number", false, true],
  ["items", "WEAPON_FINESSABLE", "flag", false, true],
  ["items", "WEAPON_ONE_HAND_TRAINING", "flag", false, true],
  ["items", "WEAPON_ONE_HANDED_PENALTY", "number", false, true],
  ["items", "ARMOR_TYPE", "text", false, true],
  ["items", "ARMOR_PROFICIENCY", "text", false, true],
  ["items", "ARMOR_AC_BONUS", "number", false, true],
  ["items", "SHIELD_TYPE", "text", false, true],
  ["items", "SHIELD_PROFICIENCY", "text", false, true],
  ["items", "SHIELD_AC_BONUS", "number", false, true],
  ["items", "ARMOR_MAX_DEX", "number", false, true],
  ["items", "ARMOR_CHECK_PENALTY", "number", false, true],
  ["items", "ITEM_SPELL_FAILURE", "number", false, true],
  ["items", "ITEM_MASTERWORK", "flag", false, true],
  ["items", "ITEM_MADE_OF", "text", false, true],
  ["items", "ITEM_HAS_CHARGES", "number", false, true],
  ["items", "MAGIC_CASTER_LEVEL", "number", false, true],
  ["items", "MAGIC_AURA", "text", true, true],
  ["classes", "CLASS_CASTER_TYPE", "text", false, false],
  ["class_levels", "CLASS_LEVEL_BAB", "number", false, false],
  ["class_levels", "CLASS_LEVEL_SKILL_POINTS", "number", false, false],
  ["spells", "SPELL_SCHOOL", "text", false, false],
  ["spells", "SPELL_SUBSCHOOL", "text", false, false],
  ["spells", "SPELL_DESCRIPTOR", "text", true, false],
  ["spells", "SPELL_COMPONENT", "text", true, false],
  ["spells", "SPELL_CASTING_TIME", "text", false, false],
  ["spells", "SPELL_RANGE_TYPE", "text", false, false],
  ["spells", "SPELL_TARGET", "text", false, false],
  ["spells", "SPELL_EFFECT", "text", false, false],
  ["spells", "SPELL_AREA_OF_EFFECT", "text", false, false],
  ["spells", "SPELL_DURATION", "text", false, false],
  ["spells", "SPELL_RESISTANCE", "text", false, false],
  ["races", "RACE_SPEED_IGNORES_ENCUMBRANCE", "flag", false, false],
  ["races", "RACE_QUADRUPED", "flag", false, false],
  ["rulesets", "RULESET_FEAT_ADVANCEMENT", "text", true, false],
  ["rulesets", "RULESET_ABILITY_INCREASES", "text", true, false],
  ["skills", "SKILL_IMPACTED_BY_WEIGHT", "flag", false, false],
  ["skills", "SKILL_CHECK_PENALTY_MULTIPLIER", "number", false, false],
  ["skills", "SKILL_USABLE_WITHOUT_TRAINING", "flag", false, false],
];

/** A field's owner's kind, by its type. */
function ownerKindOf(ownerType: string): FieldDef["ownerKind"] {
  if (ownerType === "rulesets") return "ruleset";
  if (ownerType === "characters") return "character";
  return "entity";
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
      ...VALUE_FIELDS.map(([ownerType, field, valueKind, multiple, inherits]): FieldDef => ({
        ownerKind: ownerKindOf(ownerType),
        ownerType,
        field,
        valueKind,
        multiple,
        merge: valueFieldMerge(ownerType, multiple),
        inheritsVia: inherits ? "madeFrom" : null,
      })),
    ];
  }
}
