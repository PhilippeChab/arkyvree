/**
 * The core rules' feats no reference lists: the proficiencies a class grants (its saving throws, its armor training,
 * its weapons) and each weapon's mastery.
 */

import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";

import { ARMOR_TRAINING_FEATS, SAVING_THROW_PROFICIENCY_FEATS, WEAPON_PROFICIENCY_FEATS } from "./proficiencies.ts";
import { WEAPON_MASTERY_FEATS } from "./weaponMastery.ts";

/**
 * The core rules' hand-written feats, which the package seeds beside the generated book's, and the codegen reads (it
 * reads this module alone of the hand-written data) for the pools they name and the feats a grant may name.
 */
export function buildCoreFeats(): FeatSeed[] {
  return [
    ...SAVING_THROW_PROFICIENCY_FEATS,
    ...ARMOR_TRAINING_FEATS,
    ...WEAPON_PROFICIENCY_FEATS,
    ...WEAPON_MASTERY_FEATS,
  ];
}
