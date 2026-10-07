/** The armor and shield tables: each base armor and shield type's definition, which its properties are read from. */

type ArmorCategory = "Light" | "Medium" | "Heavy";
interface ArmorDefinition {
  acBonus: number;
  armorType: ArmorCategory;
  checkPenalty: number;
  maxDex: number;
  spellFailure: number;
}

type ShieldCategory = "Light" | "Heavy" | "Tower";

interface ShieldDefinition {
  acBonus: number;
  checkPenalty: number;
  shieldType: ShieldCategory;
  spellFailure: number;
}

/**
 * Each entry is the canonical definition for a base armor type. All properties are derived from selecting an armor type
 * name.
 */
const ARMOR_TYPE_DEFINITIONS: Record<string, ArmorDefinition> = {
  "Padded Armor": { armorType: "Light", acBonus: 1, maxDex: 8, checkPenalty: 0, spellFailure: 5 },
  "Leather Armor": { armorType: "Light", acBonus: 2, maxDex: 6, checkPenalty: 0, spellFailure: 10 },
  "Studded Leather": { armorType: "Light", acBonus: 3, maxDex: 5, checkPenalty: -1, spellFailure: 15 },
  "Chain Shirt": { armorType: "Light", acBonus: 4, maxDex: 4, checkPenalty: -2, spellFailure: 20 },
  "Hide Armor": { armorType: "Medium", acBonus: 3, maxDex: 4, checkPenalty: -3, spellFailure: 20 },
  "Scale Mail": { armorType: "Medium", acBonus: 4, maxDex: 3, checkPenalty: -4, spellFailure: 25 },
  "Chain Mail": { armorType: "Medium", acBonus: 5, maxDex: 2, checkPenalty: -5, spellFailure: 30 },
  Breastplate: { armorType: "Medium", acBonus: 5, maxDex: 3, checkPenalty: -4, spellFailure: 25 },
  "Splint Mail": { armorType: "Heavy", acBonus: 6, maxDex: 0, checkPenalty: -7, spellFailure: 40 },
  "Banded Mail": { armorType: "Heavy", acBonus: 6, maxDex: 1, checkPenalty: -6, spellFailure: 35 },
  "Half-Plate": { armorType: "Heavy", acBonus: 7, maxDex: 0, checkPenalty: -7, spellFailure: 40 },
  "Full Plate": { armorType: "Heavy", acBonus: 8, maxDex: 1, checkPenalty: -6, spellFailure: 35 },
};

const SHIELD_TYPE_DEFINITIONS: Record<string, ShieldDefinition> = {
  Buckler: { shieldType: "Light", acBonus: 1, checkPenalty: -1, spellFailure: 5 },
  "Light Wooden Shield": { shieldType: "Light", acBonus: 1, checkPenalty: -1, spellFailure: 5 },
  "Light Steel Shield": { shieldType: "Light", acBonus: 1, checkPenalty: -1, spellFailure: 5 },
  "Heavy Wooden Shield": { shieldType: "Heavy", acBonus: 2, checkPenalty: -2, spellFailure: 15 },
  "Heavy Steel Shield": { shieldType: "Heavy", acBonus: 2, checkPenalty: -2, spellFailure: 15 },
  "Tower Shield": { shieldType: "Tower", acBonus: 4, checkPenalty: -10, spellFailure: 50 },
};

/** The armor type `armorTypeName`'s definition: none for a name the table doesn't have. */
export function getArmorDefinition(armorTypeName: string): ArmorDefinition | undefined {
  return ARMOR_TYPE_DEFINITIONS[armorTypeName];
}

/** The shield type `shieldTypeName`'s definition: none for a name the table doesn't have. */
export function getShieldDefinition(shieldTypeName: string): ShieldDefinition | undefined {
  return SHIELD_TYPE_DEFINITIONS[shieldTypeName];
}
