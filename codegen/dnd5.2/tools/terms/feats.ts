/**
 * What the feats give past their text: the pool each category's feats are picked in, the pools that take any feat a
 * character qualifies for, and the modifiers of the feats a sheet reads a number of (Alert's initiative, the fighting
 * styles' attack, Armor Class and off-hand damage, Skilled's skill picks).
 */

import { bonus, setFlag } from "@/content/core/builders/customization/modifiers.ts";
import type { ModifierSeed, RequirementCondition } from "@/content/core/builders/customization/types.ts";
import { poolRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import { stripSeparators } from "@/shared/text.ts";
import {
  ABILITY_SCORE_IMPROVEMENT_POOL,
  type FEAT_CATEGORIES,
  SKILL_PROFICIENCIES_POOL,
} from "@/vocabulary/dnd5.2/feats.ts";
import { WEAPON_DEFINITIONS, WEAPON_NAMES } from "@/vocabulary/dnd5.2/weapons.ts";

/** A feat's category, as the vocabulary names it, which its pool is by (`FEAT_CATEGORY_POOLS`). */
export type FeatCategory = (typeof FEAT_CATEGORIES)[number];

/** Armor worn, of any category: what the Defense style's Armor Class requires. */
const ARMORED: RequirementCondition = {
  target: "combat.armor.category",
  operator: "not_equal",
  value: "none",
  valueType: "string",
};

/**
 * The pools that take any feat a character qualifies for, past its category's: an Ability Score Improvement's ("the
 * Ability Score Improvement feat or another feat of your choice for which you qualify") and an Epic Boon's ("an Epic
 * Boon feat or another feat of your choice for which you qualify").
 */
export const ANY_FEAT_POOLS: string[] = [ABILITY_SCORE_IMPROVEMENT_POOL, "Epic Boon"];

/** Each feat's category, by the category the database names it with. */
export const CATEGORIES_BY_TYPE: Readonly<Record<string, FeatCategory>> = {
  origin: "Origin",
  general: "General",
  "fighting-style": "Fighting Style",
  "epic-boon": "Epic Boon",
};

/**
 * The modifiers of the feats a sheet reads a number of, by name: Alert's Proficiency Bonus to Initiative, Archery's
 * +2 to hit with each ranged weapon, Defense's +1 to Armor Class in armor, Skilled's three skill picks (its tools left
 * to its text), Two-Weapon Fighting's ability modifier to an off-hand attack's damage.
 */
export const FEAT_MODIFIERS: Readonly<Record<string, ModifierSeed[]>> = {
  Alert: [bonus("combat.initiative.misc", "{{ [combat.proficiency.total] }}")],
  Archery: WEAPON_NAMES.filter((weapon) => WEAPON_DEFINITIONS[weapon]!.ranged).map((weapon) =>
    bonus(`items.weapons.${stripSeparators(weapon)}.tohit.misc`, 2),
  ),
  Defense: [{ ...bonus("combat.ac.misc", 1), requirements: [ARMORED] }],
  Skilled: [poolRoom(SKILL_PROFICIENCIES_POOL, 3)],
  "Two-Weapon Fighting": [setFlag("combat.twoweapon.ability")],
};
