/**
 * A race's ability score of its player's choice, one feat per ability: a human, a half-elf or a half-orc gets +2 to one
 * ability score, which its player picks at 1st level in the Racial Ability Score pool its race gives a pick in.
 */

import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { FEAT_GENERATED } from "@/vocabulary/pf1/fields/index.ts";
import { RACIAL_ABILITY_POOL } from "@/vocabulary/pf1/races.ts";

/** A feat per ability, each +2 to it, as the race's own adjustments are written. */
export const RACIAL_ABILITY_SCORE_FEATS: FeatSeed[] = ABILITY_NAMES.map((ability) => ({
  name: `${RACIAL_ABILITY_POOL}: ${ability}`,
  description: `Your race's +2 to one ability score of your choice goes to ${ability}.`,
  fields: { [FEAT_GENERATED]: true },
  aptitudes: [RACIAL_ABILITY_POOL],
  modifiers: [bonus(`abilities.${ability.toLowerCase()}.misc`, 2)],
}));
