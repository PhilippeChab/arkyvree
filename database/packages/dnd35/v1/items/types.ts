import { getArmorDefinition, getShieldDefinition } from "@/server/rulesets/dnd3.5/hooks/generators/armorGenerator.ts";
import { getWeaponDefinition } from "@/server/rulesets/dnd3.5/hooks/generators/weaponGenerator.ts";
import type { SLOT_OPTIONS } from "@/shared/dnd3.5/items.ts";
import { eq, feat, or } from "@/database/packages/dnd35/v1/feats/types.ts";

export type Slot = (typeof SLOT_OPTIONS)[number];
export type RequirementCondition = { target: string; operator: string; value: string; valueType: string };
export type RequirementGroup = { chainingOperator: "and" | "or"; children: RequirementEntry[] };
export type RequirementEntry = RequirementCondition | RequirementGroup;

export interface ItemDef {
  name: string;
  description: string;
  weight: string;
  costGp: string;
  type: string;
  slot?: Slot;
  properties: { type: string; value: string }[];
  sourceItem?: string;
  requirements?: RequirementEntry[];
  modifiers?: { target: string; operator: string; value: string; valueType: string }[];
}

function proficiency(featName: string): RequirementEntry[] {
  return [eq(feat(featName))];
}

export const simple = (w: string): RequirementEntry[] => [
  or(eq(feat("Simple Weapon Proficiency")), eq(feat(`Simple Weapon Proficiency: ${w}`))),
];
export const martial = (w: string): RequirementEntry[] => [
  or(eq(feat("Martial Weapon Proficiency")), eq(feat(`Martial Weapon Proficiency: ${w}`))),
];
export const exotic = (w: string) => proficiency(`Exotic Weapon Proficiency: ${w}`);
export function weaponProperties(weaponTypeName: string): { type: string; value: string }[] {
  const def = getWeaponDefinition(weaponTypeName);
  if (!def) throw new Error(`Unknown weapon type: ${weaponTypeName}`);

  const props: { type: string; value: string }[] = [
    { type: "WEAPON_PROFICIENCY", value: def.proficiency },
    { type: "WEAPON_FAMILY", value: def.family },
    { type: "WEAPON_BASE_DAMAGE", value: def.baseDamage },
    { type: "WEAPON_CRITICAL_RANGE", value: String(def.criticalRange) },
    { type: "WEAPON_CRITICAL_MULTIPLIER", value: String(def.criticalMultiplier) },
    ...def.damageTypes.map((dt) => ({ type: "DAMAGE_TYPE", value: dt })),
    { type: "WEAPON_SIZE", value: def.size },
    { type: "WEAPON_FINESSABLE", value: def.finessable ? "true" : "false" },
    { type: "WEAPON_TYPE", value: weaponTypeName },
  ];

  if (def.range && def.range > 0) {
    props.push({ type: "WEAPON_RANGE", value: String(def.range) });
  }
  if (def.reach && def.reach > 0) {
    props.push({ type: "WEAPON_REACH", value: String(def.reach) });
  }

  return props;
}

export const LIGHT_ARMOR_PROF = proficiency("Armor Proficiency (Light)");
export const MEDIUM_ARMOR_PROF = proficiency("Armor Proficiency (Medium)");
export const HEAVY_ARMOR_PROF = proficiency("Armor Proficiency (Heavy)");
export const SHIELD_PROF = proficiency("Shield Proficiency");
export const TOWER_SHIELD_PROF = proficiency("Tower Shield Proficiency");

export function armorProperties(armorTypeName: string): { type: string; value: string }[] {
  const def = getArmorDefinition(armorTypeName);
  if (!def) throw new Error(`Unknown armor type: ${armorTypeName}`);

  return [
    { type: "ARMOR_PROFICIENCY", value: def.armorType },
    { type: "ARMOR_TYPE", value: armorTypeName },
    { type: "ARMOR_AC_BONUS", value: String(def.acBonus) },
    { type: "ARMOR_MAX_DEX", value: String(def.maxDex) },
    { type: "ARMOR_CHECK_PENALTY", value: String(def.checkPenalty) },
    { type: "ITEM_SPELL_FAILURE", value: String(def.spellFailure) },
  ];
}

export function shieldProperties(shieldTypeName: string): { type: string; value: string }[] {
  const def = getShieldDefinition(shieldTypeName);
  if (!def) throw new Error(`Unknown shield type: ${shieldTypeName}`);

  return [
    { type: "SHIELD_PROFICIENCY", value: def.shieldType },
    { type: "SHIELD_TYPE", value: shieldTypeName },
    { type: "SHIELD_AC_BONUS", value: String(def.acBonus) },
    { type: "ARMOR_CHECK_PENALTY", value: String(def.checkPenalty) },
    { type: "ITEM_SPELL_FAILURE", value: String(def.spellFailure) },
  ];
}
