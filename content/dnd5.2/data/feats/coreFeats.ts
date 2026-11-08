/**
 * The core rules' feats no reference lists: the proficiencies a class grants (its saving throws, its armor training,
 * its weapons), each weapon's mastery, the sacred roles a cleric's and a druid's orders choose between, and the
 * options a paladin's and a ranger's Fighting Style give in place of a feat.
 */

import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";

import { FIGHTING_STYLE_OPTION_FEATS } from "./fightingStyleOptions.ts";
import { ARMOR_TRAINING_FEATS, SAVING_THROW_PROFICIENCY_FEATS, WEAPON_PROFICIENCY_FEATS } from "./proficiencies.ts";
import { DIVINE_ORDER_FEATS, PRIMAL_ORDER_FEATS } from "./sacredOrders.ts";
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
    ...DIVINE_ORDER_FEATS,
    ...PRIMAL_ORDER_FEATS,
    ...FIGHTING_STYLE_OPTION_FEATS,
  ];
}
