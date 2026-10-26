/** Builders the generated items are written with: their weapon's, armor's or shield's fields, by its type's name. */

import { ARMOR_TYPE_DEFINITIONS, SHIELD_TYPE_DEFINITIONS } from "@/vocabulary/dnd3.5/armor.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  DAMAGE_TYPE,
  ITEM_SPELL_FAILURE,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_DOUBLE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_FINESSABLE,
  WEAPON_MAX_RANGE_INCREMENTS,
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
} from "@/vocabulary/dnd3.5/fields/index.ts";
import { WEAPON_TYPE_DEFINITIONS } from "@/vocabulary/dnd3.5/weapons.ts";

import type { ItemFields } from "./types.ts";

/** An armor's fields, its type's (`ARMOR_TYPE_DEFINITIONS`): its type, proficiency and bonus, and what it hinders. */
export function armorFields(armorTypeName: string): ItemFields {
  const def = ARMOR_TYPE_DEFINITIONS[armorTypeName];
  if (!def) throw new Error(`Unknown armor type: ${armorTypeName}`);

  return {
    [ARMOR_TYPE]: armorTypeName,
    [ARMOR_PROFICIENCY]: def.armorType,
    [ARMOR_AC_BONUS]: def.acBonus,
    [ARMOR_MAX_DEX]: def.maxDex,
    [ARMOR_CHECK_PENALTY]: def.checkPenalty,
    [ITEM_SPELL_FAILURE]: def.spellFailure,
  };
}

/** A shield's fields, its type's (`SHIELD_TYPE_DEFINITIONS`): its type, proficiency and bonus, and what it hinders. */
export function shieldFields(shieldTypeName: string): ItemFields {
  const def = SHIELD_TYPE_DEFINITIONS[shieldTypeName];
  if (!def) throw new Error(`Unknown shield type: ${shieldTypeName}`);

  return {
    [SHIELD_TYPE]: shieldTypeName,
    [SHIELD_PROFICIENCY]: def.shieldType,
    [SHIELD_AC_BONUS]: def.acBonus,
    [ARMOR_CHECK_PENALTY]: def.checkPenalty,
    [ITEM_SPELL_FAILURE]: def.spellFailure,
  };
}

/**
 * A weapon's fields, its type's (`WEAPON_TYPE_DEFINITIONS`): those its table gives, and none of those it leaves out (a
 * range of 0, no reach).
 */
export function weaponFields(weaponTypeName: string): ItemFields {
  const def = WEAPON_TYPE_DEFINITIONS[weaponTypeName];
  if (!def) throw new Error(`Unknown weapon type: ${weaponTypeName}`);

  return {
    [WEAPON_TYPE]: weaponTypeName,
    [WEAPON_PROFICIENCY]: def.proficiency,
    [WEAPON_FAMILY]: def.family,
    [WEAPON_SIZE]: def.size,
    [WEAPON_BASE_DAMAGE]: def.baseDamage,
    ...(def.doubleDamage ? { [WEAPON_DOUBLE_DAMAGE]: def.doubleDamage } : {}),
    [DAMAGE_TYPE]: [...def.damageTypes],
    [WEAPON_CRITICAL_RANGE]: def.criticalRange,
    [WEAPON_CRITICAL_MULTIPLIER]: def.criticalMultiplier,
    ...(def.strengthDamage ? { [WEAPON_STRENGTH_DAMAGE]: def.strengthDamage } : {}),
    ...(def.mighty !== undefined ? { [WEAPON_MIGHTY]: def.mighty } : {}),
    ...(def.ranged ? { [WEAPON_RANGED]: true } : {}),
    ...(def.range && def.range > 0 ? { [WEAPON_RANGE]: def.range } : {}),
    ...(def.maxRangeIncrements ? { [WEAPON_MAX_RANGE_INCREMENTS]: def.maxRangeIncrements } : {}),
    ...(def.reach && def.reach > 0 ? { [WEAPON_REACH]: def.reach } : {}),
    [WEAPON_FINESSABLE]: def.finessable ?? false,
    ...(def.oneHandTraining ? { [WEAPON_ONE_HAND_TRAINING]: true } : {}),
    ...(def.oneHandedPenalty ? { [WEAPON_ONE_HANDED_PENALTY]: def.oneHandedPenalty } : {}),
  };
}
