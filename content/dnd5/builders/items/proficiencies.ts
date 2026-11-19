/**
 * Being proficient with a weapon, or trained with an armor or the Shield: the requirements an item is written with,
 * which the engine reads of the item a character holds (its template's, for a magic one) to tell whether its Proficiency
 * Bonus adds to the weapon's attacks, and whether the armor or the Shield hinders it.
 */

import { eq, or } from "@/content/core/builders/customization/requirements.ts";
import type { RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { feat } from "@/content/dnd5/builders/feats/possession.ts";
import { armorTraining, weaponProficiency } from "@/content/dnd5/builders/feats/proficiencies.ts";

export const HEAVY_ARMOR_TRAINING: RequirementEntry[] = [eq(feat(armorTraining("Heavy Armor")))];
export const LIGHT_ARMOR_TRAINING: RequirementEntry[] = [eq(feat(armorTraining("Light Armor")))];
export const MEDIUM_ARMOR_TRAINING: RequirementEntry[] = [eq(feat(armorTraining("Medium Armor")))];
export const SHIELD_TRAINING: RequirementEntry[] = [eq(feat(armorTraining("Shields")))];

/** Being proficient with a weapon of a category (`category`): with them all, or with it alone. */
function proficiency(category: "Martial" | "Simple", weapon: string): RequirementEntry[] {
  return [or(eq(feat(weaponProficiency(`${category} Weapons`))), eq(feat(weaponProficiency(weapon))))];
}

/** Being proficient with a Martial weapon: with them all, or with it alone (a rogue's Rapier). */
export function martial(weapon: string): RequirementEntry[] {
  return proficiency("Martial", weapon);
}

/** Being proficient with a Simple weapon: with them all, or with it alone. */
export function simple(weapon: string): RequirementEntry[] {
  return proficiency("Simple", weapon);
}
