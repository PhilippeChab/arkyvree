/**
 * Builders the generated and hand-written items are written with: a weapon's, an armor's or the Shield's fields, read
 * off the vocabulary's Weapons and Armor tables by the weapon's or the armor's name, its cost and weight among them.
 */

import { ARMOR_DEFINITIONS, SHIELD_DEFINITION } from "@/vocabulary/dnd5.2/armor.ts";
import {
  ARMOR_CATEGORY,
  ARMOR_CLASS,
  ARMOR_MAX_DEX,
  ARMOR_STEALTH_DISADVANTAGE,
  ARMOR_STRENGTH,
  ARMOR_TYPE,
  ITEM_COST_GP,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  SHIELD_AC_BONUS,
  WEAPON_CATEGORY,
  WEAPON_DAMAGE,
  WEAPON_DAMAGE_TYPE,
  WEAPON_LONG_RANGE,
  WEAPON_MASTERY,
  WEAPON_PROPERTIES,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_TYPE,
  WEAPON_VERSATILE_DAMAGE,
} from "@/vocabulary/dnd5.2/fields/index.ts";
import { WEAPON_DEFINITIONS } from "@/vocabulary/dnd5.2/weapons.ts";

import type { ItemFields } from "./types.ts";

/** An armor's fields, by its name in the Armor table: its type, category, Armor Class, Dexterity cap, Strength, Stealth. */
export function armorFields(name: string): ItemFields {
  const armor = ARMOR_DEFINITIONS[name];
  if (!armor) throw new Error(`No armor named "${name}" in the Armor table`);
  return {
    [ITEM_TYPE]: "Armor",
    [ITEM_SLOT]: "Armor",
    [ITEM_COST_GP]: armor.cost,
    [ITEM_WEIGHT]: armor.weight,
    [ARMOR_TYPE]: name,
    [ARMOR_CATEGORY]: armor.category,
    [ARMOR_CLASS]: armor.armorClass,
    ...(armor.maxDex !== null && { [ARMOR_MAX_DEX]: armor.maxDex }),
    [ARMOR_STRENGTH]: armor.strength,
    [ARMOR_STEALTH_DISADVANTAGE]: armor.stealthDisadvantage,
  };
}

/** The Shield's fields: its +2, its cost and its weight, held in the off hand. */
export function shieldFields(): ItemFields {
  return {
    [ITEM_TYPE]: "Shield",
    [ITEM_SLOT]: "Off Hand",
    [ITEM_COST_GP]: SHIELD_DEFINITION.cost,
    [ITEM_WEIGHT]: SHIELD_DEFINITION.weight,
    [SHIELD_AC_BONUS]: SHIELD_DEFINITION.armorClass,
  };
}

/**
 * A weapon's fields, by its name in the Weapons table: its type, category, damage, properties, range (a ranged or a
 * thrown weapon's), mastery, cost and weight.
 */
export function weaponFields(name: string): ItemFields {
  const weapon = WEAPON_DEFINITIONS[name];
  if (!weapon) throw new Error(`No weapon named "${name}" in the Weapons table`);
  return {
    [ITEM_TYPE]: "Weapon",
    [ITEM_COST_GP]: weapon.cost,
    [ITEM_WEIGHT]: weapon.weight,
    [WEAPON_TYPE]: name,
    [WEAPON_CATEGORY]: weapon.category,
    [WEAPON_DAMAGE]: weapon.damage,
    [WEAPON_DAMAGE_TYPE]: weapon.damageType,
    [WEAPON_PROPERTIES]: [...weapon.properties],
    [WEAPON_RANGED]: weapon.ranged,
    ...(weapon.range && { [WEAPON_RANGE]: weapon.range.normal, [WEAPON_LONG_RANGE]: weapon.range.long }),
    ...(weapon.versatile && { [WEAPON_VERSATILE_DAMAGE]: weapon.versatile }),
    [WEAPON_MASTERY]: weapon.mastery,
  };
}
