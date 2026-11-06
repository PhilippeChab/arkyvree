/**
 * The core rules' feats no reference lists, or that the content writes whole for every option: the wizard's arcane
 * schools, the weapon, armor and shield proficiencies, Weapon Focus for a ray or a grapple, the cleric's deity's favored
 * weapon, the favored enemies, and a race's ability score of its player's choice.
 */

import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import type { WizardSchoolSeed } from "@/content/pf1/builders/wizardSchools/types.ts";
import { WIZARD_SCHOOLS } from "@/content/pf1/data/wizardSchools.ts";

import { ARMOR_PROFICIENCY_FEATS, SHIELD_PROFICIENCY_FEATS } from "./armor.ts";
import { DEITYS_FAVORED_WEAPON_FEATS } from "./deitysWeapon.ts";
import { FAVORED_ENEMY_FEATS } from "./favoredEnemy.ts";
import { RACIAL_ABILITY_SCORE_FEATS } from "./racialAbilityScore.ts";
import { SPECIAL_WEAPON_FOCUS_FEATS, WEAPON_PROFICIENCY_FEATS } from "./weapons.ts";
import { buildWizardSchoolFeats } from "./wizardSchools.ts";

/**
 * The core rules' hand-written feats, those of its arcane schools (`wizardSchools`, the Core Rulebook's by default:
 * the codegen, which reads this module alone of the hand-written data, gets them so) among them.
 */
export function buildCoreFeats(wizardSchools: WizardSchoolSeed[] = WIZARD_SCHOOLS): FeatSeed[] {
  return [
    ...buildWizardSchoolFeats(wizardSchools),
    ...WEAPON_PROFICIENCY_FEATS,
    ...ARMOR_PROFICIENCY_FEATS,
    ...SHIELD_PROFICIENCY_FEATS,
    ...SPECIAL_WEAPON_FOCUS_FEATS,
    ...DEITYS_FAVORED_WEAPON_FEATS,
    ...FAVORED_ENEMY_FEATS,
    ...RACIAL_ABILITY_SCORE_FEATS,
  ];
}
