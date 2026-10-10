/** How many character levels apart the ability increases come: one at every fourth level. */
export const ABILITY_INCREASE_LEVEL_INTERVAL = 4;
/** The hit die a new class has when its form gives none. */
export const DEFAULT_HIT_DIE = 8;
/** How many character levels apart the general feats come, after the first level's: one at every third level. */
export const GENERAL_FEAT_LEVEL_INTERVAL = 3;
export const HIT_DIE_VALUES = [4, 6, 8, 10, 12] as const;
/** The highest character level: the app has no epic levels. */
export const MAX_CHARACTER_LEVEL = 20;
/** The highest class level: the app has no epic levels, and `klass_levels_level_check` holds the same bound. */
export const MAX_CLASS_LEVEL = 20;
/** The highest base bonus a class level gives a save. */
export const MAX_SAVE_BASE = 12;

/** The fewest hit points a level gives, whatever its Constitution: 1. */
export const MIN_HIT_POINTS_PER_LEVEL = 1;

/** A save's progression by hit dice: a good one's base plus one per two, a poor one's one per three. */
export const SAVE_PROGRESSIONS = {
  good: { base: 2, hitDicePerPoint: 2 },
  poor: { base: 0, hitDicePerPoint: 3 },
} as const;
