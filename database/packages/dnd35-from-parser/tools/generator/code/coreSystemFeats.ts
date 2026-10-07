/** The core rules' system feats: the feats no reference lists, which the core rules' feat files add. */

import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { wizardSchoolFeats } from "@/database/packages/dnd35/content/wizardSchools/schoolFeats.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";
import { favoredEnemyFeats } from "@/database/packages/dnd35/data/feats/favoredEnemy.ts";
import { spellWeaponFocusFeats, weaponProficiencyFeats } from "@/database/packages/dnd35/data/feats/weapons.ts";

/**
 * The feats no reference lists that the core rules' feat files add, each: its file and export, the content code the
 * generated file builds it with (and the names that code uses), and the feats that code builds.
 */
export const CORE_SYSTEM_FEATS: {
  file: string;
  name: string;
  code: string;
  uses: string[];
  build: (wizardSchools: WizardSchoolSeed[]) => FeatSeed[];
}[] = [
  {
    file: "feats.ts",
    name: "WIZARD_SCHOOL_FEATS",
    code: "wizardSchoolFeats(WIZARD_SCHOOLS)",
    uses: ["wizardSchoolFeats", "WIZARD_SCHOOLS"],
    build: wizardSchoolFeats,
  },
  {
    file: "feats.ts",
    name: "WEAPON_PROFICIENCY_FEATS",
    code: "weaponProficiencyFeats",
    uses: ["weaponProficiencyFeats"],
    build: () => weaponProficiencyFeats,
  },
  {
    file: "feats.ts",
    name: "SPELL_WEAPON_FOCUS_FEATS",
    code: "spellWeaponFocusFeats",
    uses: ["spellWeaponFocusFeats"],
    build: () => spellWeaponFocusFeats,
  },
  {
    file: "favoredEnemy.ts",
    name: "favoredEnemy",
    code: "favoredEnemyFeats",
    uses: ["favoredEnemyFeats"],
    build: () => favoredEnemyFeats,
  },
];

/** The core rules' system feats (the wizard's school choice, the weapon proficiencies, Weapon Focus for spells, the favored enemies). */
export function buildCoreSystemFeats(wizardSchools: WizardSchoolSeed[]): FeatSeed[] {
  return CORE_SYSTEM_FEATS.flatMap(({ build }) => build(wizardSchools));
}
