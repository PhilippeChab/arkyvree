/**
 * What a background gives, as the SRD 5.2.1's backgrounds do: three abilities, which a character raises by 2 and 1, or
 * each by 1 (to 20 at most), an Origin feat, two skill proficiencies, a tool proficiency and its equipment.
 */

/** The ways a background's ability score increases spread over its three abilities: +2 and +1, or +1 to each. */
export const BACKGROUND_ABILITY_INCREASES = [
  [2, 1],
  [1, 1, 1],
] as const;

/** The SRD's backgrounds, as it names them, in its order. */
export const BACKGROUND_NAMES = ["Acolyte", "Criminal", "Sage", "Soldier"];
