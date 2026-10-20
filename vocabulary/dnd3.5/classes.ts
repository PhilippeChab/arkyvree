/** A class's caster type: the magic its spells are, arcane or divine. */
export type CasterType = (typeof CASTER_TYPES)[number];

/** How many character levels apart the ability increases come in the core rules: one at every fourth level. */
export const ABILITY_INCREASE_LEVEL_INTERVAL = 4;
/**
 * A class's base attack bonus progression by class level: `points` a `levels` levels, rounded down: a good one's as
 * fast as its level, a medium one's three quarters of it, a poor one's half.
 */
export const BAB_PROGRESSIONS = {
  good: { levels: 1, points: 1 },
  medium: { levels: 4, points: 3 },
  poor: { levels: 2, points: 1 },
} as const;
/** The caster types a class's spells are of. */
export const CASTER_TYPES = ["Arcane", "Divine"] as const;
/** The hit die a new class has when its form gives none. */
export const DEFAULT_HIT_DIE = 8;
/** The feats a character's first level gives to pick in the core rules, past its frequency's. */
export const FIRST_LEVEL_GENERAL_FEATS = 1;
/** How many character levels apart the general feats come in the core rules: one at every third level. */
export const GENERAL_FEAT_LEVEL_INTERVAL = 3;
export const HIT_DIE_VALUES = [4, 6, 8, 10, 12] as const;
/** The highest character level: the app has no epic levels. */
export const MAX_CHARACTER_LEVEL = 20;
/** The highest class level: the app has no epic levels, and `klass_levels_level_check` holds the same bound. */
export const MAX_CLASS_LEVEL = 20;
/** The most feats a ruleset's Settings may have a character level give: a bound of the app's, no book's. */
export const MAX_GENERAL_FEATS_PER_LEVEL = 10;
/** The highest base bonus a class level gives a save. */
export const MAX_SAVE_BASE = 12;
/** The most picks in a pool, or spells at a spell level, a class's table gives by a level: a bound of the app's. */
export const MAX_TABLE_COUNT = 99;

/** The fewest hit points a level gives, whatever its Constitution: 1. */
export const MIN_HIT_POINTS_PER_LEVEL = 1;

/** A save's progression by hit dice: a good one's base plus one per two, a poor one's one per three. */
export const SAVE_PROGRESSIONS = {
  good: { base: 2, hitDicePerPoint: 2 },
  poor: { base: 0, hitDicePerPoint: 3 },
} as const;
