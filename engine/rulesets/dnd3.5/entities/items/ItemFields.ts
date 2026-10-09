import type { PropertyValue } from "@/engine/core/module/index.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  DAMAGE_TYPE,
  ITEM_HAS_CHARGES,
  ITEM_MADE_OF,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_DOUBLE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_FINESSABLE,
  WEAPON_MIGHTY,
  WEAPON_ONE_HAND_TRAINING,
  WEAPON_ONE_HANDED_PENALTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
  WEAPON_TYPE,
} from "@/shared/dnd3.5/properties/index.ts";

/** An armor's or a shield's own fields: its AC bonus, the proficiency it takes and its type. */
type ProtectionFields = { acBonus: number | null; proficiency: string | null; type: string | null };

/** A row's type and value, as `toItemProperties` writes them. */
type Row = [type: string, value: string];

/**
 * An item's fields its properties hold, as stored: each null (or empty) without its row, so an item made from a
 * template holds only the fields it overrides, and what the engine does without one (a critical of 1, Strength to
 * damage by the hand) stays where the engine reads it.
 */
export type ItemFieldValues = {
  armor: ProtectionFields;
  /** `ITEM_HAS_CHARGES`: the charges it comes with, null for an item without charges. */
  charges: number | null;
  /** `ARMOR_CHECK_PENALTY`: an armor's or a shield's. */
  checkPenalty: number | null;
  madeOf: string | null;
  magicAuras: string[];
  magicCasterLevel: number | null;
  masterwork: boolean | null;
  /** `ARMOR_MAX_DEX`: an armor's, or a tower shield's. */
  maxDex: number | null;
  shield: ProtectionFields;
  spellFailure: number | null;
  weapon: WeaponFields;
};

/** A weapon's fields: what its attacks, its groupings and the hands it's held in read. */
export type WeaponFields = {
  baseDamage: string | null;
  criticalMultiplier: number | null;
  criticalRange: number | null;
  damageTypes: string[];
  doubleDamage: string | null;
  family: string | null;
  finessable: boolean | null;
  mighty: number | null;
  oneHandedPenalty: number | null;
  oneHandTraining: boolean | null;
  proficiency: string | null;
  range: number | null;
  ranged: boolean | null;
  reach: number | null;
  size: string | null;
  strengthDamage: string | null;
  type: string | null;
};

const NO_PROTECTION_FIELDS: ProtectionFields = { acBonus: null, proficiency: null, type: null };

/** The property types an item's fields are stored as. */
export const ITEM_FIELD_PROPERTY_TYPES = [
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  DAMAGE_TYPE,
  ITEM_HAS_CHARGES,
  ITEM_MADE_OF,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_DOUBLE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_FINESSABLE,
  WEAPON_MIGHTY,
  WEAPON_ONE_HAND_TRAINING,
  WEAPON_ONE_HANDED_PENALTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
  WEAPON_TYPE,
];

/** The fields of a weapon with none of its properties. */
export const NO_WEAPON_FIELDS: WeaponFields = {
  baseDamage: null,
  criticalMultiplier: null,
  criticalRange: null,
  damageTypes: [],
  doubleDamage: null,
  family: null,
  finessable: null,
  mighty: null,
  oneHandedPenalty: null,
  oneHandTraining: null,
  proficiency: null,
  range: null,
  ranged: null,
  reach: null,
  size: null,
  strengthDamage: null,
  type: null,
};

/** The fields of an item with none of its properties. */
export const NO_ITEM_FIELDS: ItemFieldValues = {
  armor: NO_PROTECTION_FIELDS,
  charges: null,
  checkPenalty: null,
  madeOf: null,
  magicAuras: [],
  magicCasterLevel: null,
  masterwork: null,
  maxDex: null,
  shield: NO_PROTECTION_FIELDS,
  spellFailure: null,
  weapon: NO_WEAPON_FIELDS,
};

/** A flag's value: true once any of its rows says so. */
function flag(current: boolean | null, value: string): boolean {
  return current === true || value === "true";
}

/** The row of a field that has a value: none without one. */
function optional(type: string, value: string | number | boolean | null): Row[] {
  return value === null ? [] : [[type, String(value)]];
}

/** An item-level field of this row, read into `fields`: whether the row was one. */
function readItemLevelField(fields: ItemFieldValues, type: string, value: string): boolean {
  switch (type) {
    case ARMOR_CHECK_PENALTY:
      fields.checkPenalty ??= Number(value);
      return true;
    case ARMOR_MAX_DEX:
      fields.maxDex ??= Number(value);
      return true;
    case ITEM_HAS_CHARGES:
      fields.charges ??= Number(value);
      return true;
    case ITEM_MADE_OF:
      fields.madeOf ??= value;
      return true;
    case ITEM_MASTERWORK:
      fields.masterwork = flag(fields.masterwork, value);
      return true;
    case ITEM_SPELL_FAILURE:
      fields.spellFailure ??= Number(value);
      return true;
    case MAGIC_AURA:
      fields.magicAuras.push(value);
      return true;
    case MAGIC_CASTER_LEVEL:
      fields.magicCasterLevel ??= Number(value);
      return true;
    default:
      return false;
  }
}

/** An armor's or a shield's field of this row, read into `fields`: whether the row was one. */
function readProtectionField(fields: ItemFieldValues, type: string, value: string): boolean {
  switch (type) {
    case ARMOR_AC_BONUS:
      fields.armor.acBonus ??= Number(value);
      return true;
    case ARMOR_PROFICIENCY:
      fields.armor.proficiency ??= value;
      return true;
    case ARMOR_TYPE:
      fields.armor.type ??= value;
      return true;
    case SHIELD_AC_BONUS:
      fields.shield.acBonus ??= Number(value);
      return true;
    case SHIELD_PROFICIENCY:
      fields.shield.proficiency ??= value;
      return true;
    case SHIELD_TYPE:
      fields.shield.type ??= value;
      return true;
    default:
      return false;
  }
}

/** A weapon's field of this row, read into `weapon`: whether the row was one. */
function readWeaponField(weapon: WeaponFields, type: string, value: string): boolean {
  switch (type) {
    case DAMAGE_TYPE:
      weapon.damageTypes.push(value);
      return true;
    case WEAPON_BASE_DAMAGE:
      weapon.baseDamage ??= value;
      return true;
    case WEAPON_CRITICAL_MULTIPLIER:
      weapon.criticalMultiplier ??= Number(value);
      return true;
    case WEAPON_CRITICAL_RANGE:
      weapon.criticalRange ??= Number(value);
      return true;
    case WEAPON_DOUBLE_DAMAGE:
      weapon.doubleDamage ??= value;
      return true;
    case WEAPON_FAMILY:
      weapon.family ??= value;
      return true;
    case WEAPON_FINESSABLE:
      weapon.finessable = flag(weapon.finessable, value);
      return true;
    case WEAPON_MIGHTY:
      weapon.mighty ??= Number(value);
      return true;
    case WEAPON_ONE_HAND_TRAINING:
      weapon.oneHandTraining = flag(weapon.oneHandTraining, value);
      return true;
    case WEAPON_ONE_HANDED_PENALTY:
      weapon.oneHandedPenalty ??= Number(value);
      return true;
    default:
      return readWeaponHandling(weapon, type, value);
  }
}

/** A weapon's field of this row about how it's used (range, reach, size, Strength), read into `weapon`. */
function readWeaponHandling(weapon: WeaponFields, type: string, value: string): boolean {
  switch (type) {
    case WEAPON_PROFICIENCY:
      weapon.proficiency ??= value;
      return true;
    case WEAPON_RANGE:
      weapon.range ??= Number(value);
      return true;
    case WEAPON_RANGED:
      weapon.ranged = flag(weapon.ranged, value);
      return true;
    case WEAPON_REACH:
      weapon.reach ??= Number(value);
      return true;
    case WEAPON_SIZE:
      weapon.size ??= value;
      return true;
    case WEAPON_STRENGTH_DAMAGE:
      weapon.strengthDamage ??= value;
      return true;
    case WEAPON_TYPE:
      weapon.type ??= value;
      return true;
    default:
      return false;
  }
}

/** The rows of an item's own fields, an armor's and a shield's. */
function toItemLevelRows(fields: ItemFieldValues): Row[] {
  return [
    ...optional(ARMOR_AC_BONUS, fields.armor.acBonus),
    ...optional(ARMOR_CHECK_PENALTY, fields.checkPenalty),
    ...optional(ARMOR_MAX_DEX, fields.maxDex),
    ...optional(ARMOR_PROFICIENCY, fields.armor.proficiency),
    ...optional(ARMOR_TYPE, fields.armor.type),
    ...optional(ITEM_HAS_CHARGES, fields.charges),
    ...optional(ITEM_MADE_OF, fields.madeOf),
    ...optional(ITEM_MASTERWORK, fields.masterwork),
    ...optional(ITEM_SPELL_FAILURE, fields.spellFailure),
    ...fields.magicAuras.map((aura): Row => [MAGIC_AURA, aura]),
    ...optional(MAGIC_CASTER_LEVEL, fields.magicCasterLevel),
    ...optional(SHIELD_AC_BONUS, fields.shield.acBonus),
    ...optional(SHIELD_PROFICIENCY, fields.shield.proficiency),
    ...optional(SHIELD_TYPE, fields.shield.type),
  ];
}

/** The rows of a weapon's fields. */
function toWeaponRows(weapon: WeaponFields): Row[] {
  return [
    ...weapon.damageTypes.map((damageType): Row => [DAMAGE_TYPE, damageType]),
    ...optional(WEAPON_BASE_DAMAGE, weapon.baseDamage),
    ...optional(WEAPON_CRITICAL_MULTIPLIER, weapon.criticalMultiplier),
    ...optional(WEAPON_CRITICAL_RANGE, weapon.criticalRange),
    ...optional(WEAPON_DOUBLE_DAMAGE, weapon.doubleDamage),
    ...optional(WEAPON_FAMILY, weapon.family),
    ...optional(WEAPON_FINESSABLE, weapon.finessable),
    ...optional(WEAPON_MIGHTY, weapon.mighty),
    ...optional(WEAPON_ONE_HAND_TRAINING, weapon.oneHandTraining),
    ...optional(WEAPON_ONE_HANDED_PENALTY, weapon.oneHandedPenalty),
    ...optional(WEAPON_PROFICIENCY, weapon.proficiency),
    ...optional(WEAPON_RANGE, weapon.range),
    ...optional(WEAPON_RANGED, weapon.ranged),
    ...optional(WEAPON_REACH, weapon.reach),
    ...optional(WEAPON_SIZE, weapon.size),
    ...optional(WEAPON_STRENGTH_DAMAGE, weapon.strengthDamage),
    ...optional(WEAPON_TYPE, weapon.type),
  ];
}

/** An item's fields: read off its properties, and the properties they're kept in. */
export default class ItemFields {
  /**
   * An item's fields, read off the rows of its properties (its own merged with its template's): each from the first row
   * of its type, a flag true once a row says so, the damage types and magic auras all of theirs, in one pass.
   */
  static read(properties: { type: string; value: string }[]): ItemFieldValues {
    const fields: ItemFieldValues = {
      ...NO_ITEM_FIELDS,
      armor: { ...NO_PROTECTION_FIELDS },
      magicAuras: [],
      shield: { ...NO_PROTECTION_FIELDS },
      weapon: { ...NO_WEAPON_FIELDS, damageTypes: [] },
    };
    for (const { type, value } of properties) {
      if (!readWeaponField(fields.weapon, type, value) && !readProtectionField(fields, type, value))
        readItemLevelField(fields, type, value);
    }
    return fields;
  }

  /**
   * An item's fields as the rows of its properties: one per field that has a value, one per damage type and aura. A flag
   * is written as stored, `"false"` too.
   */
  static toProperties(fields: ItemFieldValues): PropertyValue[] {
    return [...toItemLevelRows(fields), ...toWeaponRows(fields.weapon)].map(([type, value]) => ({ type, value }));
  }
}
