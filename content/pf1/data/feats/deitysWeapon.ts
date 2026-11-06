/**
 * The cleric's deity's favored weapon, one feat per weapon: a cleric is proficient with her deity's favored weapon, which
 * she picks in the Deity's Favored Weapon pool her class feature gives a pick in, and gets its proficiency with it.
 */

import { grantFeat } from "@/content/pf1/builders/feats/possession.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { FEAT_GENERATED } from "@/vocabulary/pf1/fields/index.ts";
import { ALL_WEAPONS, WEAPON_TYPE_DEFINITIONS } from "@/vocabulary/pf1/weapons.ts";

/** The pool a cleric picks her deity's favored weapon in. */
const DEITYS_FAVORED_WEAPON = "Deity's Favored Weapon";

/**
 * A favored weapon per weapon, each granting its proficiency ("Martial Weapon Proficiency: Longsword"), by its
 * proficiency: the unarmed strike, which the table doesn't list, is a simple weapon.
 */
export const DEITYS_FAVORED_WEAPON_FEATS: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `${DEITYS_FAVORED_WEAPON}: ${w}`,
  description: `Your deity's favored weapon is the ${w.toLowerCase()}: you are proficient with it.`,
  fields: { [FEAT_GENERATED]: true },
  aptitudes: [DEITYS_FAVORED_WEAPON],
  modifiers: [grantFeat(`${WEAPON_TYPE_DEFINITIONS[w]?.proficiency ?? "Simple"} Weapon Proficiency: ${w}`)],
}));
