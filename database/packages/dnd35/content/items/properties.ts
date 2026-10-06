/** Builders the generated items are written with: their weapon, armor or shield properties. */

import type { Property } from "@/database/packages/dnd35/content/customization/types.ts";
import { getArmorDefinition, getShieldDefinition } from "@/server/rulesets/dnd3.5/hooks/generators/armorGenerator.ts";
import { getWeaponDefinition } from "@/server/rulesets/dnd3.5/hooks/generators/weaponGenerator.ts";
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

export function armorProperties(armorTypeName: string): Property[] {
  const def = getArmorDefinition(armorTypeName);
  if (!def) throw new Error(`Unknown armor type: ${armorTypeName}`);

  return [
    { type: ARMOR_PROFICIENCY, value: def.armorType },
    { type: ARMOR_TYPE, value: armorTypeName },
    { type: ARMOR_AC_BONUS, value: String(def.acBonus) },
    { type: ARMOR_MAX_DEX, value: String(def.maxDex) },
    { type: ARMOR_CHECK_PENALTY, value: String(def.checkPenalty) },
    { type: ITEM_SPELL_FAILURE, value: String(def.spellFailure) },
  ];
}

export function shieldProperties(shieldTypeName: string): Property[] {
  const def = getShieldDefinition(shieldTypeName);
  if (!def) throw new Error(`Unknown shield type: ${shieldTypeName}`);

  return [
    { type: SHIELD_PROFICIENCY, value: def.shieldType },
    { type: SHIELD_TYPE, value: shieldTypeName },
    { type: SHIELD_AC_BONUS, value: String(def.acBonus) },
    { type: ARMOR_CHECK_PENALTY, value: String(def.checkPenalty) },
    { type: ITEM_SPELL_FAILURE, value: String(def.spellFailure) },
  ];
}

export function weaponProperties(weaponTypeName: string): Property[] {
  const def = getWeaponDefinition(weaponTypeName);
  if (!def) throw new Error(`Unknown weapon type: ${weaponTypeName}`);

  const props: Property[] = [
    { type: WEAPON_PROFICIENCY, value: def.proficiency },
    { type: WEAPON_FAMILY, value: def.family },
    { type: WEAPON_BASE_DAMAGE, value: def.baseDamage },
    { type: WEAPON_CRITICAL_RANGE, value: String(def.criticalRange) },
    { type: WEAPON_CRITICAL_MULTIPLIER, value: String(def.criticalMultiplier) },
    ...(def.strengthDamage ? [{ type: WEAPON_STRENGTH_DAMAGE, value: def.strengthDamage }] : []),
    ...(def.mighty !== undefined ? [{ type: WEAPON_MIGHTY, value: String(def.mighty) }] : []),
    ...(def.oneHandedPenalty ? [{ type: WEAPON_ONE_HANDED_PENALTY, value: String(def.oneHandedPenalty) }] : []),
    ...(def.oneHandTraining ? [{ type: WEAPON_ONE_HAND_TRAINING, value: "true" }] : []),
    ...(def.doubleDamage ? [{ type: WEAPON_DOUBLE_DAMAGE, value: def.doubleDamage }] : []),
    ...def.damageTypes.map((dt) => ({ type: DAMAGE_TYPE, value: dt })),
    { type: WEAPON_SIZE, value: def.size },
    { type: WEAPON_FINESSABLE, value: def.finessable ? "true" : "false" },
    { type: WEAPON_TYPE, value: weaponTypeName },
  ];

  if (def.range && def.range > 0) {
    props.push({ type: WEAPON_RANGE, value: String(def.range) });
  }
  if (def.ranged) {
    props.push({ type: WEAPON_RANGED, value: "true" });
  }
  if (def.reach && def.reach > 0) {
    props.push({ type: WEAPON_REACH, value: String(def.reach) });
  }

  return props;
}
