/** Builders the generated items are written with: their weapon's, armor's or shield's fields, by its type's name. */

import { ARMOR_TYPE_DEFINITIONS, SHIELD_TYPE_DEFINITIONS } from "@/vocabulary/dnd3.5/armor.ts";
import { WEAPON_TYPE_DEFINITIONS } from "@/vocabulary/dnd3.5/weapons.ts";

import type { ItemFields } from "./types.ts";

/** An armor's fields, its type's (`ARMOR_TYPE_DEFINITIONS`): its type, proficiency and bonus, and what it hinders. */
export function armorFields(armorTypeName: string): ItemFields {
  const def = ARMOR_TYPE_DEFINITIONS[armorTypeName];
  if (!def) throw new Error(`Unknown armor type: ${armorTypeName}`);

  return {
    armor: { type: armorTypeName, proficiency: def.armorType, acBonus: def.acBonus },
    maxDex: def.maxDex,
    checkPenalty: def.checkPenalty,
    spellFailure: def.spellFailure,
  };
}

/** A shield's fields, its type's (`SHIELD_TYPE_DEFINITIONS`): its type, proficiency and bonus, and what it hinders. */
export function shieldFields(shieldTypeName: string): ItemFields {
  const def = SHIELD_TYPE_DEFINITIONS[shieldTypeName];
  if (!def) throw new Error(`Unknown shield type: ${shieldTypeName}`);

  return {
    shield: { type: shieldTypeName, proficiency: def.shieldType, acBonus: def.acBonus },
    checkPenalty: def.checkPenalty,
    spellFailure: def.spellFailure,
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
    weapon: {
      type: weaponTypeName,
      proficiency: def.proficiency,
      family: def.family,
      size: def.size,
      baseDamage: def.baseDamage,
      ...(def.doubleDamage ? { doubleDamage: def.doubleDamage } : {}),
      damageTypes: [...def.damageTypes],
      criticalRange: def.criticalRange,
      criticalMultiplier: def.criticalMultiplier,
      ...(def.strengthDamage ? { strengthDamage: def.strengthDamage } : {}),
      ...(def.mighty !== undefined ? { mighty: def.mighty } : {}),
      ...(def.ranged ? { ranged: true } : {}),
      ...(def.range && def.range > 0 ? { range: def.range } : {}),
      ...(def.maxRangeIncrements ? { maxRangeIncrements: def.maxRangeIncrements } : {}),
      ...(def.reach && def.reach > 0 ? { reach: def.reach } : {}),
      finessable: def.finessable ?? false,
      ...(def.oneHandTraining ? { oneHandTraining: true } : {}),
      ...(def.oneHandedPenalty ? { oneHandedPenalty: def.oneHandedPenalty } : {}),
    },
  };
}

/**
 * An item's fields: those of `base`, `own`'s over them, a weapon's, an armor's or a shield's field by field (a specific
 * armor's own stats over its base armor's).
 */
export function withOwnFields(base: ItemFields, own: ItemFields): ItemFields {
  return {
    ...base,
    ...own,
    ...(own.weapon && { weapon: { ...base.weapon, ...own.weapon } }),
    ...(own.armor && { armor: { ...base.armor, ...own.armor } }),
    ...(own.shield && { shield: { ...base.shield, ...own.shield } }),
  };
}
