import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
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

/** An item's fields' values. */
export type ItemFieldValues = FieldValues<typeof ITEM_FIELDS.fields>;

/** A weapon's fields: what its attacks, its groupings and the hands it's held in read. */
export type WeaponFields = ItemFieldValues["weapon"];

/**
 * An item's fields its properties hold, as stored: each none (or empty) without its row, so an item made from a
 * template holds only the fields it overrides, and what the engine does without one (a critical of 1, Strength to damage
 * by the hand) stays where the engine reads it. A flag tells a `"false"` row from none. Read off the item's own rows
 * merged with its template's.
 */
export const ITEM_FIELDS = new FieldCodec({
  armor: Field.group({
    acBonus: Field.number(ARMOR_AC_BONUS),
    proficiency: Field.text(ARMOR_PROFICIENCY),
    type: Field.text(ARMOR_TYPE),
  }),
  /** `ITEM_HAS_CHARGES`: the charges it comes with, none for an item without charges. */
  charges: Field.number(ITEM_HAS_CHARGES),
  /** An armor's or a shield's. */
  checkPenalty: Field.number(ARMOR_CHECK_PENALTY),
  madeOf: Field.text(ITEM_MADE_OF),
  magicAuras: Field.list(MAGIC_AURA),
  magicCasterLevel: Field.number(MAGIC_CASTER_LEVEL),
  masterwork: Field.flag(ITEM_MASTERWORK, { absent: null }),
  /** An armor's, or a tower shield's. */
  maxDex: Field.number(ARMOR_MAX_DEX),
  shield: Field.group({
    acBonus: Field.number(SHIELD_AC_BONUS),
    proficiency: Field.text(SHIELD_PROFICIENCY),
    type: Field.text(SHIELD_TYPE),
  }),
  spellFailure: Field.number(ITEM_SPELL_FAILURE),
  weapon: Field.group({
    baseDamage: Field.text(WEAPON_BASE_DAMAGE),
    criticalMultiplier: Field.number(WEAPON_CRITICAL_MULTIPLIER),
    criticalRange: Field.number(WEAPON_CRITICAL_RANGE),
    damageTypes: Field.list(DAMAGE_TYPE),
    doubleDamage: Field.text(WEAPON_DOUBLE_DAMAGE),
    family: Field.text(WEAPON_FAMILY),
    finessable: Field.flag(WEAPON_FINESSABLE, { absent: null }),
    mighty: Field.number(WEAPON_MIGHTY),
    oneHandedPenalty: Field.number(WEAPON_ONE_HANDED_PENALTY),
    oneHandTraining: Field.flag(WEAPON_ONE_HAND_TRAINING, { absent: null }),
    proficiency: Field.text(WEAPON_PROFICIENCY),
    range: Field.number(WEAPON_RANGE),
    ranged: Field.flag(WEAPON_RANGED, { absent: null }),
    reach: Field.number(WEAPON_REACH),
    size: Field.text(WEAPON_SIZE),
    strengthDamage: Field.text(WEAPON_STRENGTH_DAMAGE),
    type: Field.text(WEAPON_TYPE),
  }),
});
