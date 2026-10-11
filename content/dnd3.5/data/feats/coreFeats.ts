/**
 * The core rules' feats no reference lists: the wizard's school choice, a proficiency per simple and martial weapon,
 * Weapon Focus for spells, and the favored enemies.
 */

import type { FeatSeed } from "@/content/core/builders/feats/types.ts";
import type { WizardSchoolSeed } from "@/content/dnd3.5/builders/wizardSchools/types.ts";

import { FAVORED_ENEMY_FEATS } from "./favoredEnemy.ts";
import { SPELL_WEAPON_FOCUS_FEATS, WEAPON_PROFICIENCY_FEATS } from "./weapons.ts";
import { buildWizardSchoolFeats } from "./wizardSchools.ts";

/** The core rules' hand-written feats, those of its wizard schools (`wizardSchools`) among them. */
export function buildCoreFeats(wizardSchools: WizardSchoolSeed[]): FeatSeed[] {
  return [
    ...buildWizardSchoolFeats(wizardSchools),
    ...WEAPON_PROFICIENCY_FEATS,
    ...SPELL_WEAPON_FOCUS_FEATS,
    ...FAVORED_ENEMY_FEATS,
  ];
}
